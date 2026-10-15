"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Alert, Badge, Button, Card, CardTitle } from "@/components/ui";

export type MySubscriptionInfo = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

type Props = {
  subscription: MySubscriptionInfo | null;
  plan: string;
};

function statusTone(status: string) {
  switch (status) {
    case "active":
    case "trialing":
      return "success";
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
      return "warning";
    case "canceled":
    case "unpaid":
      return "danger";
    default:
      return "outline";
  }
}

function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/**
 * Assinatura do próprio usuário: status ao vivo, cancelamento agendado e
 * reativação (mesma semântica cancel_at_period_end da área admin).
 */
export function MySubscription({ subscription, plan }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"cancel" | "reactivate" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(action: "cancel" | "reactivate") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "billingDisabled"
            ? t("billing.billingDisabled")
            : data.error === "noSubscription"
              ? t("billing.noSubscription")
              : data.error === "stripeError"
                ? t("errors.internal")
                : t("common.errorGeneric"),
        );
        return;
      }
      setNotice(
        action === "cancel"
          ? t("billing.cancelScheduledOk")
          : t("billing.reactivateOk"),
      );
      setConfirming(null);
      router.refresh();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const scheduled = subscription?.cancelAtPeriodEnd === true;
  const periodEndLabel = subscription?.currentPeriodEnd
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(subscription.currentPeriodEnd),
      )
    : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{t("billing.mySubscription")}</CardTitle>
        <Badge tone={plan === "FREE" ? "default" : "success"}>
          {t(`billing.plan${capitalize(plan)}`)}
        </Badge>
      </div>

      {notice && (
        <Alert tone="success" className="mt-3 flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </Alert>
      )}

      {!subscription ? (
        <p className="mt-3 text-sm text-zinc-600">{t("billing.noSubscription")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(subscription.status)}>
              {t(`billing.subStatus_${subscription.status}`)}
            </Badge>
          </div>

          <p className="text-sm text-zinc-600">
            {scheduled && periodEndLabel
              ? t("billing.accessUntil", { date: periodEndLabel })
              : periodEndLabel
                ? t("billing.renews", { date: periodEndLabel })
                : "—"}
          </p>

          {subscription.status !== "canceled" && (
            <div>
              <Button
                variant={scheduled ? "outline" : "danger"}
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(scheduled ? "reactivate" : "cancel")}
              >
                {scheduled
                  ? t("billing.reactivateSubscription")
                  : t("billing.cancelSubscription")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Confirmação */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
            <h3 className="font-semibold text-zinc-900">
              {confirming === "cancel"
                ? t("billing.cancelConfirm")
                : t("billing.reactivateConfirm")}
            </h3>

            {error && <Alert className="mt-3">{error}</Alert>}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirming(null);
                  setError(null);
                }}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant={confirming === "cancel" ? "danger" : "primary"}
                loading={busy}
                disabled={busy}
                onClick={() => send(confirming)}
              >
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
