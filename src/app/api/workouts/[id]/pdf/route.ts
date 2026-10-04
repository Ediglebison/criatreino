import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { exerciseName, exerciseWarning, type Locale } from "@/lib/types";
import { buildWorkoutPdf, pdfFilename, type PdfInput } from "@/lib/workout/pdf";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/workouts/[id]/pdf — exporta o treino em PDF.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const workout = await prisma.workout.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true } },
        createdBy: { select: { name: true } },
        profile: true,
        assignments: { select: { studentId: true } },
        days: {
          orderBy: { order: "asc" },
          include: {
            exercises: {
              orderBy: { order: "asc" },
              include: { exercise: true },
            },
          },
        },
      },
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

    // Locale do treino, com fallback para o da sessão
    const requested = request.nextUrl.searchParams.get("locale");
    const locale: Locale =
      requested === "en-US" || requested === "pt-BR"
        ? requested
        : (workout.locale as Locale) === "en-US"
          ? "en-US"
          : "pt-BR";

    const profile = workout.profile;
    const input: PdfInput = {
      title: workout.title,
      createdAt: workout.createdAt,
      athleteName: workout.owner.name,
      createdByName: workout.createdBy.name,
      locale,
      profile: profile
        ? {
            goal: profile.goal,
            goalNotes: profile.goalNotes,
            daysPerWeek: profile.daysPerWeek,
            sessionMinutes: profile.sessionMinutes,
            experience: profile.experience,
            limitations: Array.isArray(profile.limitations)
              ? (profile.limitations.filter(
                  (l) => typeof l === "string",
                ) as string[])
              : [],
            limitationNotes: profile.limitationNotes,
            equipment: Array.isArray(profile.equipment)
              ? (profile.equipment.filter(
                  (e) => typeof e === "string",
                ) as string[])
              : [],
            weightKg: profile.weightKg,
            heightCm: profile.heightCm,
          }
        : null,
      days: workout.days.map((day) => ({
        label: day.label,
        focus: day.focus,
        exercises: day.exercises.map((ex, i) => ({
          order: i + 1,
          name: exerciseName(ex.exercise, locale),
          warning: exerciseWarning(ex.exercise, locale),
          sets: ex.sets,
          reps: ex.reps,
          restSeconds: ex.restSeconds,
          tempo: ex.tempo,
          notes: ex.notes,
        })),
      })),
    };

    const doc = buildWorkoutPdf(input);
    const buffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFilename(workout.title, locale)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[workouts:pdf]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
