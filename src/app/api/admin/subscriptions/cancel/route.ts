import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { billingEnabled } from "@/lib/billing/stripe";
import { setCancelAtPeriodEnd } from "@/lib/billing/subscription";

const bodySchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["cancel", "reactivate"]),
});

/**
 * POST /api/admin/subscriptions/cancel — administra a assinatura Stripe de um
 * usuário direto na fonte:
 *
 * - `cancel` → cancel_at_period_end: o acesso (plano pago) continua até o fim
 *   do período já pago; quando o Stripe emitir `customer.subscription.deleted`
 *   o webhook normal devolve o usuário a FREE. Não há reembolso automático.
 * - `reactivate` → remove o cancelamento agendado (antes do fim do período).
 *
 * O webhook pode reprocessar o mesmo estado depois — é idempotente.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }
    const { userId, action } = parsed.data;

    if (!billingEnabled()) {
      return NextResponse.json({ error: "billingDisabled" }, { status: 503 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, stripeSubscriptionId: true, plan: true },
    });
    if (!user) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    if (!user.stripeSubscriptionId) {
      return NextResponse.json({ error: "noSubscription" }, { status: 404 });
    }

    try {
      const summary = await setCancelAtPeriodEnd(
        user.stripeSubscriptionId,
        action === "cancel",
      );
      return NextResponse.json({
        subscription: {
          status: summary.status,
          cancelAtPeriodEnd: summary.cancelAtPeriodEnd,
        },
      });
    } catch (error) {
      console.error("[admin:subscriptions]", error);
      return NextResponse.json({ error: "stripeError" }, { status: 502 });
    }
  } catch (error) {
    console.error("[admin:subscriptions:cancel]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
