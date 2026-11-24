import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { bills, budgets, debts, goals } from "../database/schema";
import { budgetsStatus } from "../lib/summary";
import { evaluateAlerts } from "../lib/alerts";
import { CATEGORIES } from "../lib/categories";

const idInput = z.object({ id: z.string() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const goalInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["economia", "objetivo"]).default("economia"),
  targetAmount: z.number().int().positive(),
  currentAmount: z.number().int().min(0).default(0),
  deadline: isoDate.nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

const debtInput = z.object({
  name: z.string().min(1).max(80),
  creditor: z.string().max(80).nullable().optional(),
  totalAmount: z.number().int().positive(),
  installmentAmount: z.number().int().positive(),
  totalInstallments: z.number().int().min(1).max(600),
  paidInstallments: z.number().int().min(0).default(0),
  interestRate: z.number().int().min(0).max(5000).nullable().optional(),
  dueDay: z.number().int().min(1).max(31),
});

const billInput = z.object({
  name: z.string().min(1).max(80),
  amount: z.number().int().positive(),
  dueDate: isoDate,
  category: z.enum(CATEGORIES).default("contas"),
  recurrence: z.enum(["none", "monthly"]).default("none"),
});

function nextMonthDate(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const n = new Date(Date.UTC(y, m, Math.min(d, last)));
  return n.toISOString().slice(0, 10);
}

type Owned = { id: SQLiteColumn; userId: SQLiteColumn };
const own = (t: Owned, userId: string, id: string) => and(eq(t.id, id), eq(t.userId, userId));

export const planningRouter = {
  // ---------- Metas ----------
  goals: authed.handler(({ context }) =>
    db.select().from(goals).where(eq(goals.userId, context.user.id)).orderBy(asc(goals.createdAt)),
  ),
  createGoal: authed.input(goalInput).handler(async ({ context, input }) => {
    const [g] = await db.insert(goals).values({ ...input, userId: context.user.id }).returning({ id: goals.id });
    return g;
  }),
  updateGoal: authed.input(goalInput.partial().extend({ id: z.string() })).handler(async ({ context, input }) => {
    const { id, ...rest } = input;
    await db.update(goals).set(rest).where(own(goals, context.user.id, id));
    return { ok: true };
  }),
  depositGoal: authed
    .input(z.object({ id: z.string(), amount: z.number().int() }))
    .handler(async ({ context, input }) => {
      const [g] = await db.select().from(goals).where(own(goals, context.user.id, input.id));
      if (!g) throw new ORPCError("NOT_FOUND");
      const currentAmount = Math.max(0, g.currentAmount + input.amount);
      await db.update(goals).set({ currentAmount }).where(eq(goals.id, g.id));
      return { currentAmount };
    }),
  removeGoal: authed.input(idInput).handler(async ({ context, input }) => {
    await db.delete(goals).where(own(goals, context.user.id, input.id));
    return { ok: true };
  }),

  // ---------- Dívidas ----------
  debts: authed.handler(({ context }) =>
    db.select().from(debts).where(eq(debts.userId, context.user.id)).orderBy(asc(debts.dueDay)),
  ),
  createDebt: authed.input(debtInput).handler(async ({ context, input }) => {
    const [d] = await db.insert(debts).values({ ...input, userId: context.user.id }).returning({ id: debts.id });
    return d;
  }),
  updateDebt: authed.input(debtInput.partial().extend({ id: z.string() })).handler(async ({ context, input }) => {
    const { id, ...rest } = input;
    await db.update(debts).set(rest).where(own(debts, context.user.id, id));
    return { ok: true };
  }),
  payInstallment: authed
    .input(z.object({ id: z.string(), delta: z.number().int().min(-1).max(1).default(1) }))
    .handler(async ({ context, input }) => {
      const [d] = await db.select().from(debts).where(own(debts, context.user.id, input.id));
      if (!d) throw new ORPCError("NOT_FOUND");
      const paid = Math.min(d.totalInstallments, Math.max(0, d.paidInstallments + input.delta));
      await db.update(debts).set({ paidInstallments: paid }).where(eq(debts.id, d.id));
      return { paidInstallments: paid };
    }),
  removeDebt: authed.input(idInput).handler(async ({ context, input }) => {
    await db.delete(debts).where(own(debts, context.user.id, input.id));
    return { ok: true };
  }),

  // ---------- Vencimentos ----------
  bills: authed.handler(({ context }) =>
    db.select().from(bills).where(eq(bills.userId, context.user.id)).orderBy(asc(bills.dueDate)),
  ),
  createBill: authed.input(billInput).handler(async ({ context, input }) => {
    const [b] = await db.insert(bills).values({ ...input, userId: context.user.id }).returning({ id: bills.id });
    await evaluateAlerts(context.user.id);
    return b;
  }),
  updateBill: authed.input(billInput.partial().extend({ id: z.string() })).handler(async ({ context, input }) => {
    const { id, ...rest } = input;
    await db.update(bills).set(rest).where(own(bills, context.user.id, id));
    await evaluateAlerts(context.user.id);
    return { ok: true };
  }),
  toggleBillPaid: authed.input(idInput).handler(async ({ context, input }) => {
    const [b] = await db.select().from(bills).where(own(bills, context.user.id, input.id));
    if (!b) throw new ORPCError("NOT_FOUND");
    const paid = !b.paid;
    await db.update(bills).set({ paid }).where(eq(bills.id, b.id));
    // Monthly bills roll over: paying one schedules next month's.
    if (paid && b.recurrence === "monthly") {
      const next = nextMonthDate(b.dueDate);
      const [exists] = await db
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.userId, b.userId), eq(bills.name, b.name), eq(bills.dueDate, next)));
      if (!exists)
        await db.insert(bills).values({
          userId: b.userId,
          name: b.name,
          amount: b.amount,
          dueDate: next,
          category: b.category,
          recurrence: "monthly",
        });
    }
    return { paid };
  }),
  removeBill: authed.input(idInput).handler(async ({ context, input }) => {
    await db.delete(bills).where(own(bills, context.user.id, input.id));
    return { ok: true };
  }),

  // ---------- Limites por categoria ----------
  budgets: authed.handler(({ context }) => budgetsStatus(context.user.id)),
  upsertBudget: authed
    .input(z.object({ category: z.enum(CATEGORIES), limitAmount: z.number().int().positive() }))
    .handler(async ({ context, input }) => {
      await db
        .insert(budgets)
        .values({ userId: context.user.id, ...input })
        .onConflictDoUpdate({ target: [budgets.userId, budgets.category], set: { limitAmount: input.limitAmount } });
      await evaluateAlerts(context.user.id);
      return { ok: true };
    }),
  removeBudget: authed.input(idInput).handler(async ({ context, input }) => {
    await db.delete(budgets).where(own(budgets, context.user.id, input.id));
    return { ok: true };
  }),
};
