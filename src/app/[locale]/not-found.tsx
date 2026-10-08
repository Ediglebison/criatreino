import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations();

  return (
    <>
      <AppHeader variant="marketing" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-6xl font-bold text-indigo-600">404</p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">
          {t("notFound.title")}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">{t("notFound.description")}</p>
        <Link
          href="/"
          className="mt-6 rounded-lg gradient-brand px-5 py-2.5 text-sm font-medium text-ink hover:brightness-110"
        >
          {t("notFound.backHome")}
        </Link>
      </main>
    </>
  );
}
