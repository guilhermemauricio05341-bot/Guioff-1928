import { and, eq, gte, lte, lt } from "drizzle-orm";
import { db } from "../database";
import { alerts, bills, budgets, transactions, accounts } from "../database/schema";
import { brl, monthKey, monthRange, todayISO } from "./money";
import { CATEGORY_LABELS } from "./labels";

async function push(userId: string, dedupeKey: string, level: string, title: string, message: string) {
  await db
    .insert(alerts)
    .values({ userId, dedupeKey, level, title, message })
    .onConflictDoNothing();
}

/** Re-evaluates budget limits, upcoming bills and card limits, creating deduplicated alerts. */
export async function evaluateAlerts(userId: string) {
  const month = monthKey();
  const { from, to } = monthRange(month);
  const [limits, monthTx] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.userId, userId)),
    db
      .select({ amount: transactions.amount, category: transactions.category })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), gte(transactions.date, from), lte(transactions.date, to))),
  ]);
  const spent = new Map<string, number>();
  for (const t of monthTx) if (t.amount < 0) spent.set(t.category, (spent.get(t.category) ?? 0) - t.amount);

  for (const b of limits) {
    const s = spent.get(b.category) ?? 0;
    const pct = b.limitAmount > 0 ? s / b.limitAmount : 0;
    const label = CATEGORY_LABELS[b.category] ?? b.category;
    if (pct >= 1)
      await push(userId, `budget:${b.category}:${month}:100`, "danger", `Limite estourado: ${label}`,
        `Você gastou ${brl(s)} de ${brl(b.limitAmount)} em ${label} este mês (${Math.round(pct * 100)}%).`);
    else if (pct >= 0.8)
      await push(userId, `budget:${b.category}:${month}:80`, "warning", `Atenção com ${label}`,
        `Você já usou ${Math.round(pct * 100)}% do limite de ${label} (${brl(s)} de ${brl(b.limitAmount)}).`);
  }

  // Bills due in the next 3 days
  const today = todayISO();
  const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const due = await db
    .select()
    .from(bills)
    .where(and(eq(bills.userId, userId), eq(bills.paid, false), lte(bills.dueDate, in3)));
  for (const b of due) {
    const overdue = b.dueDate < today;
    await push(userId, `bill:${b.id}:${b.dueDate}:${overdue ? "late" : "soon"}`, overdue ? "danger" : "warning",
      overdue ? `Conta em atraso: ${b.name}` : `Vencimento próximo: ${b.name}`,
      `${b.name} de ${brl(b.amount)} ${overdue ? "venceu" : "vence"} em ${b.dueDate.split("-").reverse().join("/")}.`);
  }

  // Credit cards above 80% usage
  const cards = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.type, "credit")));
  for (const c of cards) {
    if (!c.creditLimit) continue;
    const used = c.availableLimit != null ? c.creditLimit - c.availableLimit : c.balance;
    if (used / c.creditLimit >= 0.8)
      await push(userId, `card:${c.id}:${month}:80`, "warning", `Cartão ${c.name} quase no limite`,
        `Você já utilizou ${Math.round((used / c.creditLimit) * 100)}% do limite de ${brl(c.creditLimit)}.`);
  }

  // Negative checking balance
  const negatives = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), lt(accounts.balance, 0)));
  for (const a of negatives)
    if (a.type !== "credit")
      await push(userId, `negative:${a.id}:${today}`, "danger", `Saldo negativo em ${a.name}`,
        `A conta ${a.name} está com saldo de ${brl(a.balance)}. Evite juros do cheque especial.`);
}
