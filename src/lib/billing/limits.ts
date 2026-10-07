// Limites de geração de treino por plano.
// FREE é a cota grátis do professor; BASIC/PRO/ULTIMATE são os planos pagos (Stripe).

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Gerações/mês do plano grátis (env BILLING_FREE_MONTHLY_LIMIT, padrão 3). */
export const FREE_MONTHLY_LIMIT = intEnv("BILLING_FREE_MONTHLY_LIMIT", 3);

/**
 * Gerações/mês dos planos pagos (env BILLING_*_MONTHLY_LIMIT, padrões abaixo).
 * Não é infinito de propósito: limita o custo de IA mesmo para clientes pagos.
 */
export const BASIC_MONTHLY_LIMIT = intEnv("BILLING_BASIC_MONTHLY_LIMIT", 20);
export const PRO_MONTHLY_LIMIT = intEnv("BILLING_PRO_MONTHLY_LIMIT", 100);
export const ULTIMATE_MONTHLY_LIMIT = intEnv(
  "BILLING_ULTIMATE_MONTHLY_LIMIT",
  500,
);

export type Plan = "FREE" | "BASIC" | "PRO" | "ULTIMATE";

/** Planos pagos, do mais barato ao mais caro. */
export const PAID_PLANS = ["BASIC", "PRO", "ULTIMATE"] as const;

const LIMITS: Record<Plan, number> = {
  FREE: FREE_MONTHLY_LIMIT,
  BASIC: BASIC_MONTHLY_LIMIT,
  PRO: PRO_MONTHLY_LIMIT,
  ULTIMATE: ULTIMATE_MONTHLY_LIMIT,
};

export function monthlyLimit(plan: Plan): number {
  return LIMITS[plan] ?? FREE_MONTHLY_LIMIT;
}

/** Início do período de cobrança (dia 1 do mês corrente, em UTC). */
export function currentPeriodStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

/** Fim do período de cobrança (dia 1 do mês seguinte, em UTC). */
export function periodEnd(periodStart: Date): Date {
  return new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );
}
