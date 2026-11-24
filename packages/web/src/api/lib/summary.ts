import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../database";
import { accounts, debts, goals, investments, transactions, budgets, bills } from "../database/schema";
import { monthKey, monthRange, shiftMonth } from "./money";

export async function loadAccounts(userId: string) {
  return db.select().from(accounts).where(eq(accounts.userId, userId));
}

export function cardUsed(c: { creditLimit: number | null; availableLimit: number | null; balance: number }) {
  if (c.creditLimit != null && c.availableLimit != null) return Math.max(0, c.creditLimit - c.availableLimit);
  return Math.max(0, c.balance);
}

/** Aggregated monthly numbers used by the dashboard and the AI assistant. */
export async function financialSummary(userId: string, month = monthKey()) {
  const firstMonth = shiftMonth(month, -11);
  const [accs, invs, dbts, txs, gls] = await Promise.all([
    loadAccounts(userId),
    db.select().from(investments).where(eq(investments.userId, userId)),
    db.select().from(debts).where(eq(debts.userId, userId)),
    db
      .select({
        amount: transactions.amount,
        date: transactions.date,
        category: transactions.category,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.date, `${firstMonth}-01`),
          lte(transactions.date, monthRange(month).to),
        ),
      ),
    db.select().from(goals).where(eq(goals.userId, userId)),
  ]);

  const cash = accs.filter((a) => a.type !== "credit");
  const cards = accs.filter((a) => a.type === "credit");
  const totalBalance = cash.reduce((s, a) => s + a.balance, 0);
  const cardDebt = cards.reduce((s, a) => s + cardUsed(a), 0);
  const totalInvested = invs.reduce((s, i) => s + i.currentValue, 0);
  const investedPrincipal = invs.reduce((s, i) => s + i.investedAmount, 0);
  const debtRemaining = dbts.reduce(
    (s, d) => s + Math.max(0, d.totalInstallments - d.paidInstallments) * d.installmentAmount,
    0,
  );
  const netWorth = totalBalance + totalInvested - cardDebt - debtRemaining;

  // Monthly flows (exclude transfers between own accounts and investment movements)
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(shiftMonth(month, -i));
  const flows = new Map(months.map((m) => [m, { income: 0, expense: 0 }]));
  const byCategory = new Map<string, Map<string, number>>();
  for (const t of txs) {
    const m = t.date.slice(0, 7);
    const f = flows.get(m);
    if (!f) continue;
    if (t.category === "transferencias" || t.category === "investimentos") continue;
    if (t.amount > 0) f.income += t.amount;
    else {
      f.expense += -t.amount;
      const cat = byCategory.get(m) ?? new Map<string, number>();
      cat.set(t.category, (cat.get(t.category) ?? 0) - t.amount);
      byCategory.set(m, cat);
    }
  }

  // Net-worth evolution: walk backwards from today's net worth using monthly results.
  const evolution: { month: string; income: number; expense: number; result: number; netWorth: number }[] = [];
  let running = netWorth;
  for (let i = months.length - 1; i >= 0; i--) {
    const m = months[i]!;
    const f = flows.get(m)!;
    evolution.unshift({ month: m, income: f.income, expense: f.expense, result: f.income - f.expense, netWorth: running });
    running -= f.income - f.expense;
  }

  const current = flows.get(month)!;
  const previous = flows.get(shiftMonth(month, -1)) ?? { income: 0, expense: 0 };
  const currentCats = byCategory.get(month) ?? new Map();
  const prevCats = byCategory.get(shiftMonth(month, -1)) ?? new Map();
  const categories = [...new Set([...currentCats.keys(), ...prevCats.keys()])]
    .map((c) => ({ category: c, current: currentCats.get(c) ?? 0, previous: prevCats.get(c) ?? 0 }))
    .sort((a, b) => b.current - a.current);

  const comparison = months.slice(-6).map((m) => {
    const cats = byCategory.get(m) ?? new Map<string, number>();
    return { month: m, total: flows.get(m)!.expense, ...Object.fromEntries(cats) } as Record<string, number | string>;
  });

  return {
    month,
    totalBalance,
    cardDebt,
    totalInvested,
    investedPrincipal,
    debtRemaining,
    netWorth,
    income: current.income,
    expense: current.expense,
    result: current.income - current.expense,
    previousIncome: previous.income,
    previousExpense: previous.expense,
    available: totalBalance - cardDebt,
    evolution,
    categories,
    comparison,
    accountsCount: accs.length,
    goals: gls.map((g) => ({ name: g.name, target: g.targetAmount, current: g.currentAmount, deadline: g.deadline })),
  };
}

export async function recentTransactions(userId: string, limit = 8) {
  return db
    .select({
      id: transactions.id,
      description: transactions.description,
      merchant: transactions.merchant,
      amount: transactions.amount,
      date: transactions.date,
      category: transactions.category,
      isRecurring: transactions.isRecurring,
      accountName: accounts.name,
      institution: accounts.institution,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
}

export async function budgetsStatus(userId: string, month = monthKey()) {
  const { from, to } = monthRange(month);
  const [limits, txs] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.userId, userId)),
    db
      .select({ amount: transactions.amount, category: transactions.category })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), gte(transactions.date, from), lte(transactions.date, to))),
  ]);
  const spent = new Map<string, number>();
  for (const t of txs) if (t.amount < 0) spent.set(t.category, (spent.get(t.category) ?? 0) - t.amount);
  return limits.map((b) => ({ ...b, spent: spent.get(b.category) ?? 0 }));
}

export async function upcomingBills(userId: string, days = 30) {
  const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return db
    .select()
    .from(bills)
    .where(and(eq(bills.userId, userId), eq(bills.paid, false), lte(bills.dueDate, until)))
    .orderBy(bills.dueDate);
}
