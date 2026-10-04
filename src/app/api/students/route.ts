import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(6).max(200),
});

/** GET /api/students — alunos vinculados ao professor da sessão. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.role !== "PROFESSOR") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const students = await prisma.user.findMany({
      where: { role: "ALUNO", professorId: session.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            workoutsOwned: true,
            assignments: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ students });
  } catch (error) {
    console.error("[students:list]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** POST /api/students — cadastra um aluno vinculado ao professor. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.role !== "PROFESSOR") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.role !== "ALUNO") {
        return NextResponse.json({ error: "emailTaken" }, { status: 409 });
      }
      if (existing.professorId && existing.professorId !== session.id) {
        return NextResponse.json({ error: "emailTaken" }, { status: 409 });
      }
      // Já é aluno (sem ou com este professor) → vincula
      const linked = await prisma.user.update({
        where: { id: existing.id },
        data: { professorId: session.id },
        select: { id: true, name: true, email: true },
      });
      return NextResponse.json({ student: linked });
    }

    const student = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash: await hashPassword(parsed.data.password),
        role: "ALUNO",
        professorId: session.id,
        locale: session.locale,
      },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    console.error("[students:create]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
