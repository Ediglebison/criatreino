import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getQuotaStatus } from "@/lib/billing/quota";
import { billingEnabled } from "@/lib/billing/stripe";

/** Status do plano + cota do mês corrente para a sessão atual. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const [quota] = await Promise.all([getQuotaStatus(session.id)]);

    return NextResponse.json({
      plan: quota.plan,
      quota,
      checkoutEnabled: billingEnabled(),
    });
  } catch (error) {
    console.error("[billing:status]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
