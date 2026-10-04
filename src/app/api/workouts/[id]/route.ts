import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const workoutInclude = {
  owner: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  profile: true,
  days: {
    orderBy: { order: "asc" as const },
    include: {
      exercises: {
        orderBy: { order: "asc" as const },
        include: { exercise: true },
      },
    },
  },
  assignments: {
    select: {
      studentId: true,
      note: true,
      createdAt: true,
      student: { select: { id: true, name: true, email: true } },
    },
  },
};

/** GET /api/workouts/[id] — detalhe completo (dias + exercícios). */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const workout = await prisma.workout.findUnique({
      where: { id },
      include: workoutInclude,
    });

    if (!workout) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    const visible =
      workout.ownerId === session.id ||
      workout.createdById === session.id ||
      workout.assignments.some((a) => a.studentId === session.id);

    if (!visible) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({ workout });
  } catch (error) {
    console.error("[workouts:get]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
