import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/** Validade do link de redefinição de senha. */
export const RESET_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Gera um token de reset e grava apenas o hash SHA-256 no banco (o token em
 * claro só existe no link enviado por e-mail). Invalida tokens anteriores não
 * usados — um link válido por vez.
 */
export async function createPasswordReset(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } });
  await prisma.passwordReset.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Consome o token em operação condicional única (`UPDATE ... WHERE`): dois
 * usos paralelos do mesmo link não passam juntos. Retorna o userId ou null
 * para token inexistente, já usado ou expirado.
 */
export async function consumePasswordReset(
  token: string,
): Promise<string | null> {
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const claimed = await prisma.passwordReset.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? row.userId : null;
}
