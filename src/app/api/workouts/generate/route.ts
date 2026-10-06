import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { athleteProfileSchema, type Locale } from "@/lib/types";
import { generateWorkout } from "@/lib/workout/generate";
import { GenerationError } from "@/lib/workout/error";
import { getCatalogForProfile } from "@/lib/workout/catalog";
import { reserveQuota, settleQuota } from "@/lib/billing/quota";
import { clientIp, consume, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 60;

const bodySchema = z.object({
  athleteUserId: z.string().min(1),
  profile: athleteProfileSchema,
  locale: z.enum(["pt-BR", "en-US"]).default("pt-BR"),
});

// Teto por IP além da cota mensal: segura rajadas de quem tenta furar a
// cota com requisições paralelas baratas (ex.: modo simulado).
const IP_MAX = 10;
const IP_WINDOW_S = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Geração é função do professor (aluno não prescreve treino).
    if (session.role !== "PROFESSOR") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const byIp = await consume(
      `generate:ip:${clientIp(request)}`,
      IP_MAX,
      IP_WINDOW_S,
    );
    if (!byIp.allowed) {
      return tooManyRequests(byIp.retryAfterSeconds);
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

    // Reserva atômica da cota mensal; sem cota livre → 402 com o status
    // para a UI mostrar o contador e o botão de upgrade.
    const reservation = await reserveQuota(session.id);
    if (!reservation.ok) {
      return NextResponse.json(
        { error: "quotaExceeded", quota: reservation.status },
        { status: 402 },
      );
    }

    let draft;
    let source;
    try {
      ({ draft, source } = await generateWorkout({
        profile,
        athleteName: athlete.name,
        locale: locale as Locale,
        catalog,
      }));
    } catch (error) {
      // Geração falhou → estorna a reserva (o professor não perde cota).
      await settleQuota(reservation.recordId, "FAILED");
      throw error;
    }

    await settleQuota(reservation.recordId, "COMPLETED", source);

    return NextResponse.json({
      draft,
      source,
      catalog,
      quota: reservation.status,
    });
  } catch (error) {
    if (error instanceof GenerationError) {
      console.error("[generate]", error.message);
      return NextResponse.json({ error: "generationFailed" }, { status: 502 });
    }
    console.error("[generate]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
