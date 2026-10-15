import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { Alert, PageHeader } from "@/components/ui";
import { BillingCard } from "@/components/BillingCard";
import { MySubscription } from "@/components/MySubscription";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getQuotaStatus } from "@/lib/billing/quota";
import { availablePlans, billingEnabled } from "@/lib/billing/stripe";
import { getSubscriptionSummary } from "@/lib/billing/subscription";
import { getMonthlyLimits } from "@/lib/billing/settings";
import { canTeach } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Assinatura Stripe do usuário (melhor esforço; falha não derruba a página). */
async function loadSubscription(userId: string) {
  if (!billingEnabled()) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true },
  });
  if (!user?.stripeSubscriptionId) return null;
  try {
    return await getSubscriptionSummary(user.stripeSubscriptionId);
  } catch (error) {
    console.error("[billing:page] falha ao ler assinatura", error);
    return null;
  }
}

/** Planos e assinatura: cota, planos pagos (professor) e autoatendimento. */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { billing } = await searchParams;
  const t = await getTranslations();

  if (!canTeach(session.role)) {
    return (
      <>
        <AppHeader variant="app" />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <PageHeader title={t("billing.pageTitle")} />
          <Alert tone="info">
            {t("billing.alunoNotice")}{" "}
            <Link href="/dashboard" className="font-medium underline">
              {t("billing.backToDashboard")}
            </Link>
          </Alert>
        </main>
      </>
    );
  }

  const [quota, subscription] = await Promise.all([
    getQuotaStatus(session.id),
    loadSubscription(session.id),
  ]);
  const checkoutOn = billingEnabled();
  const planLimits = checkoutOn ? await getMonthlyLimits() : null;
  const paidPlans =
    planLimits !== null
      ? availablePlans().map((plan) => ({ plan, limit: planLimits[plan] }))
      : [];

  // Retorno do Stripe Checkout (?billing=success|cancel)
  const billingNotice =
    billing === "success"
      ? { tone: "success" as const, text: t("billing.success") }
      : billing === "cancel"
        ? { tone: "info" as const, text: t("billing.cancelled") }
        : null;

  return (
    <>
      <AppHeader variant="app" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title={t("billing.pageTitle")}
          subtitle={t("billing.pageSubtitle")}
        />

        {billingNotice && (
          <Alert
            tone={billingNotice.tone}
            className="mb-4"
            data-testid="billing-notice"
          >
            {billingNotice.text}
          </Alert>
        )}

        <div className="flex flex-col gap-4">
          <BillingCard
            quota={quota}
            checkoutEnabled={checkoutOn}
            plans={paidPlans}
          />
          <MySubscription subscription={subscription} plan={quota.plan} />
        </div>
      </main>
    </>
  );
}
