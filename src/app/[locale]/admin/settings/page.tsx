import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Badge, Card, CardTitle } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { getLimitConfigs } from "@/lib/billing/settings";
import { PAID_PLANS } from "@/lib/billing/limits";
import {
  availablePlans,
  billingEnabled,
  webhookEnabled,
} from "@/lib/billing/stripe";
import {
  AdminLimits,
  type LimitRow,
} from "@/components/admin/AdminLimits";

export const dynamic = "force-dynamic";

/** Configurações: limites de cota editáveis + estado do billing (só leitura). */
export default async function AdminSettingsPage() {
  // Guard por página (defense-in-depth): o fallthrough de /api/<path> cai aqui
  // com locale="api" e o guard do layout só redireciona a UI — dados já
  // serializadas no flight stream vazariam. Nada pode ser buscado antes desta
  // checagem (getTranslations).
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const t = await getTranslations();

  const configs = await getLimitConfigs();
  const rows: LimitRow[] = configs.map((config) => ({
    plan: config.plan,
    value: config.value,
    envDefault: config.envDefault,
    source: config.source,
  }));

  const on = billingEnabled();
  const configured = new Set<string>(availablePlans());
  const priceKeys: Record<(typeof PAID_PLANS)[number], string> = {
    BASIC: "STRIPE_PRICE_ID_BASIC",
    PRO: "STRIPE_PRICE_ID_PRO",
    ULTIMATE: "STRIPE_PRICE_ID_ULTIMATE",
  };
  const priceState = PAID_PLANS.map((plan) => ({
    plan,
    id: process.env[priceKeys[plan]] ?? "",
    configured: configured.has(plan),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info">{t("admin.settings.limitsHint")}</Alert>

      <AdminLimits rows={rows} />

      <Card>
        <CardTitle>{t("admin.settings.statusTitle")}</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={on ? "success" : "outline"}>
            {t("admin.settings.stripe")}:{" "}
            {on ? t("admin.settings.enabled") : t("admin.settings.disabled")}
          </Badge>
          <Badge tone={webhookEnabled() ? "success" : "outline"}>
            {t("admin.settings.webhook")}:{" "}
            {webhookEnabled()
              ? t("admin.settings.configured")
              : t("admin.settings.missing")}
          </Badge>
          {priceState.map((row) => (
            <Badge key={row.plan} tone={row.configured ? "success" : "outline"}>
              {t(`billing.plan${row.plan.charAt(0)}${row.plan.slice(1).toLowerCase()}`)}
              : {row.configured ? row.id : t("admin.settings.missing")}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          {t("admin.settings.limitsInfo")}
        </p>
      </Card>
    </div>
  );
}
