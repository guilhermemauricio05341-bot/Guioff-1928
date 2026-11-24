/**
 * Minimal, typed Pluggy (Open Finance) client — official REST API
 * https://docs.pluggy.ai. Bank credentials are typed by the user directly in the
 * Pluggy Connect widget; GUIOFF never sees or stores them. We only keep the
 * (encrypted) item id that represents the user-authorized connection.
 */
const BASE = "https://api.pluggy.ai";

let cachedKey: { key: string; expires: number } | null = null;

export function pluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

async function apiKey(): Promise<string> {
  if (cachedKey && cachedKey.expires > Date.now()) return cachedKey.key;
  const res = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Pluggy auth falhou (${res.status})`);
  const { apiKey: key } = (await res.json()) as { apiKey: string };
  // API keys last 2h — refresh a bit earlier.
  cachedKey = { key, expires: Date.now() + 100 * 60 * 1000 };
  return key;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "X-API-KEY": await apiKey(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pluggy ${init.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface PluggyItem {
  id: string;
  status: string; // UPDATED | UPDATING | LOGIN_ERROR | OUTDATED | WAITING_USER_INPUT
  executionStatus?: string;
  clientUserId?: string | null;
  connector: { id: number; name: string; imageUrl?: string; primaryColor?: string };
  lastUpdatedAt?: string | null;
  error?: { code?: string; message?: string } | null;
}

export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: string; // CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  currencyCode: string;
  creditData?: {
    brand?: string | null;
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
  } | null;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  type: "DEBIT" | "CREDIT";
  category?: string | null;
  merchant?: { name?: string; businessName?: string } | null;
  creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number } | null;
}

export interface PluggyInvestment {
  id: string;
  name: string;
  type: string; // FIXED_INCOME | MUTUAL_FUND | EQUITY | SECURITY | ETF | COE | OTHER
  subtype?: string | null; // CDB | LCI | LCA | TREASURY | STOCK | REAL_ESTATE_FUND ...
  balance: number;
  amount?: number | null;
  amountOriginal?: number | null;
  rate?: number | null;
  rateType?: string | null;
  fixedAnnualRate?: number | null;
  date?: string | null;
  dueDate?: string | null;
  issuer?: string | null;
}

interface Page<T> {
  results: T[];
  total?: number;
  totalPages?: number;
  page?: number;
}

export const pluggy = {
  createConnectToken(clientUserId: string, itemId?: string) {
    const site = (process.env.WEBSITE_URL ?? "").replace(/\/$/, "");
    const webhookUrl =
      site.startsWith("https://")
        ? `${site}/api/webhooks/pluggy?token=${process.env.PLUGGY_WEBHOOK_SECRET ?? ""}`
        : undefined;
    return call<{ accessToken: string }>("/connect_token", {
      method: "POST",
      body: JSON.stringify({ itemId, options: { clientUserId, webhookUrl, avoidDuplicates: true } }),
    });
  },
  getItem: (id: string) => call<PluggyItem>(`/items/${id}`),
  updateItem: (id: string) => call<PluggyItem>(`/items/${id}`, { method: "PATCH", body: "{}" }),
  deleteItem: (id: string) => call<void>(`/items/${id}`, { method: "DELETE" }),
  async accounts(itemId: string) {
    return (await call<Page<PluggyAccount>>(`/accounts?itemId=${itemId}`)).results;
  },
  async investments(itemId: string) {
    try {
      return (await call<Page<PluggyInvestment>>(`/investments?itemId=${itemId}&pageSize=500`)).results;
    } catch {
      return []; // product may not be enabled for the team
    }
  },
  async transactions(accountId: string, from: string) {
    const all: PluggyTransaction[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await call<Page<PluggyTransaction>>(
        `/transactions?accountId=${accountId}&from=${from}&pageSize=500&page=${page}`,
      );
      all.push(...res.results);
      if (!res.totalPages || page >= res.totalPages) break;
    }
    return all;
  },
};
