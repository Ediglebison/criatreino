import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["PROFESSOR", "ALUNO"]),
  locale: z.enum(["pt-BR", "en-US"]).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidData" }, { status: 400 });
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
