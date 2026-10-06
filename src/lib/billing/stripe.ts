import type Stripe from "stripe";

/**
 * Integração com Stripe em modo "lazy": se as chaves não estiverem
 * configuradas, o app funciona apenas com o plano FREE e as rotas de
 * billing respondem 503 billingDisabled (a UI esconde o botão de upgrade).
 */

export function billingEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_PRICE_ID?.trim(),
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
