import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt-BR", "en-US"],
  defaultLocale: "pt-BR",
  // Idioma padrão sem prefixo na URL (/), inglês com prefixo (/en-US/...)
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

export const LOCALES = routing.locales;
export const DEFAULT_LOCALE = routing.defaultLocale;

export function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}
