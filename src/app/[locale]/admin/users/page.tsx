import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPeriodStart } from "@/lib/billing/limits";
import { getMonthlyLimits } from "@/lib/billing/settings";
import { pendingCutoff } from "@/lib/billing/quota";
import { getSession } from "@/lib/auth/session";
import { AdminUsers, type AdminUser } from "@/components/admin/AdminUsers";

export const dynamic = "force-dynamic";

/**
 * Lista de usuários para o painel (busca/filtros/edição no cliente).
 * `used` é o consumo do mês corrente com a mesma regra de cota da
 * lib billing/quota.ts (COMPLETED + PENDING fresco).
 */
export default async function AdminUsersPage() {
  // Guard por página (defense-in-depth): o fallthrough de /api/<path> cai aqui
  // com locale="api" e o guard do layout só redireciona a UI — dados já
  // serializadas no flight stream vazariam. Nada pode ser buscado antes desta
  // checagem (prisma).
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const monthStart = currentPeriodStart();

  const [users, usage, limits] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        locale: true,
        createdAt: true,
        professor: { select: { name: true } },
        _count: {
          select: { students: true, workoutsOwned: true, assignments: true },
        },
      },
    }),
    prisma.usageRecord.groupBy({
      by: ["userId"],
      where: {
        periodStart: monthStart,
        OR: [
          { status: "COMPLETED" },
          { status: "PENDING", createdAt: { gt: pendingCutoff() } },
        ],
      },
      _count: true,
    }),
    getMonthlyLimits(),
  ]);

  const usedBy = new Map(usage.map((row) => [row.userId, row._count]));

  const items: AdminUser[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
    professorName: user.professor?.name ?? null,
    counts: {
      students: user._count.students,
      workouts: user._count.workoutsOwned,
      assignments: user._count.assignments,
    },
    used: usedBy.get(user.id) ?? 0,
  }));

  return <AdminUsers users={items} limits={limits} meId={session.id} />;
}
