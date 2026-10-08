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
  // Só o Host da própria conexão. X-Forwarded-Host é forjável pelo cliente
  // e mudava a origem efetiva, anulando a checagem de Origin (bypass de CSRF)
  // e abrindo password-reset poisoning quando NEXT_PUBLIC_APP_URL não está setada.
  const host = request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export function isSameOrigin(request: Request, url: URL): boolean {
  const target = effectiveOrigin(request, url);

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    return safeOrigin(origin) === target;
  }

  if (origin === "null") {
    // Origin "null" = iframe sandbox/data:/file:. Navegadores modernos sempre
    // enviam Sec-Fetch-* junto → tratar como cross-origin e recusar. Clientes
    // não-navegador (Node/curl, sem Sec-Fetch) seguem no fallback abaixo.
    if (request.headers.get("sec-fetch-site")) return false;
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
