import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAllCatalog } from "@/lib/workout/catalog";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/types";

/**
 * GET /api/exercises?muscleGroup=CHEST&exclude=slug1,slug2
 * Catálogo de exercícios para a UI de substituição.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const groupParam = searchParams.get("muscleGroup");
    const exclude = (searchParams.get("exclude") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const group = MUSCLE_GROUPS.includes(groupParam as MuscleGroup)
      ? (groupParam as MuscleGroup)
      : null;

    let catalog = await getAllCatalog();

    if (group) {
      catalog = catalog.filter(
        (e) => e.muscleGroup === group || e.secondaryMuscles.includes(group),
      );
    }
    if (exclude.length > 0) {
      catalog = catalog.filter((e) => !exclude.includes(e.slug));
    }

    return NextResponse.json({ exercises: catalog });
  } catch (error) {
    console.error("[exercises]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
