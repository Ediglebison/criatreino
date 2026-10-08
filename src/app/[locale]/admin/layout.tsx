import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader } from "@/components/ui";
import { AdminNav } from "@/components/admin/AdminNav";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Guard + cabeçalho comum de todas as telas /admin.
 * (Sessão sem role ADMIN volta para o dashboard; anônimo cai no proxy → login.)
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const t = await getTranslations();

  return (
    <>
      <AppHeader variant="app" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />
        <AdminNav />
        {children}
      </main>
    </>
  );
}
