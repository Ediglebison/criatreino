import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/types";
import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  signSession,
  verifySession,
} from "./jwt";

export { SESSION_COOKIE, signSession, verifySession };

/** Lê a sessão do cookie atual (Server Components e Route Handlers). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Igual, mas nunca lança erro (útil em contexts defensivos). */
export async function getSessionSafe(): Promise<SessionUser | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
