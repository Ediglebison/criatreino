import { cache } from "react";
import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/types";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  signSession,
  verifySession,
} from "./jwt";

export { SESSION_COOKIE, signSession, verifySession };

// Versão de sessão atual do banco (deduplicada por render via React cache —
// layout + AppHeader + page compartilham a mesma leitura).
const sessionVersionOf = cache(async (userId: string): Promise<number | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  return user?.sessionVersion ?? null;
});

/** Lê a sessão do cookie atual (Server Components e Route Handlers). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  // Derruba cookies emitidos antes da última troca de senha: o JWT carrega a
  // sessionVersion da emissão; se não bate com a do banco, a sessão morreu.
  try {
    const current = await sessionVersionOf(session.id);
    if (current === null || current !== (session.sessionVersion ?? 0)) {
      return null;
    }
    return session;
  } catch (error) {
    console.error("[session:version]", error);
    return null; // fail-closed
  }
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
