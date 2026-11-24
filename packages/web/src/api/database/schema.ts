import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

/**
 * GUIOFF schema. All money values are stored as INTEGER cents (BRL) to avoid
 * floating point errors. Every table is scoped by `user_id` and every query in
 * the API filters by the authenticated user. Sensitive identifiers (Pluggy item
 * ids, account numbers, notes) are stored encrypted with AES-256-GCM.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  riskProfile: text("risk_profile"), // conservador | moderado | arrojado
  riskScore: integer("risk_score"),
  monthlyIncome: integer("monthly_income"), // cents
  objectives: text("objectives"), // free text
  horizonYears: integer("horizon_years"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const bankConnections = sqliteTable(
  "bank_connections",
  {
    id: id(),
    userId: userId(),
    provider: text("provider").notNull().default("pluggy"),
    itemIdEnc: text("item_id_enc").notNull(), // encrypted Pluggy item id
    itemIdHash: text("item_id_hash").notNull(), // HMAC for webhook lookup
    connectorName: text("connector_name").notNull(),
    connectorLogo: text("connector_logo"),
    connectorColor: text("connector_color"),
    status: text("status").notNull().default("UPDATING"),
    statusDetail: text("status_detail"),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("bank_conn_item_hash_idx").on(t.itemIdHash), index("bank_conn_user_idx").on(t.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    userId: userId(),
    connectionId: text("connection_id").references(() => bankConnections.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    name: text("name").notNull(),
    institution: text("institution").notNull(),
    type: text("type").notNull(), // checking | savings | credit | cash | wallet
    balance: integer("balance").notNull().default(0), // cents. For credit: current bill/used amount
    creditLimit: integer("credit_limit"),
    availableLimit: integer("available_limit"),
    closingDay: integer("closing_day"),
    dueDay: integer("due_day"),
    brand: text("brand"),
    numberEnc: text("number_enc"), // encrypted masked number
    color: text("color"),
    currency: text("currency").notNull().default("BRL"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId), uniqueIndex("accounts_ext_idx").on(t.userId, t.externalId)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    userId: userId(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    description: text("description").notNull(),
    merchant: text("merchant"),
    amount: integer("amount").notNull(), // cents, negative = saída, positive = entrada
    date: text("date").notNull(), // YYYY-MM-DD
    category: text("category").notNull(),
    categorySource: text("category_source").notNull().default("auto"), // auto | user
    providerCategory: text("provider_category"),
    isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
    installmentNumber: integer("installment_number"),
    totalInstallments: integer("total_installments"),
    source: text("source").notNull().default("manual"), // pluggy | manual
    notesEnc: text("notes_enc"),
    createdAt: createdAt(),
  },
  (t) => [
    index("tx_user_date_idx").on(t.userId, t.date),
    uniqueIndex("tx_ext_idx").on(t.userId, t.externalId),
    index("tx_account_idx").on(t.accountId),
  ],
);

export const investments = sqliteTable(
  "investments",
  {
    id: id(),
    userId: userId(),
    connectionId: text("connection_id").references(() => bankConnections.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    name: text("name").notNull(),
    type: text("type").notNull(), // cdb | tesouro | lci | lca | fundo | acao | fii | cripto | poupanca | outro
    institution: text("institution"),
    investedAmount: integer("invested_amount").notNull(), // cents
    currentValue: integer("current_value").notNull(), // cents
    rateDescription: text("rate_description"), // ex: 110% CDI, IPCA + 6%
    startDate: text("start_date"),
    maturityDate: text("maturity_date"),
    source: text("source").notNull().default("manual"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (t) => [index("inv_user_idx").on(t.userId), uniqueIndex("inv_ext_idx").on(t.userId, t.externalId)],
);

export const goals = sqliteTable(
  "goals",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("economia"), // economia | objetivo
    targetAmount: integer("target_amount").notNull(),
    currentAmount: integer("current_amount").notNull().default(0),
    deadline: text("deadline"),
    color: text("color"),
    createdAt: createdAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const debts = sqliteTable(
  "debts",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    creditor: text("creditor"),
    totalAmount: integer("total_amount").notNull(),
    installmentAmount: integer("installment_amount").notNull(),
    totalInstallments: integer("total_installments").notNull(),
    paidInstallments: integer("paid_installments").notNull().default(0),
    interestRate: integer("interest_rate_bp"), // basis points per month (1,99% = 199)
    dueDay: integer("due_day").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("debts_user_idx").on(t.userId)],
);

export const bills = sqliteTable(
  "bills",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    dueDate: text("due_date").notNull(), // YYYY-MM-DD
    category: text("category").notNull().default("contas"),
    recurrence: text("recurrence").notNull().default("none"), // none | monthly
    paid: integer("paid", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("bills_user_idx").on(t.userId, t.dueDate)],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    userId: userId(),
    category: text("category").notNull(),
    limitAmount: integer("limit_amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budgets_user_cat_idx").on(t.userId, t.category)],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: id(),
    userId: userId(),
    level: text("level").notNull(), // info | warning | danger
    title: text("title").notNull(),
    message: text("message").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("alerts_dedupe_idx").on(t.userId, t.dedupeKey), index("alerts_user_idx").on(t.userId)],
);

export const aiThreads = sqliteTable("ai_threads", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  messagesEnc: text("messages_enc").notNull(), // encrypted JSON of UI messages
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
