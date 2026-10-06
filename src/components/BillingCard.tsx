"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, CardTitle } from "@/components/ui";

export type QuotaInfo = {
  plan: "FREE" | "PRO";
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
};

type Props = {
  quota: QuotaInfo;
  checkoutEnabled: boolean;
};

/**
 * Cartão de plano/cota no dashboard do professor.
 * Mostra quantas gerações restam no mês e, quando esgotadas (ou sempre),
 * oferece o upgrade via Stripe Checkout.
 */
export function BillingCard({ quota, checkoutEnabled }: Props) {
  const t = useTranslations("billing");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    tone: "danger" | "success" | "info";
    text: string;
  } | null>(null);

  async function startCheckout() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.status === 503) {
        setMessage({ tone: "info", text: t("billingDisabled") });
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
      setLoading(false);
    }
  }

  const outOfQuota = quota.plan === "FREE" && quota.remaining === 0;
  const renewDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" })
    .format(new Date(quota.resetsAt));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <p className="mt-1 text-sm text-zinc-500">
            {t("plan")}:{" "}
            <Badge tone={quota.plan === "PRO" ? "success" : "default"}>
              {quota.plan === "PRO" ? t("planPro") : t("planFree")}
            </Badge>
          </p>
        </div>
        {quota.plan === "FREE" && checkoutEnabled && (
          <Button onClick={startCheckout} loading={loading} data-testid="upgrade-btn">
            {loading ? t("upgrading") : t("checkout")}
          </Button>
        )}
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
        {quota.plan === "FREE" && (
          <p
            className={`mt-1 text-xs ${outOfQuota ? "font-medium text-red-600" : "text-zinc-500"}`}
            data-testid="quota-remaining"
          >
            {outOfQuota
              ? t("quotaOut")
              : t("quotaNotice", {
                  remaining: quota.remaining,
                  limit: quota.limit,
                })}
          </p>
        )}
      </div>

      {message && (
        <Alert tone={message.tone} className="mt-4">
          {message.text}
        </Alert>
      )}
    </Card>
  );
}
