"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { href: "/admin", key: "overview" },
  { href: "/admin/users", key: "users" },
  { href: "/admin/subscriptions", key: "subscriptions" },
  { href: "/admin/exercises", key: "exercises" },
  { href: "/admin/settings", key: "settings" },
] as const;

/** Abas de navegação do painel administrativo. */
export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200 pb-px">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "-mb-px border-b-2 border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-700"
                : "px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900"
            }
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
