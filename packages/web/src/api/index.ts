import type { RouterClient } from "@orpc/server";
import { createAgentUIStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { createApp } from "./__core/app";
import { ping } from "./routes/ping";
import { auth } from "./auth";
import { accountsRouter } from "./routes/accounts";
import { transactionsRouter } from "./routes/transactions";
import { financeRouter } from "./routes/finance";
import { investmentsRouter } from "./routes/investments";
import { planningRouter } from "./routes/planning";
import { assistantRouter } from "./routes/assistant";
import { db } from "./database";
import { aiThreads, bankConnections, profiles } from "./database/schema";
import { encrypt, hmac } from "./lib/crypto";
import { syncConnection } from "./lib/sync";
import { buildAgent } from "./agent";
import { todayISO } from "./lib/money";

export const router = {
  ping,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  finance: financeRouter,
  investments: investmentsRouter,
  planning: planningRouter,
  assistant: assistantRouter,
};

export type AppRouter = typeof router;
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Pluggy webhook: item updated → re-sync that connection in background.
app.post("/api/webhooks/pluggy", async (c) => {
  if (c.req.query("token") !== process.env.PLUGGY_WEBHOOK_SECRET) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { itemId?: string; event?: string };
  if (body.itemId) {
    const [conn] = await db.select().from(bankConnections).where(eq(bankConnections.itemIdHash, hmac(body.itemId)));
    if (conn) {
      if (body.event === "item/deleted") await db.delete(bankConnections).where(eq(bankConnections.id, conn.id));
      else void syncConnection(conn.id, conn.userId).catch(() => undefined);
    }
  }
  return c.json({ ok: true }, 200);
});

app.post("/api/agent/messages", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Faça login para continuar." }, 401);
  const { messages } = (await c.req.json()) as { messages: unknown[] };
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id));
  const agent = buildAgent({
    userId: session.user.id,
    userName: session.user.name,
    riskProfile: p?.riskProfile ?? null,
    today: todayISO(),
  });
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    onEnd: async ({ messages: all }) => {
      const enc = encrypt(JSON.stringify(all.slice(-60)));
      await db
        .insert(aiThreads)
        .values({ userId: session.user.id, messagesEnc: enc })
        .onConflictDoUpdate({ target: aiThreads.userId, set: { messagesEnc: enc, updatedAt: new Date() } });
    },
    onError: (e) => {
      const msg = String((e as Error)?.message ?? e);
      if (/402|paid_plan_required/i.test(msg)) return "PAID_PLAN_REQUIRED";
      return "Não foi possível responder agora. Tente novamente.";
    },
  });
});

export default app;
