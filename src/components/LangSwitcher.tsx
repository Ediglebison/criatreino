"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALES } from "@/i18n/routing";

const LABELS: Record<string, string> = {
  "pt-BR": "PT",
  "en-US": "EN",
};

export function LangSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5"
      aria-label="Idioma"
    >
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            l === locale
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
          aria-current={l === locale ? "true" : undefined}
        >
          {LABELS[l] ?? l}
        </Link>
      ))}
    </div>
  );
}
