import { z } from "zod";
import { and, desc, eq, gte, like, lte, or, sql, count } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { accounts, transactions } from "../database/schema";
import { decryptOptional, encryptOptional } from "../lib/crypto";
import { CATEGORIES, categorize } from "../lib/categories";
import { detectRecurring } from "../lib/recurring";
import { evaluateAlerts } from "../lib/alerts";
import { monthRange } from "../lib/money";

const category = z.enum(CATEGORIES);

/** Applies a signed amount to a manual account balance. */
async function applyToBalance(accountId: string, userId: string, amount: number) {
  const [acc] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  if (!acc) throw new ORPCError("NOT_FOUND", { message: "Conta não encontrada" });
  if (acc.type === "credit") {
    // Card: a purchase (negative) increases the used amount and lowers the available limit.
    await db
      .update(accounts)
      .set({
        balance: acc.balance - amount,
        availableLimit: acc.availableLimit != null ? acc.availableLimit + amount : acc.availableLimit,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, acc.id));
  } else {
    await db
      .update(accounts)
      .set({ balance: acc.balance + amount, updatedAt: new Date() })
      .where(eq(accounts.id, acc.id));
  }
  return acc;
}

export const transactionsRouter = {
  list: authed
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        category: z.string().optional(),
        accountId: z.string().optional(),
        search: z.string().max(80).optional(),
        kind: z.enum(["all", "in", "out"]).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(30),
      }),
    )
    .handler(async ({ context, input }) => {
      const conds = [eq(transactions.userId, context.user.id)];
      if (input.month) {
        const { from, to } = monthRange(input.month);
        conds.push(gte(transactions.date, from), lte(transactions.date, to));
      }
      if (input.category) conds.push(eq(transactions.category, input.category));
      if (input.accountId) conds.push(eq(transactions.accountId, input.accountId));
      if (input.kind === "in") conds.push(sql`${transactions.amount} > 0`);
      if (input.kind === "out") conds.push(sql`${transactions.amount} < 0`);
      if (input.search) {
        const q = `%${input.search}%`;
        conds.push(or(like(transactions.description, q), like(transactions.merchant, q))!);
      }
      const where = and(...conds);
      const [rows, [totals]] = await Promise.all([
        db
          .select({
            id: transactions.id,
            description: transactions.description,
            merchant: transactions.merchant,
            amount: transactions.amount,
            date: transactions.date,
            category: transactions.category,
            categorySource: transactions.categorySource,
            isRecurring: transactions.isRecurring,
            installmentNumber: transactions.installmentNumber,
            totalInstallments: transactions.totalInstallments,
            source: transactions.source,
            notesEnc: transactions.notesEnc,
            accountId: transactions.accountId,
            accountName: accounts.name,
            accountType: accounts.type,
            institution: accounts.institution,
          })
          .from(transactions)
          .innerJoin(accounts, eq(accounts.id, transactions.accountId))
          .where(where)
          .orderBy(desc(transactions.date), desc(transactions.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        db
          .select({
            total: count(),
            income: sql<number>`coalesce(sum(case when ${transactions.amount} > 0 then ${transactions.amount} else 0 end), 0)`,
            expense: sql<number>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)`,
          })
          .from(transactions)
          .where(where),
      ]);
      return {
        items: rows.map(({ notesEnc, ...r }) => ({ ...r, notes: decryptOptional(notesEnc) })),
        total: totals?.total ?? 0,
        income: Number(totals?.income ?? 0),
        expense: Number(totals?.expense ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  create: authed
    .input(
      z.object({
        accountId: z.string(),
        description: z.string().min(1).max(120),
        amount: z.number().int().refine((v) => v !== 0, "Valor não pode ser zero"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        category: category.optional(),
        notes: z.string().max(500).optional(),
        totalInstallments: z.number().int().min(1).max(48).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const [acc] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, context.user.id)));
      if (!acc) throw new ORPCError("NOT_FOUND", { message: "Conta não encontrada" });
      if (acc.connectionId)
        throw new ORPCError("BAD_REQUEST", {
          message: "Contas conectadas via Open Finance são atualizadas automaticamente pelo banco.",
        });
      const cat =
        input.category ??
        categorize({ description: input.description, amount: input.amount, providerCategory: null });
      const [t] = await db
        .insert(transactions)
        .values({
          userId: context.user.id,
          accountId: acc.id,
          description: input.description,
          amount: input.amount,
          date: input.date,
          category: cat,
          categorySource: input.category ? "user" : "auto",
          notesEnc: encryptOptional(input.notes ?? null),
          totalInstallments: input.totalInstallments && input.totalInstallments > 1 ? input.totalInstallments : null,
          installmentNumber: input.totalInstallments && input.totalInstallments > 1 ? 1 : null,
          source: "manual",
        })
        .returning({ id: transactions.id });
      await applyToBalance(acc.id, context.user.id, input.amount);
      await evaluateAlerts(context.user.id);
      return { id: t!.id, category: cat };
    }),

  update: authed
    .input(z.object({ id: z.string(), category: category.optional(), notes: z.string().max(500).nullable().optional() }))
    .handler(async ({ context, input }) => {
      const set: Partial<typeof transactions.$inferInsert> = {};
      if (input.category) {
        set.category = input.category;
        set.categorySource = "user";
      }
      if (input.notes !== undefined) set.notesEnc = encryptOptional(input.notes);
      if (!Object.keys(set).length) return { ok: true };
      await db
        .update(transactions)
        .set(set)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, context.user.id)));
      await evaluateAlerts(context.user.id);
      return { ok: true };
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ context, input }) => {
    const [t] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, input.id), eq(transactions.userId, context.user.id)));
    if (!t) throw new ORPCError("NOT_FOUND");
    if (t.source !== "manual")
      throw new ORPCError("BAD_REQUEST", { message: "Transações do banco não podem ser excluídas." });
    await db.delete(transactions).where(eq(transactions.id, t.id));
    await applyToBalance(t.accountId, context.user.id, -t.amount);
    await evaluateAlerts(context.user.id);
    return { ok: true };
  }),

  recurring: authed.handler(async ({ context }) => {
    const items = await detectRecurring(context.user.id);
    const monthlyTotal = items.reduce((s, i) => s + i.averageAmount, 0);
    return { items, monthlyTotal };
  }),
};
