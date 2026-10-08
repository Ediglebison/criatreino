import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const base = {
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug deve ser kebab-case"),
  namePt: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  equipment: z.enum(EQUIPMENT),
  secondaryMuscles: z.array(z.enum(MUSCLE_GROUPS)).max(8),
  warningPt: z.string().trim().max(500).nullable(),
  warningEn: z.string().trim().max(500).nullable(),
};

const updateSchema = z
  .object(base)
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "nada para atualizar",
  });

/**
 * PATCH /api/admin/exercises/[id] — edita um exercício do catálogo.
 * Trocar o slug é seguro: os treinos referenciam por id, não por slug.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    const existing = await prisma.exercise.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    const data = parsed.data;
    const exercise = await prisma.exercise.update({
      where: { id },
      data: {
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.namePt !== undefined ? { namePt: data.namePt } : {}),
        ...(data.nameEn !== undefined ? { nameEn: data.nameEn } : {}),
        ...(data.muscleGroup !== undefined ? { muscleGroup: data.muscleGroup } : {}),
        ...(data.equipment !== undefined ? { equipment: data.equipment } : {}),
        ...(data.secondaryMuscles !== undefined
          ? { secondaryMuscles: data.secondaryMuscles }
          : {}),
        ...(data.warningPt !== undefined ? { warningPt: data.warningPt } : {}),
        ...(data.warningEn !== undefined ? { warningEn: data.warningEn } : {}),
      },
      select: { id: true, slug: true, namePt: true },
    });

    return NextResponse.json({ exercise });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "slugTaken" }, { status: 409 });
    }
    console.error("[admin:exercises:update]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/exercises/[id] — remove do catálogo.
 * Em uso por algum treino (FK Restrict) → 409 inUse com a contagem.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const existing = await prisma.exercise.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    const inUse = await prisma.workoutExercise.count({
      where: { exerciseId: id },
    });
    if (inUse > 0) {
      return NextResponse.json({ error: "inUse", count: inUse }, { status: 409 });
    }

    await prisma.exercise.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin:exercises:delete]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
