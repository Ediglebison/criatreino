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
    // Versão das sessões: bump em troca de senha invalida tokens antigos.
    sessionVersion: user.sessionVersion ?? 0,
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
      // privilégio). Só PROFESSOR e ADMIN são reconhecidos explicitamente.
      role:
        payload.role === "PROFESSOR"
          ? "PROFESSOR"
          : payload.role === "ADMIN"
            ? "ADMIN"
            : "ALUNO",
      locale: String(payload.locale ?? "pt-BR"),
      professorId: (payload.professorId as string | null) ?? null,
      // Fail-closed: claim ausente/inválido vira 0 (compatível com cookies
      // emitidos antes da coluna existir — só morrem após 1º bump).
      sessionVersion:
        typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0,
    };
  } catch {
    return null;
  }
}
