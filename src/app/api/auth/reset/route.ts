import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { consumePasswordReset } from "@/lib/auth/reset";
import { prisma } from "@/lib/db";
import { clientIp, consume, tooManyRequests } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";

const resetSchema = z.object({
  token: z.string().trim().min(20).max(300),
  password: z.string().min(8).max(200),
});

// Tentativas por IP (o token tem 256 bits — brute force via rede é o alvo).
const IP_WINDOW_S = 10 * 60;
const IP_MAX = 10;

/**
 * POST /api/auth/reset — troca a senha a partir de um token válido.
 *
 * Token de uso único (consumo condicional atômico). Sucesso incrementa
 * `User.sessionVersion`, o que derruba todos os cookies JWT existentes —
 * importante em recuperação de conta possivelmente sequestrada.
 */
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request, new URL(request.url))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = resetSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidData" }, { status: 400 });
    }

    const byIp = await consume(
      `reset:ip:${clientIp(request)}`,
      IP_MAX,
      IP_WINDOW_S,
    );
    if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSeconds);

    const userId = await consumePasswordReset(parsed.data.token);
    if (!userId) {
      return NextResponse.json({ error: "invalidToken" }, { status: 400 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 }, // derruba todas as sessões
        },
      }),
      prisma.passwordReset.deleteMany({ where: { userId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth:reset]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
