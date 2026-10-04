import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { AssignDialog } from "@/components/AssignDialog";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { exerciseName, exerciseWarning } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const workout = await prisma.workout.findUnique({
    where: { id },
    select: { title: true },
  });
  return workout ? { title: workout.title } : {};
}

function formatDate(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export default async function WorkoutPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { locale, id } = await params;
  const t = await getTranslations();

  const workout = await prisma.workout.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      days: {
        orderBy: { order: "asc" },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: { exercise: true },
          },
        },
      },
      assignments: {
        include: {
          student: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!workout) notFound();

  const visible =
    workout.ownerId === session.id ||
    workout.createdById === session.id ||
    workout.assignments.some((a) => a.studentId === session.id);
  if (!visible) notFound();

  const isCreator = workout.createdById === session.id;
  const receivedViaAssignment = workout.assignments.find(
    (a) => a.studentId === session.id,
  );

  // Resolve os exercícios substituídos (não estão no plano atual)
  const replacedIds = Array.from(
    new Set(
      workout.days
        .flatMap((d) => d.exercises)
        .map((e) => e.replacedFromId)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const replacedMap = new Map(
    (
      replacedIds.length
        ? await prisma.exercise.findMany({ where: { id: { in: replacedIds } } })
        : []
    ).map((ex) => [ex.id, ex]),
  );

  const canAssign =
    isCreator && session.role === "PROFESSOR" && workout.status === "FINAL";

  return (
    <>
      <AppHeader variant="app" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title={workout.title}
          subtitle={
            receivedViaAssignment
              ? t("workout.forAluno.fromProfessor", {
                  name: workout.createdBy.name,
                })
              : undefined
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/workouts/${workout.id}/pdf`}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                ⬇ {t("workout.exportPdf")}
              </a>
              {canAssign && <AssignDialog workoutId={workout.id} />}
            </div>
          }
        />

        {/* Meta */}
        <Card className="mb-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            <Meta label={t("workout.athlete")}>
              {workout.owner.name}
              <span className="block text-xs text-zinc-500">
                {workout.owner.email}
              </span>
            </Meta>
            <Meta label={t("workout.createdBy")}>{workout.createdBy.name}</Meta>
            <Meta label={t("workout.createdAt")}>
              {formatDate(workout.createdAt, locale)}
            </Meta>
            <Meta label={t("workout.source")}>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone={workout.status === "FINAL" ? "success" : "warning"}>
                  {workout.status === "FINAL"
                    ? t("workout.statusFINAL")
                    : t("workout.statusDRAFT")}
                </Badge>
                <Badge tone="outline">
                  {workout.source === "AI"
                    ? t("workout.sourceAI")
                    : workout.source === "SIMULATED"
                      ? t("workout.sourceSIMULATED")
                      : t("workout.sourceMANUAL")}
                </Badge>
              </span>
            </Meta>
          </dl>

          {workout.assignments.length > 0 && isCreator && (
            <p className="mt-4 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
              📤 {t("workout.assign")}:{" "}
              {workout.assignments.map((a) => a.student.name).join(", ")}
            </p>
          )}
        </Card>

        {/* Dias */}
        {workout.days.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-600">{t("workout.emptyDays")}</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {workout.days.map((day, dayIdx) => (
              <Card key={day.id} className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div>
                    <h2 className="font-semibold text-zinc-900">{day.label}</h2>
                    {day.focus && (
                      <p className="text-xs text-zinc-500">{day.focus}</p>
                    )}
                  </div>
                  <Badge tone="outline">
                    {dayIdx + 1}/{workout.days.length}
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-4 py-2.5 font-medium w-10">
                          {t("workout.table.order")}
                        </th>
                        <th className="px-4 py-2.5 font-medium">
                          {t("workout.table.exercise")}
                        </th>
                        <th className="px-4 py-2.5 font-medium w-16">
                          {t("workout.table.sets")}
                        </th>
                        <th className="px-4 py-2.5 font-medium w-24">
                          {t("workout.table.reps")}
                        </th>
                        <th className="px-4 py-2.5 font-medium w-24">
                          {t("workout.table.rest")}
                        </th>
                        <th className="px-4 py-2.5 font-medium">
                          {t("workout.table.notes")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.exercises.map((ex, i) => {
                        const warning = exerciseWarning(
                          ex.exercise,
                          locale,
                        );
                        const original = ex.replacedFromId
                          ? replacedMap.get(ex.replacedFromId)
                          : undefined;
                        return (
                          <tr
                            key={ex.id}
                            className="border-b border-zinc-100 align-top last:border-0"
                          >
                            <td className="px-4 py-3 text-zinc-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-zinc-900">
                                {exerciseName(ex.exercise, locale)}
                              </span>
                              <span className="ml-2">
                                <Badge tone="outline">
                                  {t(
                                    `muscleGroups.${ex.exercise.muscleGroup}`,
                                  )}
                                </Badge>
                              </span>
                              {original && (
                                <p className="mt-0.5 text-xs text-emerald-700">
                                  {t("wizard.reviewStep.replacedFrom", {
                                    name: exerciseName(original, locale),
                                  })}
                                </p>
                              )}
                              {warning && (
                                <p className="mt-0.5 text-xs text-amber-700">
                                  ⚠ {warning}
                                </p>
                              )}
                              {ex.notes && (
                                <p className="mt-0.5 text-xs text-zinc-500">
                                  {ex.notes}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-zinc-700">
                              {ex.sets}
                            </td>
                            <td className="px-4 py-3 text-zinc-700">{ex.reps}</td>
                            <td className="px-4 py-3 text-zinc-700">
                              {ex.restSeconds != null
                                ? t("workout.seconds", { n: ex.restSeconds })
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-zinc-500">
                              {ex.tempo ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}

        {workout.notes && (
          <Card className="mt-6">
            <p className="text-sm text-zinc-700">{workout.notes}</p>
          </Card>
        )}

        <p className="mt-8 text-xs leading-relaxed text-zinc-400">
          {t("common.disclaimer")}
        </p>
      </main>
    </>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-800">{children}</dd>
    </div>
  );
}
