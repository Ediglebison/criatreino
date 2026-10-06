import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe, webhookEnabled } from "@/lib/billing/stripe";

export const maxDuration = 30;

/**
 * Webhook do Stripe — sincroniza o plano do usuário.
 * Assinatura verificada com STRIPE_WEBHOOK_SECRET; sem configuração → 503.
 *
 * Eventos tratados:
 * - checkout.session.completed → ativa PRO e grava customer/subscription
 * - customer.subscription.updated → reage a status (past_due, canceled…)
 * - customer.subscription.deleted → volta para FREE
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripe || !webhookEnabled()) {
      return NextResponse.json({ error: "billingDisabled" }, { status: 503 });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "missingSignature" }, { status: 400 });
    }

    // Corpo bruto obrigário para a verificação de assinatura.
    const payload = await request.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret!);
    } catch (error) {
      console.error("[billing:webhook] assinatura inválida", error);
      return NextResponse.json({ error: "invalidSignature" }, { status: 400 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId =
          session.metadata?.userId || session.client_reference_id || null;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              plan: "PRO",
              stripeCustomerId: customerId ?? undefined,
              stripeSubscriptionId: subscriptionId ?? undefined,
            },
          });
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : null;
        const active = ["active", "trialing"].includes(subscription.status);
        const isDelete = event.type === "customer.subscription.deleted";

        if (customerId) {
          // Ativa/desativa pelo customerId (sobrevive a troca de subscription)
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              plan: active && !isDelete ? "PRO" : "FREE",
              ...(isDelete ? { stripeSubscriptionId: null } : {}),
            },
          });
        }
        break;
      }

      default:
        // Outros eventos (faturas, etc.) não mudam o plano aqui.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[billing:webhook]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
