import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  currentPeriodStart,
  monthlyLimit,
  periodEnd,
  type Plan,
} from "./limits";

/**
 * Controle de cota mensal de gerações.
 *
 * Estratégia: a reserva é um INSERT condicional atômico no Postgres
 * (`INSERT ... SELECT ... WHERE count < limit`), então duas requisições
 * paralelas não conseguem estourar a cota ao mesmo tempo.
 *
 * - PENDING  → reserva feita; se a geração falhar vira FAILED (estorno)
 * - COMPLETED→ geração bem-sucedida (conta para a cota)
 * - FAILED   → não conta
 * PENDING com mais de PENDING_TTL_MS é considerado órfão (função morta no
 * meio) e fica de fora da contagem, para a cota não travar para sempre.
 */

const PENDING_TTL_MS = 10 * 60 * 1000;

export type QuotaStatus = {
  plan: Plan;
  limit: number;
  used: number;
  remaining: number;
  periodStart: string; // ISO
  resetsAt: string; // ISO
};

async function getPlan(userId: string): Promise<Plan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  return user?.plan ?? "FREE";
}

function pendingCutoff(): Date {
  return new Date(Date.now() - PENDING_TTL_MS);
}

async function countConsumed(
  userId: string,
  periodStart: Date,
): Promise<number> {
  return prisma.usageRecord.count({
    where: {
      userId,
      periodStart,
      OR: [
        { status: "COMPLETED" },
        { status: "PENDING", createdAt: { gt: pendingCutoff() } },
      ],
    },
  });
}

async function buildStatus(
  plan: Plan,
  userId: string,
  periodStart: Date,
  used?: number,
): Promise<QuotaStatus> {
  const limit = monthlyLimit(plan);
  const consumed = used ?? (await countConsumed(userId, periodStart));
  return {
    plan,
    limit,
    used: consumed,
    remaining: Math.max(0, limit - consumed),
    periodStart: periodStart.toISOString(),
    resetsAt: periodEnd(periodStart).toISOString(),
  };
}

/** Status da cota do usuário no mês corrente. */
export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const plan = await getPlan(userId);
  const periodStart = currentPeriodStart();
  return buildStatus(plan, userId, periodStart);
}

export type Reservation =
  | { ok: true; recordId: string; status: QuotaStatus }
  | { ok: false; status: QuotaStatus };

/**
 * Reserva 1 geração da cota. Retorna `ok:false` quando a cota estourou
 * (o chamador deve responder 402 com o status para a UI exibir).
 */
export async function reserveQuota(userId: string): Promise<Reservation> {
  const plan = await getPlan(userId);
  const periodStart = currentPeriodStart();
  const limit = monthlyLimit(plan);
  const recordId = randomUUID();
  const cutoff = pendingCutoff();
  // Timestamp vem do JS (UTC), não de NOW(): o fuso do servidor (ex.:
  // America/Sao_Paulo) faria o registro nascer "3h no passado" e ficar
  // fora da contagem de PENDING fresco.
  const now = new Date();

  // INSERT condicional: só entra se o consumo atual (incluindo reservas
  // frescas) ainda for menor que o limite.
  const inserted = await prisma.$executeRaw`
    INSERT INTO "UsageRecord" ("id", "userId", "status", "periodStart", "createdAt")
    SELECT ${recordId}, ${userId}, 'PENDING', ${periodStart}, ${now}
    WHERE (
      SELECT COUNT(*) FROM "UsageRecord"
      WHERE "userId" = ${userId}
        AND "periodStart" = ${periodStart}
        AND (
          "status" = 'COMPLETED'
          OR ("status" = 'PENDING' AND "createdAt" > ${cutoff})
        )
    ) < ${limit}
  `;

  const used = await countConsumed(userId, periodStart);

  if (inserted === 0) {
    return { ok: false, status: await buildStatus(plan, userId, periodStart, used) };
  }
  return {
    ok: true,
    recordId,
    status: await buildStatus(plan, userId, periodStart, used),
  };
}

/** Finaliza a reserva: COMPLETED conta para a cota, FAILED estorna. */
export async function settleQuota(
  recordId: string,
  status: "COMPLETED" | "FAILED",
  source?: string,
): Promise<void> {
  try {
    await prisma.usageRecord.update({
      where: { id: recordId },
      data: {
        status,
        source: source ?? null,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    // Não derruba a resposta do usuário por causa do contador.
    console.error("[quota] falha ao finalizar registro de uso", error);
  }
}

/**
 * Vincula uma geração COMPLETED ao treino salvo (auditoria).
 * Silencioso se o registro não pertencer ao usuário.
 */
export async function linkUsageToWorkout(
  usageId: string,
  userId: string,
  workoutId: string,
): Promise<void> {
  try {
    await prisma.usageRecord.updateMany({
      where: { id: usageId, userId, status: "COMPLETED" },
      data: { workoutId },
    });
  } catch (error) {
    console.error("[quota] falha ao vincular uso ao treino", error);
  }
}
