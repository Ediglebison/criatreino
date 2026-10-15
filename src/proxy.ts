import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing, isLocale, DEFAULT_LOCALE } from "@/i18n/routing";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { safeNextPath } from "@/lib/safe-redirect";

const handleI18n = createIntlMiddleware(routing);

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy com nonce por requisição (só em produção).
 *
 * O nonce é gerado aqui na borda e o Next o aplica nos próprios scripts
 * (bootstrap/RSC); `strict-dynamic` libera os scripts que o Next injeta em
 * runtime (chunks de rota). Em dev ficamos sem CSP para não quebrar o HMR
 * (WebSocket de atualização fica fora de `connect-src 'self'`).
 */
function withCsp(res: Response): void {
  if (!isProd) return;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const nonce = btoa(bin);
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
}

// Rotas de app que exigem sessão (o prefixo de idioma é ignorado na checagem)
const PROTECTED_PATHS = [
  "/dashboard",
  "/workouts",
  "/students",
  "/profile",
  "/billing",
  "/admin",
];
// Rotas de login/cadastro que redirecionam se já houver sessão
const ANONYMOUS_ONLY_PATHS = ["/login", "/register"];

function stripLocale(pathname: string): { locale: string | null; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if (first && isLocale(first)) {
    return { locale: first, path: "/" + rest.join("/") };
  }
  return { locale: null, path: pathname };
}

function matches(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { locale, path } = stripLocale(pathname);

  let session = null;
  try {
    session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    session = null;
  }

  const needsAuth = matches(path, PROTECTED_PATHS);
  const anonymousOnly = matches(path, ANONYMOUS_ONLY_PATHS);
  const prefix = locale && locale !== DEFAULT_LOCALE ? `/${locale}` : "";

  // Já autenticado tentando acessar login/cadastro → painel
  if (anonymousOnly && session) {
    const nextPath = req.nextUrl.searchParams.get("next");
    const target = safeNextPath(nextPath, `${prefix}/dashboard`);
    const res = NextResponse.redirect(new URL(target, req.url));
    withCsp(res);
    return res;
  }

  // Sessão ausente em rota protegida → login preservando o destino
  if (needsAuth && !session) {
    const login = new URL(`${prefix}/login`, req.url);
    // "next" guarda o caminho SEM prefixo de idioma (a navegação i18n reinsere)
    login.searchParams.set("next", path);
    const res = NextResponse.redirect(login);
    withCsp(res);
    return res;
  }

  // Redireciona/reescreve para o segmento de idioma, detecta idioma etc.
  // (Cabeçalhos de segurança saem do next.config.ts, que cobre /api também.)
  const res = handleI18n(req);
  withCsp(res);
  return res;
}

export const config = {
  // Exclui API, assets estáticos e arquivos com ponto
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
