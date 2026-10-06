/**
 * Proteção de CSRF login/forced-login via verificação de Origin.
 *
 * Risco: um site malicioso faz `fetch(..., {mode:"no-cors",
 * headers:{"Content-Type":"text/plain"}})` — preflight não dispara e o
 * `request.json()` do Next aceita o corpo mesmo com content-type errado,
 * logando a vítima na conta do atacante.
 *
 * Regra: se o navegador ENVIOU Origin (sempre em POST cross-origin, e em
 * POST same-origin de fetch), ele precisa bater com a origem efetiva da
 * requisição — considerando proxy reverso (X-Forwarded-Proto/Host).
 * Clientes sem Origin (Node/curl nos testes) são permitidos.
 */
export function effectiveOrigin(request: Request, url: URL): string {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    url.host;
  return `${proto}://${host}`;
}

export function isSameOrigin(request: Request, url: URL): boolean {
  const target = effectiveOrigin(request, url);

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    return safeOrigin(origin) === target;
  }

  // Sem Origin: último recurso é Referer (navegadores mandam em POST).
  const referer = request.headers.get("referer");
  if (!referer) return true; // cliente não-navegador (testes, webhooks)
  try {
    return safeOrigin(new URL(referer).origin) === target;
  } catch {
    return false;
  }
}

function safeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
