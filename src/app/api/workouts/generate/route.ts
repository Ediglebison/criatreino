import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { athleteProfileSchema, type Locale } from "@/lib/types";
import { generateWorkout } from "@/lib/workout/generate";
import { GenerationError } from "@/lib/workout/error";
import { getCatalogForProfile } from "@/lib/workout/catalog";

export const maxDuration = 60;

const bodySchema = z.object({
  athleteUserId: z.string().min(1),
  profile: athleteProfileSchema,
  locale: z.enum(["pt-BR", "en-US"]).default("pt-BR"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", issues: parsed.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }

    const { athleteUserId, profile, locale } = parsed.data;

    // Só é permitido gerar para si mesmo ou para um aluno vinculado
    const athlete = await prisma.user.findUnique({
      where: { id: athleteUserId },
      select: { id: true, name: true, role: true, professorId: true },
    });
    if (!athlete) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    const isSelf = athlete.id === session.id;
    const isMyStudent = athlete.professorId === session.id;
    if (!isSelf && !isMyStudent) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const catalog = await getCatalogForProfile(profile.equipment);
    if (catalog.length === 0) {
      return NextResponse.json({ error: "emptyCatalog" }, { status: 400 });
    }

    const { draft, source } = await generateWorkout({
      profile,
      athleteName: athlete.name,
      locale: locale as Locale,
      catalog,
    });

    return NextResponse.json({ draft, source, catalog });
  } catch (error) {
    if (error instanceof GenerationError) {
      console.error("[generate]", error.message);
      return NextResponse.json({ error: "generationFailed" }, { status: 502 });
    }
    console.error("[generate]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
