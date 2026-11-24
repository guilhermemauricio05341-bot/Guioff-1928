import { and, eq } from "drizzle-orm";
import { db } from "../database";
import { accounts, bankConnections, investments, transactions } from "../database/schema";
import { categorize } from "./categories";
import { decrypt, encryptOptional } from "./crypto";
import { pluggy, type PluggyAccount, type PluggyInvestment } from "./pluggy";
import { toCents } from "./money";
import { detectRecurring } from "./recurring";
import { evaluateAlerts } from "./alerts";

function accountType(a: PluggyAccount) {
  if (a.type === "CREDIT") return "credit";
  if (a.subtype === "SAVINGS_ACCOUNT") return "savings";
  return "checking";
}

function investmentType(i: PluggyInvestment) {
  const s = `${i.subtype ?? ""} ${i.type} ${i.name}`.toUpperCase();
  if (s.includes("LCI")) return "lci";
  if (s.includes("LCA")) return "lca";
  if (s.includes("CDB") || s.includes("LC ") || s.includes("RDB")) return "cdb";
  if (s.includes("TREASURY") || s.includes("TESOURO")) return "tesouro";
  if (s.includes("REAL_ESTATE") || s.includes("FII")) return "fii";
  if (s.includes("STOCK") || s.includes("EQUITY") || s.includes("ETF") || s.includes("BDR")) return "acao";
  if (s.includes("FUND")) return "fundo";
  if (s.includes("CRYPTO")) return "cripto";
  return "outro";
}

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : null);

/**
 * Pulls accounts, transactions (last 12 months) and investments for one
 * connection and upserts them. Balances come from the bank (source of truth),
 * so the available balance is always the bank's after each synced movement.
 */
export async function syncConnection(connectionId: string, userId: string) {
  const [conn] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, userId)));
  if (!conn) throw new Error("Conexão não encontrada");
  const itemId = decrypt(conn.itemIdEnc);

  try {
    const item = await pluggy.getItem(itemId);
    const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const pAccounts = await pluggy.accounts(itemId);
    let txCount = 0;

    for (const a of pAccounts) {
      const type = accountType(a);
      const values = {
        userId,
        connectionId,
        externalId: `pluggy:${a.id}`,
        name: a.marketingName || a.name,
        institution: item.connector.name,
        type,
        balance: toCents(a.balance ?? 0),
        creditLimit: a.creditData?.creditLimit != null ? toCents(a.creditData.creditLimit) : null,
        availableLimit:
          a.creditData?.availableCreditLimit != null ? toCents(a.creditData.availableCreditLimit) : null,
        closingDay: a.creditData?.balanceCloseDate ? Number(a.creditData.balanceCloseDate.slice(8, 10)) : null,
        dueDay: a.creditData?.balanceDueDate ? Number(a.creditData.balanceDueDate.slice(8, 10)) : null,
        brand: a.creditData?.brand ?? null,
        numberEnc: encryptOptional(a.number ? `•••• ${a.number.slice(-4)}` : null),
        color: item.connector.primaryColor ? `#${item.connector.primaryColor.replace("#", "")}` : null,
        currency: a.currencyCode || "BRL",
        updatedAt: new Date(),
      };
      const [acc] = await db
        .insert(accounts)
        .values(values)
        .onConflictDoUpdate({
          target: [accounts.userId, accounts.externalId],
          set: { ...values, userId: undefined, externalId: undefined },
        })
        .returning({ id: accounts.id });

      const txs = await pluggy.transactions(a.id, from);
      for (const t of txs) {
        const amount = t.type === "DEBIT" ? -Math.abs(toCents(t.amount)) : Math.abs(toCents(t.amount));
        const merchant = t.merchant?.name || t.merchant?.businessName || null;
        const category = categorize({ description: t.description, merchant, providerCategory: t.category, amount });
        await db
          .insert(transactions)
          .values({
            userId,
            accountId: acc!.id,
            externalId: `pluggy:${t.id}`,
            description: t.description,
            merchant,
            amount,
            date: t.date.slice(0, 10),
            category,
            providerCategory: t.category ?? null,
            installmentNumber: t.creditCardMetadata?.installmentNumber ?? null,
            totalInstallments: t.creditCardMetadata?.totalInstallments ?? null,
            source: "pluggy",
          })
          .onConflictDoUpdate({
            target: [transactions.userId, transactions.externalId],
            set: { amount, description: t.description, date: t.date.slice(0, 10), merchant },
          });
        txCount++;
      }
    }

    const pInv = await pluggy.investments(itemId);
    for (const i of pInv) {
      const values = {
        userId,
        connectionId,
        externalId: `pluggy:${i.id}`,
        name: i.name,
        type: investmentType(i),
        institution: i.issuer || item.connector.name,
        investedAmount: toCents(i.amountOriginal ?? i.amount ?? i.balance),
        currentValue: toCents(i.balance ?? 0),
        rateDescription: i.rate != null ? `${i.rate}% ${i.rateType ?? ""}`.trim() : i.fixedAnnualRate != null ? `${i.fixedAnnualRate}% a.a.` : null,
        startDate: day(i.date),
        maturityDate: day(i.dueDate),
        source: "pluggy",
        updatedAt: new Date(),
      };
      await db
        .insert(investments)
        .values(values)
        .onConflictDoUpdate({
          target: [investments.userId, investments.externalId],
          set: { ...values, userId: undefined, externalId: undefined },
        });
    }

    await db
      .update(bankConnections)
      .set({
        status: item.status,
        statusDetail: item.error?.message ?? null,
        lastSyncAt: new Date(),
        connectorName: item.connector.name,
        connectorLogo: item.connector.imageUrl ?? conn.connectorLogo,
      })
      .where(eq(bankConnections.id, connectionId));

    await detectRecurring(userId);
    await evaluateAlerts(userId);
    return { accounts: pAccounts.length, transactions: txCount, investments: pInv.length, status: item.status };
  } catch (err) {
    await db
      .update(bankConnections)
      .set({ status: "ERROR", statusDetail: (err as Error).message.slice(0, 300) })
      .where(eq(bankConnections.id, connectionId));
    throw err;
  }
}
