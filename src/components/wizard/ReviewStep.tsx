"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Spinner,
} from "@/components/ui";
import { exerciseName, exerciseWarning } from "@/lib/types";
import type {
  CatalogExercise,
  DraftDay,
  DraftExercise,
  Equipment,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Estado de revisão (draft + flags do checklist)
// ---------------------------------------------------------------------------

export type ReviewExercise = DraftExercise & {
  reviewed?: boolean;
  checked?: boolean;
};

export type ReviewDay = Omit<DraftDay, "exercises"> & {
  exercises: ReviewExercise[];
};

export type ReviewDraft = {
  title: string;
  days: ReviewDay[];
};

type Props = {
  draft: ReviewDraft;
  onChange: (next: ReviewDraft) => void;
  catalog: CatalogExercise[];
  equipment: Equipment[];
  locale: string;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onGenerateAgain: () => void;
  onFinish: () => void;
};

type AlternativesState = {
  key: string;
  loading: boolean;
  items: CatalogExercise[];
  error: string | null;
};

export function ReviewStep({
  draft,
  onChange,
  catalog,
  equipment,
  locale,
  saving,
  error,
  onBack,
  onGenerateAgain,
  onFinish,
}: Props) {
  const t = useTranslations();
  const [panel, setPanel] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativesState | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const bySlug = useMemo(
    () => new Map(catalog.map((e) => [e.slug, e])),
    [catalog],
  );

  const name = (ex: { slug: string }) => {
    const item = bySlug.get(ex.slug);
    return item ? exerciseName(item, locale) : ex.slug;
  };

  const total = draft.days.reduce((n, d) => n + d.exercises.length, 0);
  const done = draft.days.reduce(
    (n, d) =>
      n +
      d.exercises.filter(
        (e) => e.reviewed || e.removed || e.replacedFromSlug,
      ).length,
    0,
  );

  const patchExercise = useCallback(
    (dayIdx: number, exIdx: number, patch: Partial<ReviewExercise>) => {
      onChange({
        ...draft,
        days: draft.days.map((day, di) =>
          di !== dayIdx
            ? day
            : {
                ...day,
                exercises: day.exercises.map((ex, ei) =>
                  ei !== exIdx ? ex : { ...ex, ...patch },
                ),
              },
        ),
      });
    },
    [draft, onChange],
  );

  // Carrega alternativas ao abrir o painel de substituição
  const openPanel = useCallback(
    async (dayIdx: number, exIdx: number) => {
      const key = `${dayIdx}-${exIdx}`;
      setPanel(key);
      setAlternatives({ key, loading: true, items: [], error: null });

      const ex = draft.days[dayIdx].exercises[exIdx];
      const group = bySlug.get(ex.slug)?.muscleGroup;
      const usedSlugs = draft.days.flatMap((d) =>
        d.exercises.filter((e) => !e.removed).map((e) => e.slug),
      );

      try {
        const params = new URLSearchParams();
        if (group) params.set("muscleGroup", group);
        params.set("exclude", usedSlugs.join(","));
        const res = await fetch(`/api/exercises?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "error");
        setAlternatives({
          key,
          loading: false,
          items: (data.exercises as CatalogExercise[]).filter(
            (e) => e.slug !== ex.slug,
          ),
          error: null,
        });
      } catch {
        setAlternatives({
          key,
          loading: false,
          items: [],
          error: t("common.errorGeneric"),
        });
      }
    },
    [bySlug, draft, t],
  );

  const applyReplacement = (
    dayIdx: number,
    exIdx: number,
    newSlug: string,
  ) => {
    patchExercise(dayIdx, exIdx, {
      slug: newSlug,
      replacedFromSlug: draft.days[dayIdx].exercises[exIdx].slug,
      reviewed: true,
      checked: false,
      removed: false,
    });
    setPanel(null);
    setAlternatives(null);
  };

  // Painel aberto com filtro de equipamento
  const visibleAlternatives = (alternatives?.items ?? []).filter((e) => {
    if (!onlyAvailable) return true;
    return e.equipment === "BODYWEIGHT" || equipment.includes(e.equipment);
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <h3 className="font-semibold text-indigo-900">
          {t("wizard.reviewStep.title")}
        </h3>
        <p className="mt-1 text-sm text-indigo-800">
          {t("wizard.reviewStep.hint")}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-indigo-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: total ? `${Math.round((done / total) * 100)}%` : "0%" }}
            />
          </div>
          <span className="whitespace-nowrap text-xs font-semibold text-indigo-800">
            {t("wizard.reviewStep.checklistProgress", { done, total })}
          </span>
        </div>
      </div>

      <Field
        label={t("wizard.reviewStep.workoutTitle")}
        htmlFor="workout-title"
        required
      >
        <Input
          id="workout-title"
          value={draft.title}
          maxLength={120}
          placeholder={t("wizard.reviewStep.workoutTitlePlaceholder")}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
      </Field>

      {error && <Alert>{error}</Alert>}

      {draft.days.map((day, dayIdx) => (
        <Card key={dayIdx} className="p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <p className="font-semibold text-zinc-900">{day.label}</p>
              {day.focus && (
                <p className="text-xs text-zinc-500">{day.focus}</p>
              )}
            </div>
            <Badge tone="outline">
              {day.exercises.filter((e) => !e.removed).length}{" "}
              {t("workout.table.exercise")}
            </Badge>
          </div>

          {day.exercises.length === 0 ? (
            <p className="px-4 py-4 text-sm text-zinc-500">
              {t("wizard.reviewStep.emptyDay")}
            </p>
          ) : (
            <ul>
              {day.exercises.map((ex, exIdx) => {
                const item = bySlug.get(ex.slug);
                const original = ex.replacedFromSlug
                  ? bySlug.get(ex.replacedFromSlug)
                  : undefined;
                const warning = item ? exerciseWarning(item, locale) : null;
                const panelKey = `${dayIdx}-${exIdx}`;
                const panelOpen = panel === panelKey;

                return (
                  <li
                    key={exIdx}
                    className={`border-b border-zinc-100 px-4 py-3 last:border-0 ${
                      ex.removed ? "bg-zinc-50 opacity-60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <Checkbox
                        checked={!!ex.checked}
                        disabled={ex.removed}
                        onChange={(e) =>
                          patchExercise(dayIdx, exIdx, {
                            checked: e.target.checked,
                            reviewed: true,
                          })
                        }
                        aria-label={t("wizard.reviewStep.cannotKeep")}
                        className="mt-1"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-medium text-zinc-900 ${
                              ex.removed ? "line-through" : ""
                            }`}
                          >
                            {name(ex)}
                          </span>
                          {item && (
                            <Badge tone="outline">
                              {t(`muscleGroups.${item.muscleGroup}`)}
                            </Badge>
                          )}
                          {item && (
                            <Badge tone="info">{t(`equipment.${item.equipment}`)}</Badge>
                          )}
                          {ex.replacedFromSlug && (
                            <Badge tone="success">
                              {t("wizard.reviewStep.replacedBadge")}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-0.5 text-xs text-zinc-500">
                          {ex.sets} × {ex.reps}
                          {ex.restSeconds != null &&
                            ` · ${t("workout.seconds", { n: ex.restSeconds })}`}
                          {original && (
                            <span className="text-emerald-700">
                              {" · "}
                              {t("wizard.reviewStep.replacedFrom", {
                                name: exerciseName(original, locale),
                              })}
                            </span>
                          )}
                          {ex.removed && (
                            <span className="text-zinc-500">
                              {" · "}
                              {t("wizard.reviewStep.removed")}
                            </span>
                          )}
                        </p>

                        {warning && (
                          <p className="mt-1 text-xs text-amber-700">
                            ⚠ {warning}
                          </p>
                        )}

                        {ex.checked && !ex.removed && (
                          <p className="mt-1.5 text-xs font-semibold text-red-600">
                            {t("wizard.reviewStep.cannotKeep")} —{" "}
                            {t("wizard.reviewStep.replace")}:
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {!ex.removed && (
                          <>
                            <Button
                              size="sm"
                              variant={ex.checked ? "primary" : "outline"}
                              onClick={() =>
                                panelOpen
                                  ? (setPanel(null), setAlternatives(null))
                                  : openPanel(dayIdx, exIdx)
                              }
                            >
                              {t("wizard.reviewStep.replace")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                patchExercise(dayIdx, exIdx, {
                                  removed: true,
                                  reviewed: true,
                                  checked: false,
                                })
                              }
                            >
                              {t("common.remove")}
                            </Button>
                          </>
                        )}
                        {ex.removed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patchExercise(dayIdx, exIdx, {
                                removed: false,
                                reviewed: true,
                              })
                            }
                          >
                            {t("wizard.reviewStep.restore")}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Painel de substituição */}
                    {panelOpen && (
                      <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-indigo-900">
                              {t("wizard.reviewStep.replaceTitle")}
                            </p>
                            <p className="text-xs text-indigo-700">
                              {t("wizard.reviewStep.replaceHint")}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-xs font-medium text-indigo-900">
                            <Checkbox
                              checked={onlyAvailable}
                              onChange={(e) => setOnlyAvailable(e.target.checked)}
                            />
                            {t("wizard.reviewStep.onlyAvailable")}
                          </label>
                        </div>

                        <div className="mt-3">
                          {alternatives?.loading ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-indigo-800">
                              <Spinner className="size-4" /> {t("common.loading")}
                            </div>
                          ) : alternatives?.error ? (
                            <Alert>{alternatives.error}</Alert>
                          ) : visibleAlternatives.length === 0 ? (
                            <p className="py-3 text-sm text-indigo-800">
                              {t("wizard.reviewStep.noAlternatives")}
                            </p>
                          ) : (
                            <ul className="max-h-64 divide-y divide-indigo-100 overflow-y-auto rounded-lg border border-indigo-100 bg-white">
                              {visibleAlternatives.map((alt) => {
                                const altWarning = exerciseWarning(alt, locale);
                                return (
                                  <li
                                    key={alt.slug}
                                    className="flex items-center justify-between gap-3 px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-zinc-900">
                                        {exerciseName(alt, locale)}
                                      </p>
                                      <p className="text-xs text-zinc-500">
                                        {t(`equipment.${alt.equipment}`)}
                                        {altWarning && (
                                          <span className="text-amber-700">
                                            {" · ⚠ "}
                                            {altWarning}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        applyReplacement(dayIdx, exIdx, alt.slug)
                                      }
                                    >
                                      {t("wizard.reviewStep.apply")}
                                    </Button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ))}

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            {t("common.back")}
          </Button>
          <Button variant="ghost" onClick={onGenerateAgain}>
            {t("wizard.reviewStep.generateAgain")}
          </Button>
        </div>
        <Button onClick={onFinish} loading={saving} disabled={!draft.title.trim()}>
          {saving ? t("wizard.reviewStep.finishing") : t("wizard.reviewStep.finish")}
        </Button>
      </div>
    </div>
  );
}
