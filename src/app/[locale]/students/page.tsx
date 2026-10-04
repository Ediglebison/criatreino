import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader } from "@/components/ui";
import { StudentManager } from "@/components/StudentManager";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "PROFESSOR") redirect("/dashboard");

  const t = await getTranslations();

  const students = await prisma.user.findMany({
    where: { role: "ALUNO", professorId: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: { select: { workoutsOwned: true, assignments: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <AppHeader variant="app" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader title={t("students.title")} subtitle={t("students.subtitle")} />
        <StudentManager students={students} />
      </main>
    </>
  );
}
