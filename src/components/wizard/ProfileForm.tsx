"use client";

import { useTranslations } from "next-intl";
import { Alert, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import {
  EQUIPMENT,
  EXPERIENCE_LEVELS,
  GOALS,
  LIMITATIONS,
  SEXES,
  type Equipment,
  type ExperienceLevel,
  type Goal,
  type LimitationCode,
  type Sex,
} from "@/lib/types";

export const MEASUREMENT_KEYS = [
  "chest",
  "waist",
  "hips",
  "armRight",
  "armLeft",
  "thighRight",
  "thighLeft",
  "calf",
] as const;

export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

export type ProfileFormState = {
  birthDate: string;
  sex: Sex;
  heightCm: string;
  weightKg: string;
  bodyFatPct: string;
  measurements: Record<MeasurementKey, string>;
  goal: Goal;
  goalNotes: string;
  limitations: LimitationCode[];
  limitationNotes: string;
  daysPerWeek: number;
  sessionMinutes: number;
  experience: ExperienceLevel;
  equipment: Equipment[];
  observations: string;
};

export const EMPTY_PROFILE: ProfileFormState = {
  birthDate: "",
  sex: "UNSPECIFIED",
  heightCm: "",
  weightKg: "",
  bodyFatPct: "",
  measurements: {
    chest: "",
    waist: "",
    hips: "",
    armRight: "",
    armLeft: "",
    thighRight: "",
    thighLeft: "",
    calf: "",
  },
  goal: "MUSCLE_GAIN",
  goalNotes: "",
  limitations: [],
  limitationNotes: "",
  daysPerWeek: 3,
  sessionMinutes: 60,
  experience: "BEGINNER",
  equipment: ["MACHINE", "DUMBBELL", "BODYWEIGHT"],
  observations: "",
};

const SESSION_OPTIONS = [30, 45, 60, 75, 90, 120];

type Props = {
  value: ProfileFormState;
  onChange: (next: ProfileFormState) => void;
  error?: string | null;
};

export function ProfileForm({ value, onChange, error }: Props) {
  const t = useTranslations();

  const update = (patch: Partial<ProfileFormState>) =>
    onChange({ ...value, ...patch });

  const toggle = <T extends string>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert>{error}</Alert>}

      {/* ---------------- Medidas ---------------- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("profile.measurementsSection")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("profile.birthDate")} htmlFor="birthDate">
            <Input
              id="birthDate"
              type="date"
              value={value.birthDate}
              onChange={(e) => update({ birthDate: e.target.value })}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label={t("profile.sex")} htmlFor="sex">
            <Select
              id="sex"
              value={value.sex}
              onChange={(e) => update({ sex: e.target.value as Sex })}
            >
              {SEXES.map((s) => (
                <option key={s} value={s}>
                  {t(`sex.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div />
          <Field label={t("profile.height")} htmlFor="height">
            <Input
              id="height"
              type="number"
              inputMode="decimal"
              min={50}
              max={260}
              step="0.5"
              placeholder="175"
              value={value.heightCm}
              onChange={(e) => update({ heightCm: e.target.value })}
            />
          </Field>
          <Field label={t("profile.weight")} htmlFor="weight">
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              min={20}
              max={400}
              step="0.1"
              placeholder="78.5"
              value={value.weightKg}
              onChange={(e) => update({ weightKg: e.target.value })}
            />
          </Field>
          <Field label={t("profile.bodyFat")} htmlFor="bodyFat">
            <Input
              id="bodyFat"
              type="number"
              inputMode="decimal"
              min={1}
              max={70}
              step="0.1"
              placeholder="18"
              value={value.bodyFatPct}
              onChange={(e) => update({ bodyFatPct: e.target.value })}
            />
          </Field>
        </div>

        <p className="mt-4 mb-2 text-sm font-medium text-zinc-700">
          {t("profile.circumferences")}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MEASUREMENT_KEYS.map((key) => (
            <Field key={key} label={t(`profile.${key}`)} htmlFor={`m-${key}`}>
              <Input
                id={`m-${key}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={400}
                step="0.5"
                placeholder="—"
                value={value.measurements[key]}
                onChange={(e) =>
                  update({
                    measurements: {
                      ...value.measurements,
                      [key]: e.target.value,
                    },
                  })
                }
              />
            </Field>
          ))}
        </div>
      </section>

      {/* ---------------- Objetivos e limitações ---------------- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("profile.questionnaireSection")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.goal")} htmlFor="goal" required>
            <Select
              id="goal"
              value={value.goal}
              onChange={(e) => update({ goal: e.target.value as Goal })}
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {t(`goals.${g}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("profile.goalNotes")}
            htmlFor="goalNotes"
          >
            <Input
              id="goalNotes"
              value={value.goalNotes}
              placeholder={t("profile.goalNotesPlaceholder")}
              onChange={(e) => update({ goalNotes: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700">
            {t("profile.limitations")}
          </p>
          <p className="mb-2 text-xs text-zinc-500">
            {t("profile.limitationsHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {LIMITATIONS.map((l) => {
              const active = value.limitations.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() =>
                    update({ limitations: toggle(value.limitations, l) })
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-amber-400 bg-amber-100 text-amber-900"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                  aria-pressed={active}
                >
                  {t(`limitations.${l}`)}
                </button>
              );
            })}
          </div>
          {value.limitations.length > 0 && (
            <div className="mt-3">
              <Field
                label={t("profile.limitationNotes")}
                htmlFor="limitationNotes"
              >
                <Textarea
                  id="limitationNotes"
                  rows={2}
                  value={value.limitationNotes}
                  placeholder={t("profile.limitationNotesPlaceholder")}
                  onChange={(e) => update({ limitationNotes: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Disponibilidade ---------------- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("profile.scheduleSection")}
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700">
              {t("profile.daysPerWeek")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => update({ daysPerWeek: d })}
                  className={`size-9 rounded-lg border text-sm font-semibold transition-colors ${
                    value.daysPerWeek === d
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                  aria-pressed={value.daysPerWeek === d}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <Field label={t("profile.sessionMinutes")} htmlFor="session">
            <Select
              id="session"
              value={value.sessionMinutes}
              onChange={(e) =>
                update({ sessionMinutes: Number(e.target.value) })
              }
            >
              {SESSION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} {t("profile.minutes")}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700">
              {t("profile.experience")}
            </p>
            <div className="flex flex-col gap-1.5">
              {EXPERIENCE_LEVELS.map((lvl) => (
                <label
                  key={lvl}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    value.experience === lvl
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-zinc-300 bg-white text-zinc-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="experience"
                    className="accent-indigo-600"
                    checked={value.experience === lvl}
                    onChange={() => update({ experience: lvl })}
                  />
                  {t(`experience.${lvl}`)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700">
            {t("profile.equipment")}
          </p>
          <p className="mb-2 text-xs text-zinc-500">
            {t("profile.equipmentHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((eq) => {
              const active = value.equipment.includes(eq);
              return (
                <label
                  key={eq}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <Checkbox
                    checked={active}
                    onChange={() =>
                      update({ equipment: toggle(value.equipment, eq) })
                    }
                  />
                  {t(`equipment.${eq}`)}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <Field label={t("profile.observations")} htmlFor="observations">
            <Textarea
              id="observations"
              rows={2}
              value={value.observations}
              placeholder={t("profile.observationsPlaceholder")}
              onChange={(e) => update({ observations: e.target.value })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversões entre estado do formulário e payloads da API
// ---------------------------------------------------------------------------

function parseNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function formToPayload(state: ProfileFormState) {
  const measurements = Object.fromEntries(
    MEASUREMENT_KEYS.map((k) => [k, parseNum(state.measurements[k])]),
  );
  return {
    birthDate: state.birthDate || null,
    sex: state.sex,
    heightCm: parseNum(state.heightCm),
    weightKg: parseNum(state.weightKg),
    bodyFatPct: parseNum(state.bodyFatPct),
    measurements,
    goal: state.goal,
    goalNotes: state.goalNotes,
    limitations: state.limitations,
    limitationNotes: state.limitationNotes,
    daysPerWeek: state.daysPerWeek,
    sessionMinutes: state.sessionMinutes,
    experience: state.experience,
    equipment: state.equipment,
    observations: state.observations,
  };
}

export type ProfilePayload = ReturnType<typeof formToPayload>;

type ApiProfile = {
  birthDate: string | null;
  sex: string;
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  measurements: Record<string, unknown> | null;
  goal: string;
  goalNotes: string | null;
  limitations: unknown;
  limitationNotes: string | null;
  daysPerWeek: number;
  sessionMinutes: number;
  experience: string;
  equipment: unknown;
  observations: string | null;
};

export function apiToForm(profile: ApiProfile): ProfileFormState {
  const measurements = { ...EMPTY_PROFILE.measurements };
  if (profile.measurements && typeof profile.measurements === "object") {
    for (const key of MEASUREMENT_KEYS) {
      const v = profile.measurements[key];
      if (typeof v === "number") measurements[key] = String(v);
    }
  }
  return {
    birthDate: profile.birthDate ? profile.birthDate.slice(0, 10) : "",
    sex: profile.sex as Sex,
    heightCm: profile.heightCm != null ? String(profile.heightCm) : "",
    weightKg: profile.weightKg != null ? String(profile.weightKg) : "",
    bodyFatPct: profile.bodyFatPct != null ? String(profile.bodyFatPct) : "",
    measurements,
    goal: profile.goal as Goal,
    goalNotes: profile.goalNotes ?? "",
    limitations: Array.isArray(profile.limitations)
      ? (profile.limitations.filter(
          (l) => typeof l === "string",
        ) as LimitationCode[])
      : [],
    limitationNotes: profile.limitationNotes ?? "",
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    experience: profile.experience as ExperienceLevel,
    equipment: Array.isArray(profile.equipment)
      ? (profile.equipment.filter(
          (e) => typeof e === "string",
        ) as Equipment[])
      : [],
    observations: profile.observations ?? "",
  };
}
