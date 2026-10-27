import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  AdminExercises,
  type AdminExercise,
} from "@/components/admin/AdminExercises";

export const dynamic = "force-dynamic";

/** Catálogo de exercícios para gestão no painel (CRUD no cliente). */
export default async function AdminExercisesPage() {
  // Guard por página (defense-in-depth): o fallthrough de /api/<path> cai aqui
  // com locale="api" e o guard do layout só redireciona a UI — dados já
  // serializadas no flight stream vazariam. Nada pode ser buscado antes desta
  // checagem (prisma).
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const rows = await prisma.exercise.findMany({
    orderBy: { namePt: "asc" },
    select: {
      id: true,
      slug: true,
      namePt: true,
      nameEn: true,
      muscleGroup: true,
      equipment: true,
      secondaryMuscles: true,
      warningPt: true,
      warningEn: true,
      _count: { select: { workoutExercises: true } },
    },
  });

  const items: AdminExercise[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    namePt: row.namePt,
    nameEn: row.nameEn,
    muscleGroup: row.muscleGroup,
    equipment: row.equipment,
    secondaryMuscles: Array.isArray(row.secondaryMuscles)
      ? (row.secondaryMuscles.filter((v): v is string => typeof v === "string"))
      : [],
    warningPt: row.warningPt,
    warningEn: row.warningEn,
    usageCount: row._count.workoutExercises,
  }));

  return <AdminExercises exercises={items} />;
}
