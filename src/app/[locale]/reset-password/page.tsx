import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

/** Troca de senha via token do e-mail (página pública). */
export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const t = await getTranslations("auth.reset");
  const { token } = await searchParams;

  return (
    <>
      <AppHeader variant="marketing" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <ResetPasswordForm token={token} />
        </div>
      </main>
    </>
  );
}
