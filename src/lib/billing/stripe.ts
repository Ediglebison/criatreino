import type Stripe from "stripe";
import { PAID_PLANS, type Plan } from "./limits";

/**
 * Integração com Stripe em modo "lazy": se as chaves não estiverem
 * configuradas, o app funciona apenas com o plano FREE e as rotas de
 * billing respondem 503 billingDisabled (a UI esconde os planos pagos).
 *
 * Env vars por plano:
 *   STRIPE_PRICE_ID_BASIC    (R$ 8,90/mês  → 20 gerações)
 *   STRIPE_PRICE_ID_PRO      (R$ 29,90/mês → 100 gerações)
 *   STRIPE_PRICE_ID_ULTIMATE (R$ 119,90/mês→ 500 gerações)
 */

const PRICE_ENV: Record<(typeof PAID_PLANS)[number], string> = {
  BASIC: "STRIPE_PRICE_ID_BASIC",
  PRO: "STRIPE_PRICE_ID_PRO",
  ULTIMATE: "STRIPE_PRICE_ID_ULTIMATE",
};

/** Preço recorrente mensal do plano pago, ou null se não configurado. */
export function priceIdForPlan(plan: (typeof PAID_PLANS)[number]): string | null {
  const id = process.env[PRICE_ENV[plan]]?.trim();
  return id || null;
}

/** Planos pagos com preço configurado (é o que a UI oferece no checkout). */
export function availablePlans(): (typeof PAID_PLANS)[number][] {
  return PAID_PLANS.filter((p) => priceIdForPlan(p) !== null);
}

/** Inverte o lookup: id de preço Stripe → plano interno. */
export function planForPriceId(priceId: string): Plan | null {
  for (const plan of PAID_PLANS) {
    if (priceIdForPlan(plan) === priceId) return plan;
  }
  return null;
}

/** Billing configurado: chave secreta + ao menos um preço de plano. */
export function billingEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() && availablePlans().length > 0,
  );
}

export function webhookEnabled(): boolean {
  return billingEnabled() && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

let client: Stripe | null = null;

/** Cliente Stripe (singleton) ou null quando o billing não está configurado. */
export async function getStripe(): Promise<Stripe | null> {
  if (!billingEnabled()) return null;
  if (client) return client;
  const { default: Stripe } = await import("stripe");
  client = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
  return client;
}
