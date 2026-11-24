import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { investments, profiles } from "../database/schema";
import { getMarketRates } from "../lib/market";
import { analyzePortfolio } from "../lib/portfolio";

export const INVESTMENT_TYPES = ["cdb", "tesouro", "lci", "lca", "fundo", "acao", "fii", "cripto", "poupanca", "outro"] as const;

const input = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(INVESTMENT_TYPES),
  institution: z.string().max(80).nullable().optional(),
  investedAmount: z.number().int().min(0),
  currentValue: z.number().int().min(0),
  rateDescription: z.string().max(60).nullable().optional(),
  startDate: z.string().nullable().optional(),
  maturityDate: z.string().nullable().optional(),
});

export const investmentsRouter = {
  list: authed.handler(async ({ context }) => {
    const [items, [profile]] = await Promise.all([
      db.select().from(investments).where(eq(investments.userId, context.user.id)),
      db.select().from(profiles).where(eq(profiles.userId, context.user.id)),
    ]);
    return { items, analysis: analyzePortfolio(items, profile?.riskProfile ?? null) };
  }),

  create: authed.input(input).handler(async ({ context, input }) => {
    const [r] = await db
      .insert(investments)
      .values({ ...input, userId: context.user.id, source: "manual" })
      .returning({ id: investments.id });
    return r;
  }),

  update: authed.input(input.partial().extend({ id: z.string() })).handler(async ({ context, input }) => {
    const [inv] = await db
      .select()
      .from(investments)
      .where(and(eq(investments.id, input.id), eq(investments.userId, context.user.id)));
    if (!inv) throw new ORPCError("NOT_FOUND");
    const { id, ...rest } = input;
    if (inv.connectionId) {
      delete rest.currentValue;
      delete rest.investedAmount;
    }
    await db
      .update(investments)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(investments.id, id), eq(investments.userId, context.user.id)));
    return { ok: true };
  }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ context, input }) => {
    const [inv] = await db
      .select()
      .from(investments)
      .where(and(eq(investments.id, input.id), eq(investments.userId, context.user.id)));
    if (!inv) throw new ORPCError("NOT_FOUND");
    if (inv.connectionId)
      throw new ORPCError("BAD_REQUEST", { message: "Investimentos sincronizados são removidos ao desconectar o banco." });
    await db.delete(investments).where(eq(investments.id, inv.id));
    return { ok: true };
  }),

  marketRates: authed.handler(() => getMarketRates()),
};
