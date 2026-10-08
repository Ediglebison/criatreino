import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { AuthForm } from "@/components/AuthForm";
import { Alert } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; reset?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const t = await getTranslations("auth.login");
  const { next, reset } = await searchParams;

  return (
    <>
      <AppHeader variant="marketing" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          {reset === "ok" && (
            <Alert tone="success" className="mb-4">
              {t("resetSuccess")}
            </Alert>
          )}
          <AuthForm mode="login" next={next} />
        </div>
      </main>
    </>
  );
}
