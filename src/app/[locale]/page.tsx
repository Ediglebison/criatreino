import { useTranslations } from "next-intl";
import { AppHeader } from "@/components/AppHeader";
import { Link } from "@/i18n/navigation";

const FEATURE_KEYS = ["interview", "ai", "review", "export"] as const;
const STEP_KEYS = ["step1", "step2", "step3", "step4"] as const;

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  interview: (
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  ),
  ai: (
    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
  ),
  review: (
    <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  export: (
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  ),
};

export default function LandingPage() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");

  return (
    <>
      <AppHeader variant="marketing" />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-zinc-200 bg-surface">
          {/* Brilho ember atrás do hero */}
          <div className="absolute inset-0 bg-[radial-gradient(80%_55%_at_50%_-10%,rgb(245_158_11/0.16),transparent_65%)]" />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 lg:px-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              {t("hero.badge")}
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl bg-gradient-to-r from-amber-900 via-orange-300 to-amber-600 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
              {t("hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="rounded-lg gradient-brand px-6 py-3 text-sm font-semibold text-ink shadow-md shadow-orange-950/30 transition-all hover:brightness-110"
              >
                {t("hero.ctaPrimary")}
              </Link>
              <a
                href="#como-funciona"
                className="rounded-lg border border-zinc-300 bg-surface px-6 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
              >
                {t("hero.ctaSecondary")}
              </a>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">
              {t("features.title")}
            </h2>
            <p className="mt-3 text-zinc-600">{t("features.subtitle")}</p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_KEYS.map((key) => (
              <div
                key={key}
                className="rounded-xl border border-zinc-200 bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                    aria-hidden
                  >
                    {FEATURE_ICONS[key]}
                  </svg>
                </span>
                <h3 className="mt-4 font-semibold text-zinc-900">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {t(`features.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section
          id="como-funciona"
          className="border-y border-zinc-200 bg-surface py-16"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-900">
              {t("how.title")}
            </h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEP_KEYS.map((key) => (
                <li key={key}>
                  <h3 className="font-semibold text-indigo-700">
                    {t(`how.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                    {t(`how.${key}.description`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-2xl gradient-brand px-6 py-12 text-center shadow-lg">
            <h2 className="text-2xl font-bold text-ink sm:text-3xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-indigo-100">
              {t("cta.description")}
            </p>
            <Link
              href="/register"
              className="mt-6 inline-block rounded-lg bg-surface px-6 py-3 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50"
            >
              {t("cta.button")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm font-medium text-zinc-700">
              © {new Date().getFullYear()} {tc("appName")} — {t("footer.rights")}
            </p>
            <p className="text-sm text-zinc-500">{t("footer.madeWith")}</p>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-zinc-400">
            {tc("disclaimer")}
          </p>
        </div>
      </footer>
    </>
  );
}
