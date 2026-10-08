import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
import { prisma } from "@/lib/db";
import {
  billingEnabled,
  getStripe,
  availablePlans,
  priceIdForPlan,
} from "@/lib/billing/stripe";
import {
  PLAN_PRICE_BRL,
  getPlanPricesFromStripe,
} from "@/lib/billing/prices";
import { AdminSubscriptions, type AdminSubscription } from "@/components/admin/AdminSubscriptions";

export const dynamic = "force-dynamic";

type StripeSummary = {
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  priceId: string | null;
};

/** Extrai o que exibimos da assinatura de forma defensiva (API muda entre versões). */
function summarizeSubscription(sub: unknown): StripeSummary {
  const s = sub as Record<string, unknown>;
  const items = s.items as { data?: Record<string, unknown>[] } | undefined;
  const item = items?.data?.[0];
  const price = item?.price as { id?: string } | undefined;
  const periodEnd =
    (item?.current_period_end as number | undefined) ??
    (s.current_period_end as number | undefined) ??
    null;
  return {
    status: String(s.status ?? "unknown"),
    cancelAtPeriodEnd: s.cancel_at_period_end === true,
    periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    priceId: typeof price?.id === "string" ? price.id : null,
  };
}

/**
 * Assinaturas: usuários em plano pago ou com customer/subscription do Stripe,
 * com status ao vivo quando o Stripe está configurado.
 */
export default async function AdminSubscriptionsPage() {
  const t = await getTranslations();

  const users = await prisma.user.findMany({
    where: {
      OR: [{ plan: { not: "FREE" } }, { stripeSubscriptionId: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  const on = billingEnabled();
  const stripe = on ? await getStripe() : null;

  // Status ao vivo de cada assinatura (melhor esforço; falha não derruba a tela).
  const live = new Map<string, StripeSummary | null>();
  if (stripe) {
    await Promise.all(
      users.map(async (user) => {
        if (!user.stripeSubscriptionId) {
          live.set(user.id, null);
          return;
        }
        try {
          const sub = await stripe.subscriptions.retrieve(
            user.stripeSubscriptionId,
          );
          live.set(user.id, summarizeSubscription(sub));
        } catch {
          live.set(user.id, null);
        }
      }),
    );
  }

  const configured = availablePlans();
  const prices = on
    ? await getPlanPricesFromStripe(
        configured.map((plan) => ({ plan, priceId: priceIdForPlan(plan)! })),
      )
    : null;

  const items: AdminSubscription[] = users.map((user) => {
    const summary = live.get(user.id) ?? null;
    const price = prices?.[user.plan as "BASIC" | "PRO" | "ULTIMATE"];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      amountBRL:
        price?.amountBRL ??
        (user.plan === "FREE"
          ? null
          : PLAN_PRICE_BRL[user.plan as "BASIC" | "PRO" | "ULTIMATE"] ?? null),
      live: summary,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {!on && <Alert tone="info">{t("admin.subs.billingOff")}</Alert>}
      <p className="text-sm text-zinc-500">{t("admin.subs.hint")}</p>

      {items.length === 0 ? (
        <Card className="text-sm text-zinc-500">{t("admin.subs.empty")}</Card>
      ) : (
        <AdminSubscriptions items={items} testMode={isTestMode()} />
      )}
    </div>
  );
}

function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test");
}
