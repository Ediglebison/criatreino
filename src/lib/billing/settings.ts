import { prisma } from "@/lib/db";
import { monthlyLimit, type Plan } from "./limits";

/**
 * Limites de cota administráveis pelo painel /admin.
 *
 * Fonte de verdade em `AdminSetting` (tabela); `.env` (BILLING_*_MONTHLY_LIMIT)
 * é o padrão quando não há override. Cache em memória por TTL_MS para não
 * bater no banco a cada requisição — o painel chama `invalidateLimitCache()`
 * após gravar, então a mudança vale na hora no processo atual; em instâncias
 * extras o TTL (15s) propaga sozinho.
 *
 * Falha de banco cai no `.env` em vez de derrubar a geração de treino.
 */

const PLAN_KEYS: Record<Plan, string> = {
  FREE: "billing.limit.free",
  BASIC: "billing.limit.basic",
  PRO: "billing.limit.pro",
  ULTIMATE: "billing.limit.ultimate",
};

const TTL_MS = 15_000;

type LimitsCache = {
  limits: Record<Plan, number>;
  overrides: Partial<Record<Plan, number>>;
  at: number;
};

let cache: LimitsCache | null = null;

const PLANS = Object.keys(PLAN_KEYS) as Plan[];

function planForKey(key: string): Plan | null {
  return PLANS.find((p) => PLAN_KEYS[p] === key) ?? null;
}

function fromEnv(): Record<Plan, number> {
  const limits = {} as Record<Plan, number>;
  for (const plan of PLANS) limits[plan] = monthlyLimit(plan);
  return limits;
}

async function load(): Promise<LimitsCache> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  try {
    const rows = await prisma.adminSetting.findMany({
      where: { key: { in: Object.values(PLAN_KEYS) } },
    });
    const overrides: Partial<Record<Plan, number>> = {};
    for (const row of rows) {
      const plan = planForKey(row.key);
      const value = Number.parseInt(row.value, 10);
      if (plan && Number.isFinite(value) && value >= 0) {
        overrides[plan] = value;
      }
    }
    const limits = fromEnv();
    for (const plan of PLANS) {
      if (overrides[plan] !== undefined) limits[plan] = overrides[plan];
    }
    cache = { limits, overrides, at: Date.now() };
    return cache;
  } catch (error) {
    console.error("[billing:settings] falha ao ler limites do banco; usando .env", error);
    return { limits: fromEnv(), overrides: {}, at: Date.now() };
  }
}

/** Limite efetivo do plano (override do painel, senão `.env`). */
export async function getMonthlyLimit(plan: Plan): Promise<number> {
  const { limits } = await load();
  return limits[plan] ?? monthlyLimit(plan);
}

/** Todos os limites efetivos (para UI e cota). */
export async function getMonthlyLimits(): Promise<Record<Plan, number>> {
  const { limits } = await load();
  return limits;
}

/** Overrides gravados no banco (sem os que vêm do `.env`). */
export async function getLimitOverrides(): Promise<Partial<Record<Plan, number>>> {
  const { overrides } = await load();
  return { ...overrides };
}

/**
 * Grava (número ≥ 0) ou limpa (null → volta ao `.env`) o override do plano.
 * Invalida o cache local em seguida.
 */
export async function setMonthlyLimit(plan: Plan, value: number | null): Promise<void> {
  const key = PLAN_KEYS[plan];
  if (value === null) {
    await prisma.adminSetting.deleteMany({ where: { key } });
  } else {
    await prisma.adminSetting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  }
  invalidateLimitCache();
}

/** Estado completo para a tela de configurações do painel. */
export type LimitConfig = {
  plan: Plan;
  value: number;
  envDefault: number;
  source: "db" | "env";
};

export async function getLimitConfigs(): Promise<LimitConfig[]> {
  const [limits, overrides] = await Promise.all([getMonthlyLimits(), getLimitOverrides()]);
  return PLANS.map((plan) => ({
    plan,
    value: limits[plan],
    envDefault: monthlyLimit(plan),
    source: overrides[plan] !== undefined ? "db" : "env",
  }));
}

/** Zera o cache (chamado pelo painel após gravar). */
export function invalidateLimitCache(): void {
  cache = null;
}
