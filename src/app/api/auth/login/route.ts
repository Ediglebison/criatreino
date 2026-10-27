import { NextResponse } from "next/server";
import { z } from "zod";
import {
  dummyPasswordCompare,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  clientIp,
  consume,
  pruneExpired,
  refund,
  tooManyRequests,
} from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";

const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

// Janelas: por IP (contém força bruta distribuída) e por conta (contém
// ataque direto a uma vítima). Falhas consomem; acerto estorna.
const IP_WINDOW_S = 60;
const IP_MAX = 20;
const ACCOUNT_WINDOW_S = 15 * 60;
const ACCOUNT_MAX = 5;

export async function POST(request: Request) {
  try {
    // CSRF de login: só aceita POST cujo Origin bate com o próprio host.
    if (!isSameOrigin(request, new URL(request.url))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidData" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const ipKey = `login:ip:${clientIp(request)}`;
    const accountKey = `login:email:${email}`;

    const [byIp, byAccount] = await Promise.all([
      consume(ipKey, IP_MAX, IP_WINDOW_S),
      consume(accountKey, ACCOUNT_MAX, ACCOUNT_WINDOW_S),
    ]);

    if (!byIp.allowed) {
      return tooManyRequests(byIp.retryAfterSeconds);
    }
    if (!byAccount.allowed) {
      return tooManyRequests(byAccount.retryAfterSeconds);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Gasta o mesmo custo bcrypt de um login real para não revelar
      // se o e-mail existe.
      await dummyPasswordCompare();
    }

    const valid =
      !!user && (await verifyPassword(parsed.data.password, user.passwordHash));

    if (!valid) {
      // Falha já consumiu as duas janelas — só limpa periodicamente.
      if (byIp.count === 1 && byAccount.count === 1) void pruneExpired();
      return NextResponse.json({ error: "invalidCredentials" }, { status: 401 });
    }

    // Credencial correta: estorna a tentativa para não punir quem errou
    // a senha uma vez e logou logo em seguida.
    await Promise.all([
      refund(ipKey, IP_WINDOW_S),
      refund(accountKey, ACCOUNT_WINDOW_S),
    ]);

    // Migra o hash em custo antigo. O rehash é conforto, não requisito:
    // a falha loga e o login segue. Escrita via CAS — só grava se o hash
    // não mudou desde a leitura, para não reverter um `reset` concorrente
    // (count === 0 é esperado e segue silencioso).
    if (passwordNeedsRehash(user.passwordHash)) {
      try {
        const rehashedPassword = await hashPassword(parsed.data.password);
        await prisma.user.updateMany({
          where: { id: user.id, passwordHash: user.passwordHash },
          data: { passwordHash: rehashedPassword },
        });
      } catch (error) {
        console.error("[login] RehashFailed", error);
      }
    }

    await setSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
      professorId: user.professorId,
      sessionVersion: user.sessionVersion,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[login]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
