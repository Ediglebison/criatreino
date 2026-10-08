"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

export type AdminExercise = {
  id: string;
  slug: string;
  namePt: string;
  nameEn: string;
  muscleGroup: string;
  equipment: string;
  secondaryMuscles: string[];
  warningPt: string | null;
  warningEn: string | null;
  usageCount: number;
};

const MUSCLE_GROUPS = [
  "CHEST",
  "BACK",
  "SHOULDERS",
  "BICEPS",
  "TRICEPS",
  "LEGS",
  "GLUTES",
  "ABS",
  "CARDIO",
] as const;

const EQUIPMENT = [
  "BARBELL",
  "DUMBBELL",
  "MACHINE",
  "CABLE",
  "BODYWEIGHT",
  "KETTLEBELL",
  "BAND",
  "OTHER",
] as const;

type FormState = {
  slug: string;
  namePt: string;
  nameEn: string;
  muscleGroup: string;
  equipment: string;
  secondaryMuscles: string[];
  warningPt: string;
  warningEn: string;
};

const EMPTY_FORM: FormState = {
  slug: "",
  namePt: "",
  nameEn: "",
  muscleGroup: "CHEST",
  equipment: "BARBELL",
  secondaryMuscles: [],
  warningPt: "",
  warningEn: "",
};

/** Catálogo de exercícios: busca, criação, edição e exclusão. */
export function AdminExercises({ exercises }: { exercises: AdminExercise[] }) {
  const t = useTranslations();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminExercise | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (groupFilter !== "ALL" && ex.muscleGroup !== groupFilter) return false;
      if (!q) return true;
      return (
        ex.namePt.toLowerCase().includes(q) ||
        ex.nameEn.toLowerCase().includes(q) ||
        ex.slug.includes(q)
      );
    });
  }, [exercises, query, groupFilter]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
  }

  function openEdit(ex: AdminExercise) {
    setEditingId(ex.id);
    setForm({
      slug: ex.slug,
      namePt: ex.namePt,
      nameEn: ex.nameEn,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment,
      secondaryMuscles: ex.secondaryMuscles,
      warningPt: ex.warningPt ?? "",
      warningEn: ex.warningEn ?? "",
    });
    setError(null);
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setError(null);
  }

  function toggleSecondary(group: string) {
    if (!form) return;
    const has = form.secondaryMuscles.includes(group);
    setForm({
      ...form,
      secondaryMuscles: has
        ? form.secondaryMuscles.filter((g) => g !== group)
        : [...form.secondaryMuscles, group],
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;

    setBusy(true);
    setError(null);
    try {
      const body = {
        slug: form.slug,
        namePt: form.namePt,
        nameEn: form.nameEn,
        muscleGroup: form.muscleGroup,
        equipment: form.equipment,
        secondaryMuscles: form.secondaryMuscles,
        warningPt: form.warningPt || null,
        warningEn: form.warningEn || null,
      };
      const res = await fetch(
        editingId ? `/api/admin/exercises/${editingId}` : "/api/admin/exercises",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "slugTaken"
            ? t("admin.exercises.slugTaken")
            : data.error === "validation"
              ? t("errors.validation")
              : t("common.errorGeneric"),
        );
        return;
      }
      setNotice(t("admin.exercises.saved"));
      closeForm();
      router.refresh();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exercises/${deleting.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleting(null);
        setError(
          data.error === "inUse"
            ? t("admin.exercises.inUse", { count: data.count ?? 0 })
            : t("common.errorGeneric"),
        );
        return;
      }
      setNotice(t("admin.exercises.deleted"));
      setDeleting(null);
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
      {error && !form && !deleting && <Alert>{error}</Alert>}

      {/* Filtros + ação */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.exercises.searchPlaceholder")}
          className="sm:max-w-xs"
          aria-label={t("admin.exercises.searchPlaceholder")}
        />
        <Select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          aria-label={t("admin.exercises.muscleGroup")}
          className="sm:w-44"
        >
          <option value="ALL">
            {t("admin.exercises.muscleGroup")}: {t("common.all")}
          </option>
          {MUSCLE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {t(`muscleGroups.${group}`)}
            </option>
          ))}
        </Select>
        <span className="text-sm text-zinc-500 sm:ml-auto">
          {filtered.length}/{exercises.length}
        </span>
        <Button onClick={openCreate}>+ {t("admin.exercises.add")}</Button>
      </div>

      {/* Tabela */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">{t("admin.exercises.namePt")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.exercises.slug")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.exercises.muscleGroup")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.exercises.equipment")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.exercises.usage")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  {t("admin.exercises.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((ex) => (
                <tr
                  key={ex.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{ex.namePt}</p>
                    <p className="text-xs text-zinc-500">{ex.nameEn}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {ex.slug}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="outline">
                      {t(`muscleGroups.${ex.muscleGroup}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {t(`equipment.${ex.equipment}`)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{ex.usageCount}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(ex)}
                      >
                        {t("common.edit")}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setDeleting(ex);
                          setError(null);
                        }}
                      >
                        {t("common.remove")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Modal de criação/edição */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="font-semibold text-zinc-900">
                {editingId
                  ? t("admin.exercises.editTitle")
                  : t("admin.exercises.newTitle")}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>

            <form onSubmit={save} className="mt-4 flex flex-col gap-4">
              {error && <Alert>{error}</Alert>}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("admin.exercises.namePt")} required>
                  <Input
                    value={form.namePt}
                    onChange={(e) => setForm({ ...form, namePt: e.target.value })}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </Field>
                <Field label={t("admin.exercises.nameEn")} required>
                  <Input
                    value={form.nameEn}
                    onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </Field>
              </div>

              <Field
                label={t("admin.exercises.slug")}
                hint={t("admin.exercises.slugHint")}
                required
              >
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  required
                  minLength={2}
                  maxLength={80}
                  className="font-mono"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("admin.exercises.muscleGroup")} required>
                  <Select
                    value={form.muscleGroup}
                    onChange={(e) =>
                      setForm({ ...form, muscleGroup: e.target.value })
                    }
                  >
                    {MUSCLE_GROUPS.map((group) => (
                      <option key={group} value={group}>
                        {t(`muscleGroups.${group}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("admin.exercises.equipment")} required>
                  <Select
                    value={form.equipment}
                    onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                  >
                    {EQUIPMENT.map((eq) => (
                      <option key={eq} value={eq}>
                        {t(`equipment.${eq}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label={t("admin.exercises.secondary")}>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {MUSCLE_GROUPS.map((group) => (
                    <label
                      key={group}
                      className="flex items-center gap-1.5 text-sm text-zinc-700"
                    >
                      <Checkbox
                        checked={form.secondaryMuscles.includes(group)}
                        onChange={() => toggleSecondary(group)}
                      />
                      {t(`muscleGroups.${group}`)}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label={t("admin.exercises.warningPt")}>
                <Textarea
                  rows={2}
                  value={form.warningPt}
                  maxLength={500}
                  onChange={(e) => setForm({ ...form, warningPt: e.target.value })}
                />
              </Field>
              <Field label={t("admin.exercises.warningEn")}>
                <Textarea
                  rows={2}
                  value={form.warningEn}
                  maxLength={500}
                  onChange={(e) => setForm({ ...form, warningEn: e.target.value })}
                />
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeForm}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" loading={busy} disabled={busy}>
                  {busy ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
            <h3 className="font-semibold text-zinc-900">
              {t("admin.exercises.deleteTitle")}
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              {t("admin.exercises.deleteConfirm", { name: deleting.namePt })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setDeleting(null)}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={busy}
                onClick={confirmDelete}
              >
                {t("common.remove")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
