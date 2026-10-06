import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { billingEnabled, getStripe } from "@/lib/billing/stripe";

export const maxDuration = 30;

/**
 * Cria uma sessão de Checkout do Stripe (assinatura mensal do plano PRO).
 * Requer STRIPE_SECRET_KEY + STRIPE_PRICE_ID; sem isso responde 503 e a
 * UI esconde o botão de upgrade.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.role !== "PROFESSOR") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const stripe = await getStripe();
    if (!stripe || !billingEnabled()) {
      return NextResponse.json({ error: "billingDisabled" }, { status: 503 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true, plan: true, stripeCustomerId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    if (user.plan === "PRO") {
      return NextResponse.json({ error: "alreadyPro" }, { status: 409 });
    }

    // Origem do callback: proxy reverso da Vercel entrega o host correto.
    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!.trim(), quantity: 1 }],
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?billing=success`,
      cancel_url: `${origin}/dashboard?billing=cancel`,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("[billing:checkout]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
