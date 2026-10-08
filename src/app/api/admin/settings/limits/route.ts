import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import {
  getLimitConfigs,
  setMonthlyLimit,
} from "@/lib/billing/settings";
import type { Plan } from "@/lib/billing/limits";

const limitsSchema = z.object({
  FREE: z.number().int().min(0).max(100000).nullable().optional(),
  BASIC: z.number().int().min(0).max(100000).nullable().optional(),
  PRO: z.number().int().min(0).max(100000).nullable().optional(),
  ULTIMATE: z.number().int().min(0).max(100000).nullable().optional(),
});

/**
 * PUT /api/admin/settings/limits — grava limites de cota por plano no banco.
 * `null` remove o override (volta ao `.env`); número ≥ 0 grava o override.
 * O cache é invalidado, então o novo limite vale imediatamente.
 */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const parsed = limitsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    const entries = Object.entries(parsed.data).filter(
      ([, value]) => value !== undefined,
    ) as [Plan, number | null][];
    if (entries.length === 0) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }

    for (const [plan, value] of entries) {
      await setMonthlyLimit(plan, value);
    }

    return NextResponse.json({ limits: await getLimitConfigs() });
  } catch (error) {
    console.error("[admin:settings:limits]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
