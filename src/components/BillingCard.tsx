"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, CardTitle } from "@/components/ui";

export type QuotaPlan = "FREE" | "BASIC" | "PRO" | "ULTIMATE";

export type QuotaInfo = {
  plan: QuotaPlan;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
};

export type PlanOption = {
  plan: Exclude<QuotaPlan, "FREE">;
  limit: number;
};

type Props = {
  quota: QuotaInfo;
  checkoutEnabled: boolean;
  plans: PlanOption[];
};

const PLAN_LABEL: Record<QuotaPlan, string> = {
  FREE: "planFree",
  BASIC: "planBasic",
  PRO: "planPro",
  ULTIMATE: "planUltimate",
};

const PLAN_PRICE: Record<Exclude<QuotaPlan, "FREE">, string> = {
  BASIC: "priceBasic",
  PRO: "pricePro",
  ULTIMATE: "priceUltimate",
};

/**
 * Cartão de plano/cota no dashboard do professor.
 * Mostra o plano atual, quantas gerações restam no mês e, quando o Stripe
 * está configurado, os planos pagos disponíveis para assinar/trocar.
 */
export function BillingCard({ quota, checkoutEnabled, plans }: Props) {
  const t = useTranslations("billing");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "danger" | "success" | "info";
    text: string;
  } | null>(null);

  async function startCheckout(plan: Exclude<QuotaPlan, "FREE">) {
    setLoadingPlan(plan);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        updated?: boolean;
        error?: string;
      };
      if (res.status === 503) {
        setMessage({ tone: "info", text: t("billingDisabled") });
        return;
      }
      if (res.status === 409 && data.error === "samePlan") {
        setMessage({ tone: "info", text: t("samePlan") });
        return;
      }
      if (res.ok && data.updated) {
        // Upgrade de assinatura ativa: aplicado na hora, sem redirecionar.
        setMessage({ tone: "success", text: t("success") });
        window.location.reload();
        return;
      }
      if (!res.ok || !data.url) {
        setMessage({ tone: "danger", text: t("checkoutError") });
        return;
      }
      window.location.assign(data.url);
    } catch {
      setMessage({ tone: "danger", text: t("checkoutError") });
    } finally {
      setLoadingPlan(null);
    }
  }

  const outOfQuota = quota.remaining === 0;
  const isTopPlan = quota.plan === "ULTIMATE";
  const renewDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" })
    .format(new Date(quota.resetsAt));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <p className="mt-1 text-sm text-zinc-500">
            {t("plan")}:{" "}
            <Badge tone={quota.plan === "FREE" ? "default" : "success"}>
              {t(PLAN_LABEL[quota.plan])}
            </Badge>
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-zinc-700">{t("usage")}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-900">
          {t("usageValue", { used: quota.used, limit: quota.limit })}
        </p>

        {/* Barra de progresso */}
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full transition-all ${
              outOfQuota ? "bg-red-500" : "bg-indigo-500"
            }`}
            style={{
              width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%`,
            }}
          />
        </div>

        <p className="mt-2 text-xs text-zinc-500">{t("renews", { date: renewDate })}</p>
        <p
          className={`mt-1 text-xs ${outOfQuota ? "font-medium text-red-600" : "text-zinc-500"}`}
          data-testid="quota-remaining"
        >
          {outOfQuota
            ? t(isTopPlan ? "quotaOutMax" : "quotaOut")
            : t("quotaNotice", {
                remaining: quota.remaining,
                limit: quota.limit,
              })}
        </p>
      </div>

      {/* Planos pagos (só quando o Stripe está configurado) */}
      {checkoutEnabled && plans.length > 0 && (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <p className="text-sm font-medium text-zinc-700">{t("choosePlan")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="plan-options">
            {plans.map(({ plan, limit }) => {
              const isCurrent = quota.plan === plan;
              return (
                <div
                  key={plan}
                  className={`flex flex-col rounded-lg border p-3 ${
                    isCurrent
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-zinc-200"
                  }`}
                >
                  <p className="font-semibold text-zinc-900">
                    {t(PLAN_LABEL[plan])}
                  </p>
                  <p className="mt-1 text-xl font-bold text-zinc-900">
                    {t(PLAN_PRICE[plan])}
                    <span className="text-sm font-normal text-zinc-500">
                      {t("perMonth")}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t("planQuota", { limit })}
                  </p>
                  <Button
                    className="mt-3 w-full"
                    variant={isCurrent ? "secondary" : "primary"}
                    disabled={isCurrent}
                    loading={loadingPlan === plan}
                    onClick={() => startCheckout(plan)}
                    data-testid={`checkout-btn-${plan}`}
                  >
                    {isCurrent
                      ? t("currentPlan")
                      : loadingPlan === plan
                        ? t("upgrading")
                        : t("checkout")}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {message && (
        <Alert tone={message.tone} className="mt-4">
          {message.text}
        </Alert>
      )}
    </Card>
  );
}
