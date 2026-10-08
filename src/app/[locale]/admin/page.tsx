import { getTranslations } from "next-intl/server";
import { Badge, Card, CardTitle } from "@/components/ui";
import { planTone, roleTone } from "@/components/admin/badges";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { currentPeriodStart, type Plan } from "@/lib/billing/limits";
import {
  PLAN_PRICE_BRL,
  getPlanPricesFromStripe,
} from "@/lib/billing/prices";
import { availablePlans, billingEnabled, priceIdForPlan } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </Card>
  );
}

function formatDate(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** Visão geral: contatos, volume, receita e cadastros recentes. */
export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  const monthStart = currentPeriodStart();
  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 30);

  const [
    professors,
    students,
    admins,
    workouts,
    assignments,
    exercises,
    generations,
    newUsers30d,
    perPlan,
    recent,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "PROFESSOR" } }),
    prisma.user.count({ where: { role: "ALUNO" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.workout.count(),
    prisma.assignment.count(),
    prisma.exercise.count(),
    prisma.usageRecord.count({
      where: { periodStart: monthStart, status: "COMPLETED" },
    }),
    prisma.user.count({ where: { createdAt: { gte: since30d } } }),
    prisma.user.groupBy({ by: ["plan"], _count: true }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        createdAt: true,
      },
    }),
  ]);

  const countOf = (plan: Plan): number =>
    perPlan.find((row) => row.plan === plan)?._count ?? 0;

  // Receita: valores reais do Stripe quando configurado; senão referência.
  const configured = availablePlans();
  const prices = billingEnabled()
    ? await getPlanPricesFromStripe(
        configured.map((plan) => ({ plan, priceId: priceIdForPlan(plan)! })),
      )
    : null;
  const priceOf = (plan: "BASIC" | "PRO" | "ULTIMATE"): number =>
    prices?.[plan]?.amountBRL ?? PLAN_PRICE_BRL[plan];
  const mrr =
    countOf("BASIC") * priceOf("BASIC") +
    countOf("PRO") * priceOf("PRO") +
    countOf("ULTIMATE") * priceOf("ULTIMATE");

  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
  }).format(mrr);

  const paidRows = (["BASIC", "PRO", "ULTIMATE"] as const)
    .map((plan) => ({ plan, count: countOf(plan) }))
    .filter((row) => row.count > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Métricas */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("admin.overview.professors")} value={professors} />
        <Stat label={t("admin.overview.students")} value={students} />
        <Stat label={t("admin.overview.admins")} value={admins} />
        <Stat label={t("admin.overview.newUsers30d")} value={newUsers30d} />
        <Stat label={t("admin.overview.workouts")} value={workouts} />
        <Stat label={t("admin.overview.assignments")} value={assignments} />
        <Stat label={t("admin.overview.exercises")} value={exercises} />
        <Stat label={t("admin.overview.generationsMonth")} value={generations} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Receita */}
        <Card>
          <CardTitle>{t("admin.overview.revenue")}</CardTitle>
          <p className="mt-3 text-3xl font-semibold text-zinc-900">{money}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {t("admin.overview.revenueHint")} ·{" "}
            {prices
              ? t("admin.overview.revenueStripe")
              : t("admin.overview.revenueStatic")}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="outline">
              {t("billing.planFree")}: {countOf("FREE")}
            </Badge>
            {paidRows.map(({ plan, count }) => (
              <Badge key={plan} tone={planTone(plan)}>
                {t(`billing.plan${capitalize(plan)}`)}: {count}
              </Badge>
            ))}
          </div>
          {paidRows.length === 0 && (
            <p className="mt-3 text-sm text-zinc-500">
              {t("admin.overview.noPaid")}
            </p>
          )}
        </Card>

        {/* Cadastros recentes */}
        <Card className="p-0">
          <div className="px-5 pt-5">
            <CardTitle>{t("admin.overview.recent")}</CardTitle>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-2.5 font-medium">
                    {t("common.name")}
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    {t("common.status")}
                  </th>
                  <th className="px-5 py-2.5 text-right font-medium">
                    {t("common.date")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-zinc-900">{user.name}</p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={roleTone(user.role)}>
                          {t(`roles.${user.role}`)}
                        </Badge>
                        <Badge tone={planTone(user.plan)}>
                          {t(`billing.plan${capitalize(user.plan)}`)}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right text-zinc-500">
                      {formatDate(user.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-zinc-100 px-5 py-3">
            <Link
              href="/admin/users"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              {t("admin.nav.users")} →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
