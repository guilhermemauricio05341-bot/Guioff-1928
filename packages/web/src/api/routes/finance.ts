import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { alerts, profiles } from "../database/schema";
import { budgetsStatus, financialSummary, recentTransactions, upcomingBills } from "../lib/summary";
import { evaluateAlerts } from "../lib/alerts";
import { monthKey } from "../lib/money";

function riskFromScore(score: number) {
  if (score <= 8) return "conservador";
  if (score <= 14) return "moderado";
  return "arrojado";
}

export const financeRouter = {
  dashboard: authed
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).optional())
    .handler(async ({ context, input }) => {
      const month = input?.month ?? monthKey();
      const [summary, recent, bills, budgets] = await Promise.all([
        financialSummary(context.user.id, month),
        recentTransactions(context.user.id, 8),
        upcomingBills(context.user.id, 30),
        budgetsStatus(context.user.id, month),
      ]);
      return { summary, recent, bills, budgets };
    }),

  alerts: authed.handler(async ({ context }) => {
    await evaluateAlerts(context.user.id);
    const rows = await db
      .select()
      .from(alerts)
      .where(eq(alerts.userId, context.user.id))
      .orderBy(desc(alerts.createdAt))
      .limit(40);
    return { items: rows, unread: rows.filter((r) => !r.read).length };
  }),

  markAlertsRead: authed
    .input(z.object({ id: z.string().optional() }))
    .handler(async ({ context, input }) => {
      const conds = [eq(alerts.userId, context.user.id)];
      if (input.id) conds.push(eq(alerts.id, input.id));
      await db.update(alerts).set({ read: true }).where(and(...conds));
      return { ok: true };
    }),

  clearAlerts: authed.handler(async ({ context }) => {
    await db.delete(alerts).where(and(eq(alerts.userId, context.user.id), eq(alerts.read, true)));
    return { ok: true };
  }),

  profile: authed.handler(async ({ context }) => {
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, context.user.id));
    return {
      name: context.user.name,
      email: context.user.email,
      image: context.user.image ?? null,
      riskProfile: p?.riskProfile ?? null,
      riskScore: p?.riskScore ?? null,
      monthlyIncome: p?.monthlyIncome ?? null,
      objectives: p?.objectives ?? null,
      horizonYears: p?.horizonYears ?? null,
    };
  }),

  saveProfile: authed
    .input(
      z.object({
        answers: z.array(z.number().int().min(0).max(4)).length(5).optional(),
        monthlyIncome: z.number().int().min(0).nullable().optional(),
        objectives: z.string().max(500).nullable().optional(),
        horizonYears: z.number().int().min(0).max(60).nullable().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const set: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };
      if (input.answers) {
        const score = input.answers.reduce((s, a) => s + a, 0);
        set.riskScore = score;
        set.riskProfile = riskFromScore(score);
      }
      if (input.monthlyIncome !== undefined) set.monthlyIncome = input.monthlyIncome;
      if (input.objectives !== undefined) set.objectives = input.objectives;
      if (input.horizonYears !== undefined) set.horizonYears = input.horizonYears;
      await db
        .insert(profiles)
        .values({ userId: context.user.id, ...set })
        .onConflictDoUpdate({ target: profiles.userId, set });
      return { riskProfile: set.riskProfile ?? null };
    }),
};
