import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  studentId: z.string().min(1),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/workouts/[id]/assign
 * Exporta o treino para a conta de um usuário aluno.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.role !== "PROFESSOR") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsed = assignSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    const workout = await prisma.workout.findUnique({
      where: { id },
      select: { id: true, ownerId: true, createdById: true },
    });
    if (!workout) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    if (workout.createdById !== session.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const student = await prisma.user.findUnique({
      where: { id: parsed.data.studentId },
      select: { id: true, role: true, professorId: true, name: true },
    });
    if (!student || student.role !== "ALUNO") {
      return NextResponse.json({ error: "studentNotFound" }, { status: 404 });
    }
    if (student.professorId && student.professorId !== session.id) {
      return NextResponse.json({ error: "studentNotFound" }, { status: 403 });
    }
    if (student.id === workout.ownerId) {
      return NextResponse.json({ error: "alreadyOwner" }, { status: 409 });
    }

    const existing = await prisma.assignment.findUnique({
      where: { workoutId_studentId: { workoutId: id, studentId: student.id } },
    });
    if (existing) {
      return NextResponse.json({ error: "alreadyAssigned" }, { status: 409 });
    }

    const assignment = await prisma.assignment.create({
      data: {
        workoutId: id,
        studentId: student.id,
        assignedById: session.id,
        note: parsed.data.note ?? null,
      },
    });

    // Vincula o aluno ao professor, se ainda não estiver vinculado
    if (!student.professorId) {
      await prisma.user.update({
        where: { id: student.id },
        data: { professorId: session.id },
      });
    }

    return NextResponse.json({ assignment });
  } catch (error) {
    console.error("[workouts:assign]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
