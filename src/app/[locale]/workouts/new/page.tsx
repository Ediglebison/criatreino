import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader } from "@/components/ui";
import {
  WorkoutWizard,
  type WizardProps,
} from "@/components/wizard/WorkoutWizard";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ student?: string }>;
};

export default async function NewWorkoutPage({ params, searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { locale } = await params;
  const { student } = await searchParams;

  const isProfessor = session.role === "PROFESSOR";

  const [students, meProfile, preselected] = await Promise.all([
    isProfessor
      ? prisma.user.findMany({
          where: { role: "ALUNO", professorId: session.id },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.athleteProfile.findUnique({ where: { userId: session.id } }),
    student && isProfessor
      ? prisma.user.findUnique({
          where: { id: student },
          select: { id: true, name: true, professorId: true, role: true },
        })
      : null,
  ]);

  const t = await getTranslations();

  const preselectedStudent: WizardProps["preselectedStudent"] =
    preselected &&
    preselected.role === "ALUNO" &&
    preselected.professorId === session.id
      ? { id: preselected.id, name: preselected.name }
      : null;

  const initialProfile: WizardProps["initialProfile"] = meProfile
    ? {
        birthDate: meProfile.birthDate?.toISOString() ?? null,
        sex: meProfile.sex,
        heightCm: meProfile.heightCm,
        weightKg: meProfile.weightKg,
        bodyFatPct: meProfile.bodyFatPct,
        measurements: (meProfile.measurements ?? {}) as Record<string, unknown>,
        goal: meProfile.goal,
        goalNotes: meProfile.goalNotes,
        limitations: (meProfile.limitations ?? []) as unknown[],
        limitationNotes: meProfile.limitationNotes,
        daysPerWeek: meProfile.daysPerWeek,
        sessionMinutes: meProfile.sessionMinutes,
        experience: meProfile.experience,
        equipment: (meProfile.equipment ?? []) as unknown[],
        observations: meProfile.observations,
      }
    : null;

  return (
    <>
      <AppHeader variant="app" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title={t("wizard.title")}
          subtitle={t("wizard.subtitle")}
        />
        <WorkoutWizard
          me={{
            id: session.id,
            name: session.name,
            role: session.role,
          }}
          students={students}
          initialProfile={initialProfile}
          preselectedStudent={preselectedStudent}
          locale={locale}
        />
      </main>
    </>
  );
}
