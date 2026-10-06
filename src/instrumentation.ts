/**
 * Executado uma vez por instância do servidor (Node) antes de servir
 * requisições — garante que configuração quebrada apareça no log de
 * deploy em vez de virar 500 silencioso na primeira chamada.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { validateEnv } = await import("@/lib/env");
  validateEnv();
}
