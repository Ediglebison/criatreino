import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { canTeach } from "@/lib/roles";
import { LangSwitcher } from "./LangSwitcher";
import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";

/**
 * Cabeçalho do app.
 * - marketing: landing, login, cadastro (mostra CTA quando deslogado)
 * - app: páginas autenticadas (mostra navegação + usuário)
 */
export async function AppHeader({ variant = "marketing" }: { variant?: "marketing" | "app" }) {
  const t = await getTranslations();
  const session = await getSession();

  const appNav = variant === "app" && session ? (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      <NavLink href="/dashboard">{t("nav.dashboard")}</NavLink>
      <NavLink href="/workouts/new">{t("nav.newWorkout")}</NavLink>
      {canTeach(session.role) && (
        <NavLink href="/students">{t("nav.students")}</NavLink>
      )}
      {canTeach(session.role) && (
        <NavLink href="/billing">{t("nav.billing")}</NavLink>
      )}
      {session.role === "ADMIN" && (
        <NavLink href="/admin">{t("nav.admin")}</NavLink>
      )}
    </nav>
  ) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/60 bg-zinc-50/70 shadow-[0_1px_0_0_rgb(255_251_247/0.03)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Logo href={variant === "app" ? "/dashboard" : "/"} />
          {appNav}
        </div>

        <div className="flex items-center gap-3">
          <LangSwitcher />

          {variant === "app" && session ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium text-zinc-900">{session.name}</p>
                <p className="text-xs text-zinc-500">{t(`roles.${session.role}`)}</p>
              </div>
              <LogoutButton />
            </div>
          ) : session ? (
            <Link
              href="/dashboard"
              className="rounded-lg gradient-brand px-3 py-1.5 text-sm font-medium text-ink hover:brightness-110"
            >
              {t("nav.dashboard")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                {t("common.login")}
              </Link>
              <Link
                href="/register"
                className="rounded-lg gradient-brand px-3 py-1.5 text-sm font-medium text-ink hover:brightness-110"
              >
                {t("common.register")}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Navegação mobile (pequenas telas) */}
      {appNav && (
        <div className="border-t border-zinc-100 md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 py-1.5">
            <NavLink href="/dashboard">{t("nav.dashboard")}</NavLink>
            <NavLink href="/workouts/new">{t("nav.newWorkout")}</NavLink>
            {canTeach(session!.role) && (
              <NavLink href="/students">{t("nav.students")}</NavLink>
            )}
            {canTeach(session!.role) && (
              <NavLink href="/billing">{t("nav.billing")}</NavLink>
            )}
            {session!.role === "ADMIN" && (
              <NavLink href="/admin">{t("nav.admin")}</NavLink>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
    >
      {children}
    </Link>
  );
}
