import { prisma } from "@/lib/db";
import type { CatalogExercise, Equipment, MuscleGroup } from "@/lib/types";

type ExerciseRow = {
  id: string;
  slug: string;
  namePt: string;
  nameEn: string;
  muscleGroup: string;
  secondaryMuscles: unknown;
  equipment: string;
  warningPt: string | null;
  warningEn: string | null;
};

function toCatalog(row: ExerciseRow): CatalogExercise {
  const secondary = Array.isArray(row.secondaryMuscles)
    ? (row.secondaryMuscles.filter(
        (g) => typeof g === "string",
      ) as MuscleGroup[])
    : [];
  return {
    id: row.id,
    slug: row.slug,
    namePt: row.namePt,
    nameEn: row.nameEn,
    muscleGroup: row.muscleGroup as MuscleGroup,
    secondaryMuscles: secondary,
    equipment: row.equipment as Equipment,
    warningPt: row.warningPt,
    warningEn: row.warningEn,
  };
}

const ORDER = [
  "CHEST",
  "BACK",
  "SHOULDERS",
  "BICEPS",
  "TRICEPS",
  "LEGS",
  "GLUTES",
  "ABS",
  "CARDIO",
] as const;

/** Catálogo completo (usado na UI de substituição; a UI filtra por equipamento). */
export async function getAllCatalog(): Promise<CatalogExercise[]> {
  const rows = await prisma.exercise.findMany();
  return rows
    .map(toCatalog)
    .sort(
      (a, b) =>
        ORDER.indexOf(a.muscleGroup) - ORDER.indexOf(b.muscleGroup) ||
        a.slug.localeCompare(b.slug),
    );
}

/** Catálogo filtrado pelos equipamentos disponíveis do atleta (+ peso do corpo). */
export async function getCatalogForProfile(
  equipment: Equipment[],
): Promise<CatalogExercise[]> {
  const wanted: Equipment[] = Array.from(new Set([...equipment, "BODYWEIGHT"]));
  const rows = await prisma.exercise.findMany({
    where: { equipment: { in: wanted } },
  });
  return rows
    .map(toCatalog)
    .sort(
      (a, b) =>
        ORDER.indexOf(a.muscleGroup) - ORDER.indexOf(b.muscleGroup) ||
        a.slug.localeCompare(b.slug),
    );
}

export async function getCatalogBySlugs(
  slugs: string[],
): Promise<Map<string, CatalogExercise>> {
  const rows = await prisma.exercise.findMany({ where: { slug: { in: slugs } } });
  return new Map(rows.map((r) => [r.slug, toCatalog(r)]));
}
