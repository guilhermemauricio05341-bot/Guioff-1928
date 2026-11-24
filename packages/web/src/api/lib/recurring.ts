import { and, eq, gte } from "drizzle-orm";
import { db } from "../database";
import { transactions } from "../database/schema";
import { isSubscriptionLike } from "./categories";
import { shiftMonth, monthKey } from "./money";

export function normalizeMerchant(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d{2}\/\d{2}/g, "")
    .replace(/parc(ela)?\s*\d+\s*\/\s*\d+/g, "")
    .replace(/[*\-_.#]/g, " ")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

export interface RecurringItem {
  key: string;
  name: string;
  category: string;
  averageAmount: number; // cents (positive)
  lastAmount: number;
  occurrences: number;
  lastDate: string;
  dayOfMonth: number;
  isSubscription: boolean;
  nextExpected: string;
}

/**
 * Detects recurring payments: same normalized merchant in 2+ distinct months with
 * similar amounts (±20%), or a known subscription merchant. Marks matching
 * transactions as recurring.
 */
export async function detectRecurring(userId: string): Promise<RecurringItem[]> {
  const since = `${shiftMonth(monthKey(), -6)}-01`;
  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      merchant: transactions.merchant,
      amount: transactions.amount,
      date: transactions.date,
      category: transactions.category,
      totalInstallments: transactions.totalInstallments,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.date, since)));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.amount >= 0 || (r.totalInstallments ?? 0) > 1) continue;
    if (r.category === "transferencias" || r.category === "investimentos") continue;
    const key = normalizeMerchant(r.merchant || r.description);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const result: RecurringItem[] = [];
  const recurringIds: string[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    const amounts = list.map((t) => -t.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const similar = amounts.every((a) => Math.abs(a - avg) <= avg * 0.2);
    const sub = isSubscriptionLike(`${list[0]!.description} ${list[0]!.merchant ?? ""}`);
    const recurring = (months.size >= 2 && similar && list.length <= months.size + 1) || (sub && months.size >= 1);
    if (!recurring) continue;
    const last = list[list.length - 1]!;
    const day = Number(last.date.slice(8, 10));
    const nextMonth = shiftMonth(last.date.slice(0, 7), 1);
    result.push({
      key,
      name: last.merchant || last.description,
      category: sub ? "assinaturas" : last.category,
      averageAmount: Math.round(avg),
      lastAmount: -last.amount,
      occurrences: list.length,
      lastDate: last.date,
      dayOfMonth: day,
      isSubscription: sub || last.category === "assinaturas",
      nextExpected: `${nextMonth}-${String(Math.min(day, 28)).padStart(2, "0")}`,
    });
    recurringIds.push(...list.map((t) => t.id));
  }

  if (recurringIds.length) {
    for (let i = 0; i < recurringIds.length; i += 200) {
      const chunk = recurringIds.slice(i, i + 200);
      await Promise.all(
        chunk.map((id) => db.update(transactions).set({ isRecurring: true }).where(eq(transactions.id, id))),
      );
    }
  }
  return result.sort((a, b) => b.averageAmount - a.averageAmount);
}
