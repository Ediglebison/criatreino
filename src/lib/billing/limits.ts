// Limites de geração de treino por plano.
// FREE é a cota grátis do professor; PRO é o plano pago (Stripe).

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Gerações/mês do plano grátis (env BILLING_FREE_MONTHLY_LIMIT, padrão 3). */
export const FREE_MONTHLY_LIMIT = intEnv("BILLING_FREE_MONTHLY_LIMIT", 3);

/**
 * Gerações/mês do plano PRO (env BILLING_PRO_MONTHLY_LIMIT, padrão 500).
 * Não é infinito de propósito: limita o custo de IA mesmo para clientes pagos.
 */
export const PRO_MONTHLY_LIMIT = intEnv("BILLING_PRO_MONTHLY_LIMIT", 500);

export type Plan = "FREE" | "PRO";

export function monthlyLimit(plan: Plan): number {
  return plan === "PRO" ? PRO_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
}

/** Início do período de cobrança (dia 1 do mês corrente, em UTC). */
export function currentPeriodStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

/** Fim do período (início do próximo mês) — quando a cota renova. */
export function periodEnd(periodStart: Date): Date {
  return new Date(
    Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    ),
  );
}
