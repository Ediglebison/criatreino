import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const ROLES = ["PROFESSOR", "ALUNO", "ADMIN"] as const;
const PLANS = ["FREE", "BASIC", "PRO", "ULTIMATE"] as const;

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.email().max(200).optional(),
    role: z.enum(ROLES).optional(),
    plan: z.enum(PLANS).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "nada para atualizar",
  });

/**
 * PATCH /api/admin/users/[id] — edita um cadastro (nome, email, role, plano,
 * senha) pelo painel administrativo.
 *
 * Regras:
 * - admin não altera a própria role (evita perder o acesso ao painel);
 * - promover a PROFESSOR/ADMIN desvincula a conta de um professor (ninguém
 *   que dá aula é aluno de outro);
 * - rebaixar a ALUNO desvincula os alunos daquele professor (viram órfãos e
 *   podem ser re-vinculados por qualquer professor);
 * - plano é override manual no banco; a assinatura Stripe não é alterada
 *   aqui (cancelamento vive em /api/admin/subscriptions/cancel).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    const data = parsed.data;

    if (data.role && data.role !== existing.role && id === guard.session.id) {
      return NextResponse.json(
        { error: "cannotChangeOwnRole" },
        { status: 400 },
      );
    }

    const email = data.email ? data.email.toLowerCase() : undefined;
    let detachedStudents = 0;

    try {
      await prisma.$transaction(async (tx) => {
        if (email) {
          const clash = await tx.user.findUnique({ where: { email } });
          if (clash && clash.id !== id) {
            throw Object.assign(new Error("emailTaken"), { code: "P2002" });
          }
        }

        const update: Record<string, unknown> = {};
        if (data.name !== undefined) update.name = data.name;
        if (email !== undefined) update.email = email;
        if (data.role !== undefined) update.role = data.role;
        if (data.plan !== undefined) update.plan = data.plan;
        if (data.password !== undefined) {
          update.passwordHash = await hashPassword(data.password);
        }

        // Mudança de role: ajusta vínculos de professor/aluno.
        if (data.role && data.role !== existing.role) {
          if (data.role === "ALUNO") {
            const res = await tx.user.updateMany({
              where: { professorId: id },
              data: { professorId: null },
            });
            detachedStudents = res.count;
            update.professorId = null;
          } else {
            update.professorId = null; // quem dá aula não é aluno de alguém
          }
        }

        if (Object.keys(update).length > 0) {
          await tx.user.update({ where: { id }, data: update });
        }
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return NextResponse.json({ error: "emailTaken" }, { status: 409 });
      }
      throw error;
    }

    // Role mudou → a sessão do próprio admin pode estar desatualizada.
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, plan: true },
    });

    return NextResponse.json({ user, detachedStudents });
  } catch (error) {
    console.error("[admin:users:update]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
