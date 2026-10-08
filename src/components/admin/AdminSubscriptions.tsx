"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { planTone } from "./badges";

export type AdminSubscription = {
  id: string;
  name: string;
  email: string;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  amountBRL: number | null;
  live: {
    status: string;
    cancelAtPeriodEnd: boolean;
    periodEnd: string | null;
    priceId: string | null;
  } | null;
};

type Props = {
  items: AdminSubscription[];
  testMode: boolean;
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

/** Tabela de assinaturas com cancelamento/reativação no Stripe. */
export function AdminSubscriptions({ items, testMode }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [target, setTarget] = useState<AdminSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const money = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "BRL",
    }).format(value);

  async function send(action: "cancel" | "reactivate") {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "billingDisabled"
            ? t("admin.subs.billingOff")
            : data.error === "noSubscription"
              ? t("admin.subs.noSub")
              : data.error === "stripeError"
                ? t("errors.internal")
                : t("common.errorGeneric"),
        );
        return;
      }
      setNotice(
        action === "cancel"
          ? t("admin.subs.cancelledOk")
          : t("admin.subs.reactivatedOk"),
      );
      setTarget(null);
      router.refresh();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Alert tone="success" className="flex items-start justify-between gap-3">
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

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">{t("admin.users.columnUser")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.subs.planValue")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.subs.status")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.subs.details")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const sub = item.live;
              const hasStripe = !!item.stripeSubscriptionId;
              const scheduled = sub?.cancelAtPeriodEnd === true;
              return (
                <tr
                  key={item.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{item.name}</p>
                    <p className="text-xs text-zinc-500">{item.email}</p>
                    {item.stripeCustomerId && (
                      <a
                        href={`https://dashboard.stripe.com/${testMode ? "test/" : ""}customers/${item.stripeCustomerId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {t("admin.subs.openStripe")} ↗
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={planTone(item.plan)}>
                        {t(`billing.plan${capitalize(item.plan)}`)}
                      </Badge>
                      {item.amountBRL !== null && (
                        <span className="text-xs text-zinc-500">
                          {money(item.amountBRL)}
                          {t("billing.perMonth")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {!hasStripe ? (
                      <Badge tone="outline">{t("admin.subs.noSub")}</Badge>
                    ) : sub ? (
                      <div className="flex flex-col gap-1">
                        <Badge tone={statusTone(sub.status)}>
                          {t(`admin.subs.status_${sub.status}`)}
                        </Badge>
                        {scheduled && (
                          <Badge tone="warning">{t("admin.subs.scheduled")}</Badge>
                        )}
                      </div>
                    ) : (
                      <Badge tone="outline">{t("admin.subs.unknown")}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    {sub?.periodEnd
                      ? `${t("admin.subs.renews")} ${new Intl.DateTimeFormat(
                          undefined,
                          { dateStyle: "medium" },
                        ).format(new Date(sub.periodEnd))}`
                      : hasStripe
                        ? "—"
                        : t("admin.subs.noStripeData")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {hasStripe && sub && sub.status !== "canceled" && (
                      <Button
                        variant={scheduled ? "outline" : "danger"}
                        size="sm"
                        disabled={busy}
                        onClick={() => setTarget(item)}
                      >
                        {scheduled
                          ? t("admin.subs.reactivate")
                          : t("admin.subs.cancel")}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Confirmação */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
            <h3 className="font-semibold text-zinc-900">
              {target.live?.cancelAtPeriodEnd
                ? t("admin.subs.reactivateConfirm", { name: target.name })
                : t("admin.subs.cancelConfirm", { name: target.name })}
            </h3>
            <p className="mt-2 text-sm text-zinc-500">{t("admin.subs.hint")}</p>

            {error && <Alert className="mt-3">{error}</Alert>}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setTarget(null);
                  setError(null);
                }}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant={target.live?.cancelAtPeriodEnd ? "primary" : "danger"}
                loading={busy}
                disabled={busy}
                onClick={() =>
                  send(target.live?.cancelAtPeriodEnd ? "reactivate" : "cancel")
                }
              >
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
