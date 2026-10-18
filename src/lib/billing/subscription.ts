import { getStripe } from "./stripe";

export type SubscriptionSummary = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null; // ISO
  priceId: string | null;
};

/**
 * Extrai o resumo que exibimos da assinatura de forma defensiva: a API do
 * Stripe muda entre versões, então cada campo é lido com tolerância a ausência.
 * É a fonte única do resumo — as telas self-service e admin compartilham este shape.
 */
export function summarizeSubscription(subscription: unknown): SubscriptionSummary {
  const sub = subscription as Record<string, unknown>;
  const items = sub.items as { data?: Record<string, unknown>[] } | undefined;
  const item = items?.data?.[0];
  const price = item?.price as { id?: string } | undefined;
  const periodEnd =
    (item?.current_period_end as number | undefined) ??
    (sub.current_period_end as number | undefined) ??
    null;
  return {
    status: String(sub.status ?? "unknown"),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    priceId: typeof price?.id === "string" ? price.id : null,
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
