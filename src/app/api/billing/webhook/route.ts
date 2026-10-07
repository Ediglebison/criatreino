import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe, webhookEnabled, planForPriceId } from "@/lib/billing/stripe";
import type { Plan } from "@/lib/billing/limits";

export const maxDuration = 30;

/**
 * Webhook do Stripe — sincroniza o plano do usuário.
 * Assinatura verificada com STRIPE_WEBHOOK_SECRET; sem configuração → 503.
 *
 * Eventos tratados:
 * - checkout.session.completed → ativa o plano do metadata e grava customer/subscription
 * - customer.subscription.updated → reage ao preço ativo e ao status (past_due…)
 * - customer.subscription.deleted → volta para FREE
 */

/** Preço da assinatura → plano interno (metadata primeiro, preço como base). */
function resolvePlan(subscription: Stripe.Subscription): Plan | null {
  const meta = subscription.metadata?.plan;
  if (meta === "BASIC" || meta === "PRO" || meta === "ULTIMATE") return meta;
  const priceId = subscription.items?.data?.[0]?.price?.id;
  return priceId ? planForPriceId(priceId) : null;
}

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

    // Corpo bruto obrigatório para a verificação de assinatura.
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

        // Plano escolhido no checkout (gravação nova); sem metadata, deduz
        // pelo preço da assinatura; ainda sem sorte → PRO (compat legado).
        let plan = session.metadata?.plan as Plan | undefined;
        if (
          (plan !== "BASIC" && plan !== "PRO" && plan !== "ULTIMATE") &&
          subscriptionId
        ) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            plan = resolvePlan(sub) ?? undefined;
          } catch (error) {
            console.error("[billing:webhook] falha ao ler assinatura", error);
          }
        }

        if (userId) {
          // updateMany: usuário removido não deve estourar 500 (o Stripe
          // reenviaria o evento para sempre).
          await prisma.user.updateMany({
            where: { id: userId },
            data: {
              plan: plan === "BASIC" || plan === "ULTIMATE" ? plan : "PRO",
              ...(customerId ? { stripeCustomerId: customerId } : {}),
              ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
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
        const resolved = resolvePlan(subscription);

        if (customerId) {
          // Ativa/desativa pelo customerId (sobrevive a troca de subscription).
          // Assinatura ativa com preço não mapeável não rebaixa: mantém o atual.
          const data =
            active && !isDelete
              ? resolved
                ? { plan: resolved }
                : null
              : {
                  plan: "FREE" as const,
                  ...(isDelete ? { stripeSubscriptionId: null } : {}),
                };
          if (data) {
            await prisma.user.updateMany({
              where: { stripeCustomerId: customerId },
              data,
            });
          }
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
