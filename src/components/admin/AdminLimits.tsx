"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Alert, Badge, Button, Card, CardTitle, Input } from "@/components/ui";

export type LimitRow = {
  plan: string;
  value: number;
  envDefault: number;
  source: "db" | "env";
};

type Props = { rows: LimitRow[] };

function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/**
 * Limites de cota por plano: grava overrides no banco (PUT) ou marca o
 * reset para o valor do `.env` (null).
 */
export function AdminLimits({ rows: initial }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((row) => [row.plan, String(row.value)])),
  );
  const [resets, setResets] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function setValue(plan: string, value: string) {
    setValues((prev) => ({ ...prev, [plan]: value }));
    setResets((prev) => ({ ...prev, [plan]: false }));
  }

  function markReset(plan: string) {
    const row = initial.find((r) => r.plan === plan);
    if (!row) return;
    setValues((prev) => ({ ...prev, [plan]: String(row.envDefault) }));
    setResets((prev) => ({ ...prev, [plan]: true }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const payload: Record<string, number | null> = {};
    for (const row of initial) {
      if (resets[row.plan]) {
        payload[row.plan] = null; // volta ao .env
        continue;
      }
      const raw = values[row.plan]?.trim() ?? "";
      if (!/^\d+$/.test(raw)) {
        setError(t("admin.settings.invalid"));
        setBusy(false);
        return;
      }
      const parsed = Number.parseInt(raw, 10);
      if (parsed !== row.value) payload[row.plan] = parsed;
    }

    if (Object.keys(payload).length === 0) {
      setNotice(t("admin.settings.noChanges"));
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/settings/limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "validation"
            ? t("admin.settings.invalid")
            : t("common.errorGeneric"),
        );
        return;
      }
      setNotice(t("admin.settings.saved"));
      setResets({});
      router.refresh();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle>{t("admin.settings.limitsTitle")}</CardTitle>

      <form onSubmit={save} className="mt-4 flex flex-col gap-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert>{error}</Alert>}

        <div className="grid gap-3">
          {initial.map((row) => {
            const isReset = resets[row.plan] === true;
            const overridden = row.source === "db" && !isReset;
            return (
              <div
                key={row.plan}
                className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-center"
              >
                <div className="sm:w-40">
                  <p className="text-sm font-medium text-zinc-900">
                    {t(`billing.plan${capitalize(row.plan)}`)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {t("admin.settings.envDefault", { value: row.envDefault })}
                  </p>
                </div>

                <Input
                  type="number"
                  min={0}
                  max={100000}
                  value={values[row.plan]}
                  onChange={(e) => setValue(row.plan, e.target.value)}
                  className="sm:w-32"
                  aria-label={t(`billing.plan${capitalize(row.plan)}`)}
                />

                <Badge tone={overridden ? "info" : "outline"}>
                  {overridden
                    ? t("admin.settings.override")
                    : t("admin.settings.fromEnv")}
                </Badge>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="sm:ml-auto"
                  onClick={() => markReset(row.plan)}
                  disabled={row.source === "env" && !isReset}
                >
                  {t("admin.settings.reset")}
                </Button>
              </div>
            );
          })}
        </div>

        <div>
          <Button type="submit" loading={busy} disabled={busy}>
            {busy ? t("common.saving") : t("admin.settings.save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
