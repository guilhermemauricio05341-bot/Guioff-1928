import { createAuthClient } from "better-auth/react";
import { managedAuthClient } from "@runablehq/managed-auth/client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_WEBSITE_URL ?? window.location.origin,
  basePath: "/api/auth",
  plugins: [
    managedAuthClient({
      applicationId: import.meta.env.VITE_APPLICATION_ID,
      issuer: import.meta.env.VITE_RUNABLE_AUTH_ISSUER,
    }),
  ],
});

export const TOKEN_KEY = "runable.managed-auth.token";

export function captureToken(ctx: { response: Response }) {
  const token = ctx.response.headers.get("set-auth-token");
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  try {
    const t = await authClient.managedAuth.getToken();
    if (t) return t;
  } catch {
    /* ignore */
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function signInGoogle() {
  try {
    await authClient.managedAuth.signIn({ provider: "google" });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== "POPUP_CLOSED") throw e;
  }
}

export async function signOut() {
  await authClient.signOut().catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "/";
}
