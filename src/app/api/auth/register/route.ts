import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { clientIp, consume, tooManyRequests } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["PROFESSOR", "ALUNO"]),
  locale: z.enum(["pt-BR", "en-US"]).optional(),
});

// 10 cadastros/hora por IP (impede criação em massa de contas professoras)
const REGISTER_WINDOW_S = 60 * 60;
const REGISTER_MAX = 10;

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request, new URL(request.url))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidData" }, { status: 400 });
    }

    const byIp = await consume(
      `register:ip:${clientIp(request)}`,
      REGISTER_MAX,
      REGISTER_WINDOW_S,
    );
    if (!byIp.allowed) {
      return tooManyRequests(byIp.retryAfterSeconds);
    }

    const { name, password, role, locale } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "emailTaken" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role,
        locale: locale ?? "pt-BR",
      },
    });

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
    console.error("[register]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
