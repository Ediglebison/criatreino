import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
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
import {
  summarizeSubscription,
  type SubscriptionSummary,
} from "@/lib/billing/subscription";
import { AdminSubscriptions, type AdminSubscription } from "@/components/admin/AdminSubscriptions";

export const dynamic = "force-dynamic";

/**
 * Assinaturas: usuários em plano pago ou com customer/subscription do Stripe,
 * com status ao vivo quando o Stripe está configurado.
 */
export default async function AdminSubscriptionsPage() {
  // Guard por página (defense-in-depth): o fallthrough de /api/<path> cai aqui
  // com locale="api" e o guard do layout só redireciona a UI — dados já
  // serializadas no flight stream vazariam. Nada pode ser buscado antes desta
  // checagem (getTranslations/prisma/stripe).
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

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
  const live = new Map<string, SubscriptionSummary | null>();
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
