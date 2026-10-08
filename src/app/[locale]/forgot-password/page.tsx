import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

/** Pedido de recuperação de senha (página pública). */
export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");

  return (
    <>
      <AppHeader variant="marketing" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <ForgotPasswordForm />
        </div>
      </main>
    </>
  );
}
