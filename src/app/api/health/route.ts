import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health check para load balancer / uptime (Vercel, UptimeRobot, etc.).
 * Não exige sessão e não expõe dados: só { status, db }.
 * 200 = app + banco ok; 503 = banco inacessível.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "up" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] banco inacessível", error);
    return NextResponse.json(
      { status: "degraded", db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
