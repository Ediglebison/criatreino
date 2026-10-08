"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { planTone, roleTone } from "./badges";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "PROFESSOR" | "ALUNO" | "ADMIN";
  plan: "FREE" | "BASIC" | "PRO" | "ULTIMATE";
  locale: string;
  createdAt: string;
  professorName: string | null;
  counts: { students: number; workouts: number; assignments: number };
  used: number;
};

type Props = {
  users: AdminUser[];
  limits: Record<string, number>;
  meId: string;
};

const ROLES = ["PROFESSOR", "ALUNO", "ADMIN"] as const;
const PLANS = ["FREE", "BASIC", "PRO", "ULTIMATE"] as const;

function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

type FormState = {
  name: string;
  email: string;
  role: AdminUser["role"];
  plan: AdminUser["plan"];
  password: string;
};

/** Tabela de usuários com busca, filtros e edição (modal). */
export function AdminUsers({ users, limits, meId }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "ALL" && user.role !== roleFilter) return false;
      if (planFilter !== "ALL" && user.plan !== planFilter) return false;
      if (!q) return true;
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q)
      );
    });
  }, [users, query, roleFilter, planFilter]);

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      password: "",
    });
    setError(null);
  }

  function close() {
    setEditing(null);
    setForm(null);
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !form) return;

    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        plan: form.plan,
      };
      if (form.password) body.password = form.password;

      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "emailTaken"
            ? t("admin.users.emailTaken")
            : data.error === "cannotChangeOwnRole"
              ? t("admin.users.cannotChangeOwnRole")
              : data.error === "validation"
                ? t("errors.validation")
                : t("common.errorGeneric"),
        );
        return;
      }

      const messages = [t("admin.users.saved")];
      if (data.detachedStudents > 0) {
        messages.push(t("admin.users.detached", { count: data.detachedStudents }));
      }
      if (form.role !== editing.role) {
        messages.push(t("admin.users.roleChangeNote"));
      }
      setNotice(messages.join(" "));
      close();
      router.refresh();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setSaving(false);
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

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.users.searchPlaceholder")}
          className="sm:max-w-xs"
          aria-label={t("admin.users.searchPlaceholder")}
        />
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label={t("admin.users.filterRole")}
          className="sm:w-44"
        >
          <option value="ALL">{t("admin.users.filterRole")}: {t("common.all")}</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </Select>
        <Select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          aria-label={t("admin.users.filterPlan")}
          className="sm:w-44"
        >
          <option value="ALL">{t("admin.users.filterPlan")}: {t("common.all")}</option>
          {PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {t(`billing.plan${capitalize(plan)}`)}
            </option>
          ))}
        </Select>
        <span className="text-sm text-zinc-500 sm:ml-auto">
          {filtered.length}/{users.length}
        </span>
      </div>

      {/* Tabela */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">{t("admin.users.columnUser")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.users.columnRole")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.users.columnPlan")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.users.columnLinks")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.users.columnJoined")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  {t("admin.users.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((user) => {
                const limit = limits[user.plan] ?? 0;
                return (
                  <tr
                    key={user.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{user.name}</p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                      {user.professorName && (
                        <p className="text-xs text-zinc-400">
                          {t("admin.users.linkedTo", { name: user.professorName })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={roleTone(user.role)}>{t(`roles.${user.role}`)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={planTone(user.plan)}>
                          {t(`billing.plan${capitalize(user.plan)}`)}
                        </Badge>
                        <span className="text-xs text-zinc-500">
                          {t("admin.users.quotaUsed", { used: user.used, limit })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      <p>{t("admin.users.studentsCount", { count: user.counts.students })}</p>
                      <p>{t("admin.users.workoutsCount", { count: user.counts.workouts })}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(new Date(user.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                        {t("common.edit")}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* Modal de edição */}
      {editing && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-zinc-900">
                  {t("admin.users.modalTitle")}
                </h3>
                <p className="text-sm text-zinc-500">{t("admin.users.modalDescription")}</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>

            <form onSubmit={save} className="mt-4 flex flex-col gap-4">
              {error && <Alert>{error}</Alert>}

              <Field label={t("common.name")} required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </Field>

              <Field label={t("common.email")} required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("admin.users.columnRole")}>
                  <Select
                    value={form.role}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value as AdminUser["role"] })
                    }
                    disabled={editing.id === meId}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`roles.${role}`)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label={t("admin.users.columnPlan")}>
                  <Select
                    value={form.plan}
                    onChange={(e) =>
                      setForm({ ...form, plan: e.target.value as AdminUser["plan"] })
                    }
                  >
                    {PLANS.map((plan) => (
                      <option key={plan} value={plan}>
                        {t(`billing.plan${capitalize(plan)}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {editing.id === meId && form.role === editing.role && (
                <p className="-mt-2 text-xs text-zinc-400">
                  {t("admin.users.selfRoleHint")}
                </p>
              )}

              <Field
                label={t("admin.users.newPassword")}
                hint={t("admin.users.newPasswordHint")}
              >
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                  maxLength={200}
                  autoComplete="new-password"
                />
              </Field>

              {form.role !== editing.role && (
                <Alert tone="info">{t("admin.users.roleChangeNote")}</Alert>
              )}
              {form.plan !== editing.plan && (
                <Alert tone="info">{t("admin.users.overridePlanNote")}</Alert>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" loading={saving} disabled={saving}>
                  {saving ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
