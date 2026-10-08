import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/lib/types";

const createSchema = z.object({
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
  secondaryMuscles: z.array(z.enum(MUSCLE_GROUPS)).max(8).default([]),
  warningPt: z.string().trim().max(500).nullable().optional(),
  warningEn: z.string().trim().max(500).nullable().optional(),
});

/** POST /api/admin/exercises — cria um exercício no catálogo. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    const exercise = await prisma.exercise.create({
      data: {
        ...parsed.data,
        warningPt: parsed.data.warningPt ?? null,
        warningEn: parsed.data.warningEn ?? null,
      },
      select: { id: true, slug: true, namePt: true },
    });

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "slugTaken" }, { status: 409 });
    }
    console.error("[admin:exercises:create]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
