import { NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordReset } from "@/lib/auth/reset";
import { prisma } from "@/lib/db";
import { passwordResetEmail, sendEmail } from "@/lib/email";
import { DEFAULT_LOCALE } from "@/i18n/routing";
import { clientIp, consume, tooManyRequests } from "@/lib/rate-limit";
import { effectiveOrigin, isSameOrigin } from "@/lib/same-origin";

const forgotSchema = z.object({ email: z.email().max(200) });

// Janelas de rate limiting: por IP e por conta (evita martelar um alvo).
const IP_WINDOW_S = 10 * 60;
const IP_MAX = 10;
const EMAIL_WINDOW_S = 15 * 60;
const EMAIL_MAX = 5;

/**
 * POST /api/auth/forgot — pedido de recuperação de senha.
 *
 * Gera um token de 30 min (hash SHA-256 no banco) e envia o link por e-mail.
 * A resposta é sempre `200 { ok: true }`, exista a conta ou não, e o mesmo
 * vale para falha do provedor de e-mail — não dá para usar a rota para
 * descobrir quais emails estão cadastrados (anti-enumeração).
 */
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request, new URL(request.url))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = forgotSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidData" }, { status: 400 });
    }
    const email = parsed.data.email.toLowerCase();

    const [byIp, byAccount] = await Promise.all([
      consume(`forgot:ip:${clientIp(request)}`, IP_MAX, IP_WINDOW_S),
      consume(`forgot:email:${email}`, EMAIL_MAX, EMAIL_WINDOW_S),
    ]);
    if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSeconds);
    if (!byAccount.allowed) return tooManyRequests(byAccount.retryAfterSeconds);

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const { token, expiresAt } = await createPasswordReset(user.id);

      const locale = user.locale === "en-US" ? "en-US" : DEFAULT_LOCALE;
      const origin =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
        effectiveOrigin(request, new URL(request.url));
      const path =
        locale === DEFAULT_LOCALE
          ? "/reset-password"
          : `/${locale}/reset-password`;
      const url = `${origin}${path}?token=${token}`;

      try {
        await sendEmail(
          passwordResetEmail({
            to: user.email,
            name: user.name,
            url,
            expiresAt,
            locale,
          }),
        );
      } catch (error) {
        // Resposta continua genérica; o link também é perdido (log no CI).
        console.error("[auth:forgot] falha ao enviar email", error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth:forgot]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
