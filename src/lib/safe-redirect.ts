/**
 * Valida o parâmetro de redirecionamento `next` (open redirect).
 *
 * Aceita apenas caminhos relativos ao próprio site:
 * - "/dashboard"            ✔
 * - "/en-US/workouts/1"     ✔
 * - "//evil.com"            ✖ origin-relativo (protocolo herdado)
 * - "/\\evil.com"           ✖ browsers normalizam barra invertida em //
 * - "https://evil.com"      ✖ absoluto
 * - "javascript:..."        ✖
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string,
): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;

  // Rejeita bytes de controle (0x00-0x1F, 0x7F) usados em bypass de
  // parsing de URL por alguns navegadores.
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }

  return next;
}
