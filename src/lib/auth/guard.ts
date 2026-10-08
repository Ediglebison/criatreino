import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/types";
import { getSession } from "./session";

/**
 * Guard das rotas `/api/admin/*`.
 *
 * Uso:
 *   const guard = await requireAdmin();
 *   if (!guard.ok) return guard.response;
 *   // guard.session é o admin autenticado
 */
export type AdminGuard =
  | { ok: true; session: SessionUser }
  | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<AdminGuard> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
