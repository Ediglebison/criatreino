import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { BillingCard } from "@/components/BillingCard";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getQuotaStatus } from "@/lib/billing/quota";
import { availablePlans, billingEnabled } from "@/lib/billing/stripe";
import { getMonthlyLimits } from "@/lib/billing/settings";
import { canTeach } from "@/lib/roles";

export const dynamic = "force-dynamic";

function formatDate(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ billing?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { locale } = await params;
  const { billing } = await searchParams;
  const t = await getTranslations();
  const isProfessor = canTeach(session.role);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [workouts, students, monthCount] = await Promise.all([
    prisma.workout.findMany({
      where: {
        OR: [
          { ownerId: session.id },
          { createdById: session.id },
          { assignments: { some: { studentId: session.id } } },
        ],
      },
      include: {
        owner: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { days: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    isProfessor
      ? prisma.user.count({ where: { role: "ALUNO", professorId: session.id } })
      : Promise.resolve(0),
    prisma.workout.count({
      where: {
        createdAt: { gte: startOfMonth },
        OR: [{ ownerId: session.id }, { createdById: session.id }],
      },
    }),
  ]);

  const totalWorkouts = await prisma.workout.count({
    where: {
      OR: [
        { ownerId: session.id },
        { createdById: session.id },
        { assignments: { some: { studentId: session.id } } },
      ],
    },
  });

  // Cota mensal de gerações (só professores geram treinos)
  const quota = isProfessor ? await getQuotaStatus(session.id) : null;
  const checkoutOn = isProfessor && billingEnabled();
  // Planos pagos com preço configurado (para a UI de assinatura)
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
          title={t("dashboard.welcome", { name: session.name })}
          subtitle={
            isProfessor
              ? t("dashboard.subtitleProfessor")
              : t("dashboard.subtitleAluno")
          }
          actions={
            <Link
              href="/workouts/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              + {t("nav.newWorkout")}
            </Link>
          }
        />

        {/* Retorno do Stripe Checkout */}
        {billingNotice && (
          <Alert tone={billingNotice.tone} className="mb-4" data-testid="billing-notice">
            {billingNotice.text}
          </Alert>
        )}

        {/* Estatísticas */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={t("dashboard.stats.workouts")} value={totalWorkouts} />
          <StatCard label={t("dashboard.stats.month")} value={monthCount} />
          {isProfessor && (
            <StatCard label={t("dashboard.stats.students")} value={students} />
          )}
        </div>

        {/* Plano e cota de gerações (professor) */}
        {quota && (
          <div className="mt-4">
            <BillingCard quota={quota} checkoutEnabled={checkoutOn} plans={paidPlans} />
          </div>
        )}

        {/* Treinos recentes */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">
              {session.role === "ALUNO"
                ? t("dashboard.myWorkouts")
                : t("dashboard.recentWorkouts")}
            </h2>
            {workouts.length > 0 && (
              <span className="text-sm text-zinc-500">
                {t("dashboard.seeAll")}
              </span>
            )}
          </div>

          {workouts.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-zinc-600">
                {session.role === "ALUNO"
                  ? t("dashboard.emptyAlunoWorkouts")
                  : t("dashboard.emptyWorkouts")}
              </p>
              {session.role !== "ALUNO" && (
                <Link
                  href="/workouts/new"
                  className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {t("dashboard.emptyWorkoutsCta")}
                </Link>
              )}
            </Card>
          ) : (
            <ul className="grid gap-3">
              {workouts.map((w) => (
                <li key={w.id}>
                  <Link href={`/workouts/${w.id}`}>
                    <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900">
                          {w.title}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {t("workout.athlete")}: {w.owner.name} · {w._count.days}{" "}
                          {t("common.days")} ·{" "}
                          {formatDate(w.updatedAt, locale)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={w.status === "FINAL" ? "success" : "warning"}>
                          {w.status === "FINAL"
                            ? t("workout.statusFINAL")
                            : t("workout.statusDRAFT")}
                        </Badge>
                        <Badge tone="outline">
                          {w.source === "AI"
                            ? t("workout.sourceAI")
                            : w.source === "SIMULATED"
                              ? t("workout.sourceSIMULATED")
                              : t("workout.sourceMANUAL")}
                        </Badge>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Alunos (professor) */}
        {isProfessor && (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">
                {t("dashboard.studentsTitle")}
              </h2>
              <Link
                href="/students"
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                {t("nav.students")} →
              </Link>
            </div>
            <Card>
              {students === 0 ? (
                <div className="text-sm text-zinc-600">
                  <p>{t("dashboard.emptyStudents")}</p>
                  <Link
                    href="/students"
                    className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    {t("dashboard.newStudent")}
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-zinc-600">
                  {students} {t("dashboard.studentsTitle").toLowerCase()} ·{" "}
                  <Link
                    href="/students"
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {t("nav.students")} →
                  </Link>
                </p>
              )}
            </Card>
          </section>
        )}
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-zinc-900">{value}</p>
    </Card>
  );
}
