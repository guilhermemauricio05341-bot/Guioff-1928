import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { accounts, bankConnections } from "../database/schema";
import { decrypt, decryptOptional, encrypt, encryptOptional, hmac } from "../lib/crypto";
import { pluggy, pluggyConfigured } from "../lib/pluggy";
import { syncConnection } from "../lib/sync";
import { evaluateAlerts } from "../lib/alerts";

const accountInput = z.object({
  name: z.string().min(1).max(80),
  institution: z.string().min(1).max(80),
  type: z.enum(["checking", "savings", "credit", "cash", "wallet"]),
  balance: z.number().int(),
  creditLimit: z.number().int().nullable().optional(),
  availableLimit: z.number().int().nullable().optional(),
  closingDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  brand: z.string().max(30).nullable().optional(),
  number: z.string().max(30).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

async function ownAccount(userId: string, id: string) {
  const [a] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  if (!a) throw new ORPCError("NOT_FOUND", { message: "Conta não encontrada" });
  return a;
}

export const accountsRouter = {
  list: authed.handler(async ({ context }) => {
    const [accs, conns] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.userId, context.user.id)),
      db.select().from(bankConnections).where(eq(bankConnections.userId, context.user.id)),
    ]);
    return {
      accounts: accs.map(({ numberEnc, ...a }) => ({ ...a, number: decryptOptional(numberEnc) })),
      connections: conns.map(({ itemIdEnc: _e, itemIdHash: _h, ...c }) => c),
    };
  }),

  create: authed.input(accountInput).handler(async ({ context, input }) => {
    const { number, ...rest } = input;
    const [a] = await db
      .insert(accounts)
      .values({ ...rest, userId: context.user.id, numberEnc: encryptOptional(number ?? null) })
      .returning({ id: accounts.id });
    await evaluateAlerts(context.user.id);
    return a;
  }),

  update: authed
    .input(accountInput.partial().extend({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const acc = await ownAccount(context.user.id, input.id);
      const { id, number, ...rest } = input;
      // Synced accounts: the bank is the source of truth for balances.
      if (acc.connectionId) {
        delete rest.balance;
        delete rest.availableLimit;
        delete rest.creditLimit;
      }
      await db
        .update(accounts)
        .set({ ...rest, ...(number !== undefined ? { numberEnc: encryptOptional(number) } : {}), updatedAt: new Date() })
        .where(and(eq(accounts.id, id), eq(accounts.userId, context.user.id)));
      await evaluateAlerts(context.user.id);
      return { ok: true };
    }),

  remove: authed.input(z.object({ id: z.string() })).handler(async ({ context, input }) => {
    const acc = await ownAccount(context.user.id, input.id);
    if (acc.connectionId)
      throw new ORPCError("BAD_REQUEST", { message: "Contas sincronizadas são removidas desconectando o banco." });
    await db.delete(accounts).where(and(eq(accounts.id, input.id), eq(accounts.userId, context.user.id)));
    return { ok: true };
  }),

  // ---------- Open Finance (Pluggy) ----------
  openFinanceStatus: authed.handler(() => ({
    configured: pluggyConfigured(),
    includeSandbox: process.env.PLUGGY_INCLUDE_SANDBOX === "true",
  })),

  connectToken: authed
    .input(z.object({ connectionId: z.string().optional() }))
    .handler(async ({ context, input }) => {
      if (!pluggyConfigured())
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "Integração Open Finance ainda não configurada (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET).",
        });
      let itemId: string | undefined;
      if (input.connectionId) {
        const [c] = await db
          .select()
          .from(bankConnections)
          .where(and(eq(bankConnections.id, input.connectionId), eq(bankConnections.userId, context.user.id)));
        if (!c) throw new ORPCError("NOT_FOUND");
        itemId = decrypt(c.itemIdEnc);
      }
      const { accessToken } = await pluggy.createConnectToken(context.user.id, itemId);
      return { accessToken, includeSandbox: process.env.PLUGGY_INCLUDE_SANDBOX === "true" };
    }),

  /** Called after the user authorizes in the Pluggy Connect widget. */
  registerItem: authed.input(z.object({ itemId: z.string().min(8) })).handler(async ({ context, input }) => {
    const item = await pluggy.getItem(input.itemId);
    if (item.clientUserId && item.clientUserId !== context.user.id)
      throw new ORPCError("FORBIDDEN", { message: "Esta conexão não pertence a você." });
    const hash = hmac(input.itemId);
    const [existing] = await db.select().from(bankConnections).where(eq(bankConnections.itemIdHash, hash));
    let id = existing?.id;
    if (existing && existing.userId !== context.user.id) throw new ORPCError("FORBIDDEN");
    if (!existing) {
      const [c] = await db
        .insert(bankConnections)
        .values({
          userId: context.user.id,
          itemIdEnc: encrypt(input.itemId),
          itemIdHash: hash,
          connectorName: item.connector.name,
          connectorLogo: item.connector.imageUrl ?? null,
          connectorColor: item.connector.primaryColor ?? null,
          status: item.status,
        })
        .returning({ id: bankConnections.id });
      id = c!.id;
    }
    const result = await syncConnection(id!, context.user.id).catch((e: Error) => ({ error: e.message }));
    return { id, result };
  }),

  sync: authed.input(z.object({ connectionId: z.string() })).handler(async ({ context, input }) => {
    const [c] = await db
      .select()
      .from(bankConnections)
      .where(and(eq(bankConnections.id, input.connectionId), eq(bankConnections.userId, context.user.id)));
    if (!c) throw new ORPCError("NOT_FOUND");
    // Ask the bank for fresh data, then pull what is already available.
    await pluggy.updateItem(decrypt(c.itemIdEnc)).catch(() => undefined);
    return syncConnection(c.id, context.user.id);
  }),

  /** Revokes the authorization at Pluggy and deletes all data imported from it. */
  disconnect: authed.input(z.object({ connectionId: z.string() })).handler(async ({ context, input }) => {
    const [c] = await db
      .select()
      .from(bankConnections)
      .where(and(eq(bankConnections.id, input.connectionId), eq(bankConnections.userId, context.user.id)));
    if (!c) throw new ORPCError("NOT_FOUND");
    if (pluggyConfigured()) await pluggy.deleteItem(decrypt(c.itemIdEnc)).catch(() => undefined);
    await db.delete(bankConnections).where(eq(bankConnections.id, c.id)); // cascades accounts/tx/investments
    return { ok: true };
  }),
};
