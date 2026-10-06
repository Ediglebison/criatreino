import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@/lib/types";

export const SESSION_COOKIE = "ct_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET não configurado (.env)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    professorId: user.professorId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      // Fail-closed: role desconhecida/malformada vira ALUNO (menor
      // privilégio), nunca PROFESSOR.
      role: payload.role === "PROFESSOR" ? "PROFESSOR" : "ALUNO",
      locale: String(payload.locale ?? "pt-BR"),
      professorId: (payload.professorId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
