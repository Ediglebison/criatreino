/**
 * Preços de referência dos planos pagos (BRL), para exibir receita/MRR no
 * painel admin quando o Stripe não está configurado.
 *
 * ⚠️ Mantenha em sincronia com os valores cobrados nos `STRIPE_PRICE_ID_*`
 * (scripts/stripe-setup.mjs) e com as strings de `messages/*.json`
 * (billing.priceBasic/pricePro/priceUltimate). O painel prioriza o valor
 * vindo do próprio Stripe quando `billingEnabled()`.
 */
export const PLAN_PRICE_BRL: Record<"BASIC" | "PRO" | "ULTIMATE", number> = {
  BASIC: 8.9,
  PRO: 29.9,
  ULTIMATE: 119.9,
};

/**
 * Lê os preços reais configurados no Stripe (1 chamada por plano, em paralelo).
 * Em caso de falha de um plano, cai para `PLAN_PRICE_BRL`.
 */
export async function getPlanPricesFromStripe(
  priceIds: { plan: "BASIC" | "PRO" | "ULTIMATE"; priceId: string }[],
): Promise<Record<"BASIC" | "PRO" | "ULTIMATE", { amountBRL: number; source: "stripe" | "static" }>> {
  const result = {} as Record<
    "BASIC" | "PRO" | "ULTIMATE",
    { amountBRL: number; source: "stripe" | "static" }
  >;
  for (const plan of ["BASIC", "PRO", "ULTIMATE"] as const) {
    result[plan] = { amountBRL: PLAN_PRICE_BRL[plan], source: "static" };
  }

  if (priceIds.length === 0) return result;

  try {
    const { getStripe } = await import("@/lib/billing/stripe");
    const stripe = await getStripe();
    if (!stripe) return result;

    await Promise.all(
      priceIds.map(async ({ plan, priceId }) => {
        try {
          const price = await stripe.prices.retrieve(priceId);
          if (price.unit_amount !== null && price.unit_amount !== undefined) {
            result[plan] = { amountBRL: price.unit_amount / 100, source: "stripe" };
          }
        } catch {
          // mantém o valor estático
        }
      }),
    );
  } catch {
    // mantém os valores estáticos
  }
  return result;
}
