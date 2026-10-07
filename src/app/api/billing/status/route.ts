import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getQuotaStatus } from "@/lib/billing/quota";
import { availablePlans, billingEnabled } from "@/lib/billing/stripe";
import { monthlyLimit, PAID_PLANS } from "@/lib/billing/limits";

/** Status do plano + cota do mês corrente para a sessão atual. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const quota = await getQuotaStatus(session.id);

    // Planos pagos com preço configurado no Stripe (+ limite de cada um),
    // na ordem do mais barato ao mais caro — é o que a UI oferece.
    const configured = new Set(availablePlans());

    return NextResponse.json({
      plan: quota.plan,
      quota,
      checkoutEnabled: billingEnabled(),
      plans: PAID_PLANS.filter((p) => configured.has(p)).map((plan) => ({
        plan,
        limit: monthlyLimit(plan),
      })),
    });
  } catch (error) {
    console.error("[billing:status]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
