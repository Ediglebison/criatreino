import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { athleteProfileSchema } from "@/lib/types";

const upsertSchema = athleteProfileSchema.extend({
  userId: z.string().min(1),
});

async function canAccessProfile(
  sessionUserId: string,
  sessionRole: string,
  targetUserId: string,
): Promise<boolean> {
  if (sessionUserId === targetUserId) return true;
  if (sessionRole !== "PROFESSOR") return false;
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { professorId: true },
  });
  return target?.professorId === sessionUserId;
}

/** GET /api/profiles?userId=... — perfil/medidas do atleta. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const userId = request.nextUrl.searchParams.get("userId") ?? session.id;
    if (!(await canAccessProfile(session.id, session.role, userId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const profile = await prisma.athleteProfile.findUnique({
      where: { userId },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[profiles:get]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** PUT /api/profiles — cria/atualiza o perfil do atleta. */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", issues: parsed.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }

    const { userId, ...data } = parsed.data;
    if (!(await canAccessProfile(session.id, session.role, userId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const profile = await prisma.athleteProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
      },
      update: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[profiles:put]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
