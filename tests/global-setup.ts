/**
 * Playwright globalSetup: limpa RateLimit e UsageRecord antes da suíte.
 * A cota grátis é 3 gerações/mês — sem reset, a 2ª execução cai em 402.
 *
 * O import é dinâmico de propósito: o Playwright transpila este arquivo para
 * CJS e um import estático de `.mjs` (com import.meta) quebraria.
 */
export default async function globalSetup() {
  const { resetTestState } = await import("../scripts/test-reset.mjs");
  const { rateLimit, usageRecord } = await resetTestState();
  console.log(
    `[setup] estado de teste zerado (RateLimit: ${rateLimit}, UsageRecord: ${usageRecord})`,
  );
}
