import { eq } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { aiThreads } from "../database/schema";
import { decrypt } from "../lib/crypto";

export const assistantRouter = {
  thread: authed.handler(async ({ context }) => {
    const [t] = await db.select().from(aiThreads).where(eq(aiThreads.userId, context.user.id));
    if (!t) return { messages: [] as unknown[] };
    try {
      return { messages: JSON.parse(decrypt(t.messagesEnc)) as unknown[] };
    } catch {
      return { messages: [] as unknown[] };
    }
  }),
  clear: authed.handler(async ({ context }) => {
    await db.delete(aiThreads).where(eq(aiThreads.userId, context.user.id));
    return { ok: true };
  }),
};
