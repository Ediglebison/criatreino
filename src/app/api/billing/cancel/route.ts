import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { canTeach } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { billingEnabled } from "@/lib/billing/stripe";
import { setCancelAtPeriodEnd } from "@/lib/billing/subscription";

const bodySchema = z.object({
  action: z.enum(["cancel", "reactivate"]),
});

/**
 * POST /api/billing/cancel — o próprio usuário agenda ou remove o cancelamento
 * da própria assinatura Stripe (mesma semântica da rota admin):
 *
 * - `cancel` → cancel_at_period_end: o acesso continua até o fim do período
 *   já pago; quando o Stripe emitir `customer.subscription.deleted` o webhook
 *   devolve o usuário a FREE. Não há reembolso automático.
 * - `reactivate` → remove o cancelamento agendado (antes do fim do período).
 *
 * Operação idempotente.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!canTeach(session.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!billingEnabled()) {
      return NextResponse.json({ error: "billingDisabled" }, { status: 503 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { stripeSubscriptionId: true },
    });
    if (!user?.stripeSubscriptionId) {
      return NextResponse.json({ error: "noSubscription" }, { status: 404 });
    }

    try {
      const summary = await setCancelAtPeriodEnd(
        user.stripeSubscriptionId,
        parsed.data.action === "cancel",
      );
      return NextResponse.json({
        subscription: {
          status: summary.status,
          cancelAtPeriodEnd: summary.cancelAtPeriodEnd,
          currentPeriodEnd: summary.currentPeriodEnd,
        },
      });
    } catch (error) {
      console.error("[billing:cancel]", error);
      return NextResponse.json({ error: "stripeError" }, { status: 502 });
    }
  } catch (error) {
    console.error("[billing:cancel]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
