import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing, isLocale, DEFAULT_LOCALE } from "@/i18n/routing";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

const handleI18n = createIntlMiddleware(routing);

// Rotas de app que exigem sessão (o prefixo de idioma é ignorado na checagem)
const PROTECTED_PATHS = ["/dashboard", "/workouts", "/students", "/profile"];
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
    const target = nextPath && nextPath.startsWith("/") ? nextPath : `${prefix}/dashboard`;
    return NextResponse.redirect(new URL(target, req.url));
  }

  // Sessão ausente em rota protegida → login preservando o destino
  if (needsAuth && !session) {
    const login = new URL(`${prefix}/login`, req.url);
    // "next" guarda o caminho SEM prefixo de idioma (a navegação i18n reinsere)
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  // Redireciona/reescreve para o segmento de idioma, detecta idioma etc.
  return handleI18n(req);
}

export const config = {
  // Exclui API, assets estáticos e arquivos com ponto
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
