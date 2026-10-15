import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { canTeach } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { billingEnabled, getStripe, priceIdForPlan } from "@/lib/billing/stripe";

export const maxDuration = 30;

const bodySchema = z.object({
  // Sem plano no corpo, cai no PRO (compat com clientes antigos).
  plan: z.enum(["BASIC", "PRO", "ULTIMATE"]).default("PRO"),
});

type PaidPlan = "BASIC" | "PRO" | "ULTIMATE";

/**
 * Inicia o pagamento de um plano pago.
 *
 * - sem assinatura Stripe (FREE ou plano manual do admin) → cria uma sessão
 *   de Checkout do Stripe (assinatura mensal);
 * - assinante real → troca o preço da assinatura existente (upgrade/downgrade
 *   com prorata) e já grava o plano; o webhook do Stripe reconcilia.
 *
 * Requer STRIPE_SECRET_KEY + STRIPE_PRICE_ID_<PLANO>; sem isso responde
 * 503 e a UI esconde os planos.
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

    const stripe = await getStripe();
    if (!stripe || !billingEnabled()) {
      return NextResponse.json({ error: "billingDisabled" }, { status: 503 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidPlan" }, { status: 400 });
    }
    const plan = parsed.data.plan as PaidPlan;
    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      // Plano existe no app, mas o preço não foi configurado no Stripe.
      return NextResponse.json({ error: "planUnavailable" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true, plan: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    // Plano manual (override do admin) sem assinatura Stripe não bloqueia o
    // checkout: só assinante REAL cai nos guardas abaixo — quem nunca pagou
    // pode sempre iniciar uma sessão nova, e o webhook reconcilia depois.
    const hasSubscription = Boolean(user.stripeSubscriptionId);
    if (hasSubscription && user.plan === plan) {
      return NextResponse.json({ error: "samePlan" }, { status: 409 });
    }

    // Já assinante: troca o preço da assinatura ativa (mesma assinatura,
    // prorata calculado pelo Stripe) em vez de criar uma segunda cobrança.
    if (hasSubscription && user.plan !== "FREE") {
      try {
        const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId!);
        if (!["active", "trialing"].includes(sub.status)) {
          return NextResponse.json({ error: "subscriptionInactive" }, { status: 409 });
        }
        const item = sub.items.data[0];
        if (!item) {
          return NextResponse.json({ error: "subscriptionEmpty" }, { status: 409 });
        }
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "create_prorations",
          metadata: { userId: user.id, plan },
        });
        // Aplica já na UI; o webhook (quando ativo) reconcilia depois.
        await prisma.user.update({ where: { id: user.id }, data: { plan } });
        return NextResponse.json({ updated: true, plan });
      } catch (error) {
        console.error("[billing:checkout] troca de plano", error);
        return NextResponse.json({ error: "subscriptionUpdateFailed" }, { status: 502 });
      }
    }

    // Origem do callback: proxy reverso da Vercel entrega o host correto.
    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id, plan },
      subscription_data: { metadata: { userId: user.id, plan } },
      allow_promotion_codes: true,
      success_url: `${origin}/billing?billing=success`,
      cancel_url: `${origin}/billing?billing=cancel`,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("[billing:checkout]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
