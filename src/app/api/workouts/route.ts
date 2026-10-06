import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { draftDaySchema, draftExerciseSchema } from "@/lib/types";
import { getCatalogBySlugs } from "@/lib/workout/catalog";

const createSchema = z.object({
  athleteUserId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  source: z.enum(["AI", "SIMULATED", "MANUAL"]),
  locale: z.enum(["pt-BR", "en-US"]),
  notes: z.string().max(2000).optional(),
  days: z
    .array(draftDaySchema.extend({ exercises: z.array(draftExerciseSchema) }))
    .min(1),
});

/** Lista treinos visíveis para a sessão atual (criados, próprios ou recebidos). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const workouts = await prisma.workout.findMany({
      where: {
        OR: [
          { ownerId: session.id },
          { createdById: session.id },
          { assignments: { some: { studentId: session.id } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { days: true } },
        assignments: {
          select: { studentId: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ workouts });
  } catch (error) {
    console.error("[workouts:list]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** Salva o treino finalizado (após a revisão/checklist). */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Criar treino é função do professor (aluno só recebe/visualiza).
    if (session.role !== "PROFESSOR") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", issues: parsed.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }

    const { athleteUserId, title, source, locale, notes, days } = parsed.data;

    const athlete = await prisma.user.findUnique({
      where: { id: athleteUserId },
      select: { id: true, professorId: true },
    });
    if (!athlete) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    if (athlete.id !== session.id && athlete.professorId !== session.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Exercícios removidos na revisão saem do plano
    const cleanDays = days
      .map((day) => ({
        ...day,
        exercises: day.exercises.filter((ex) => !ex.removed),
      }))
      .filter((day) => day.exercises.length > 0);

    if (cleanDays.length === 0) {
      return NextResponse.json({ error: "emptyWorkout" }, { status: 400 });
    }

    const slugs = [
      ...cleanDays.flatMap((d) => d.exercises.map((e) => e.slug)),
      ...cleanDays.flatMap((d) =>
        d.exercises.flatMap((e) => (e.replacedFromSlug ? [e.replacedFromSlug] : [])),
      ),
    ];
    const catalog = await getCatalogBySlugs(slugs);
    const missing = cleanDays
      .flatMap((d) => d.exercises.map((e) => e.slug))
      .filter((s) => !catalog.has(s));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "unknownExercises", missing: missing.slice(0, 5) },
        { status: 400 },
      );
    }

    const workout = await prisma.workout.create({
      data: {
        title,
        status: "FINAL",
        source,
        locale,
        notes: notes ?? null,
        ownerId: athlete.id,
        createdById: session.id,
        days: {
          create: cleanDays.map((day, dayIndex) => ({
            order: dayIndex + 1,
            label: day.label,
            focus: day.focus ?? null,
            exercises: {
              create: day.exercises.map((ex, exIndex) => ({
                order: exIndex + 1,
                exerciseId: catalog.get(ex.slug)!.id,
                sets: ex.sets,
                reps: ex.reps,
                restSeconds: ex.restSeconds ?? null,
                tempo: ex.tempo ?? null,
                notes: ex.notes ?? null,
                replacedFromId: ex.replacedFromSlug
                  ? catalog.get(ex.replacedFromSlug)?.id ?? ex.replacedFromSlug
                  : null,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });

    return NextResponse.json({ id: workout.id });
  } catch (error) {
    console.error("[workouts:create]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
