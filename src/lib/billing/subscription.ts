import type Stripe from "stripe";
import { getStripe } from "./stripe";

export type SubscriptionSummary = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null; // ISO
};

/**
 * Extrai o resumo que exibimos da assinatura de forma defensiva
 * (a API do Stripe muda entre versões — ver admin/subscriptions/page.tsx).
 */
function summarizeSubscription(subscription: Stripe.Subscription): SubscriptionSummary {
  const item = subscription.items.data[0];
  const legacy = subscription as unknown as { current_period_end?: number };
  const periodEnd = item?.current_period_end ?? legacy.current_period_end ?? null;
  return {
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

/** Resumo ao vivo da assinatura, ou null se o Stripe não estiver configurado. */
export async function getSubscriptionSummary(
  subscriptionId: string,
): Promise<SubscriptionSummary | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return summarizeSubscription(subscription);
}

/**
 * Agenda o cancelamento (`cancel=true`) ou remove o agendamento da assinatura
 * Stripe (cancel_at_period_end). Idempotente. Lança se o Stripe falhar ou se
 * o billing não estiver configurado — o chamador decide como responder.
 */
export async function setCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean,
): Promise<SubscriptionSummary> {
  const stripe = await getStripe();
  if (!stripe) {
    throw new Error("Stripe não configurado");
  }
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: cancel,
  });
  return summarizeSubscription(subscription);
}
