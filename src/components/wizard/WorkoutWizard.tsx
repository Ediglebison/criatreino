"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Spinner,
} from "@/components/ui";
import {
  athleteProfileSchema,
  type CatalogExercise,
  type Equipment,
} from "@/lib/types";
import type { QuotaInfo } from "@/components/BillingCard";
import {
  EMPTY_PROFILE,
  ProfileForm,
  apiToForm,
  formToPayload,
  type ProfileFormState,
} from "./ProfileForm";
import { ReviewStep, type ReviewDraft } from "./ReviewStep";

type Step = "athlete" | "profile" | "generate" | "review";

type ApiProfile = Parameters<typeof apiToForm>[0];

export type WizardProps = {
  me: { id: string; name: string; role: "PROFESSOR" | "ALUNO" };
  students: Array<{ id: string; name: string; email: string }>;
  initialProfile: ApiProfile | null;
  preselectedStudent: { id: string; name: string } | null;
  locale: string;
};

export function WorkoutWizard({
  me,
  students,
  initialProfile,
  preselectedStudent,
  locale,
}: WizardProps) {
  const t = useTranslations();
  const router = useRouter();

  const isProfessor = me.role === "PROFESSOR";

  const [step, setStep] = useState<Step>(
    !isProfessor
      ? "profile"
      : preselectedStudent
        ? "profile"
        : "athlete",
  );
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const initialAthlete = preselectedStudent ?? { id: me.id, name: me.name };
  const hasInitialProfile = Boolean(initialProfile) && preselectedStudent === null;

  const [athlete, setAthlete] = useState<{ id: string; name: string }>(
    initialAthlete,
  );
  const [profile, setProfile] = useState<ProfileFormState>(() =>
    hasInitialProfile && initialProfile
      ? apiToForm(initialProfile)
      : EMPTY_PROFILE,
  );
  const [profileLoadedFor, setProfileLoadedFor] = useState<string | null>(
    hasInitialProfile ? me.id : null,
  );
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [source, setSource] = useState<"AI" | "SIMULATED">("AI");
  const [saving, setSaving] = useState(false);

  // Busca a cota mensal ao entrar na etapa de geração (professor)
  useEffect(() => {
    if (step !== "generate" || !isProfessor || quota) return;
    let cancelled = false;
    fetch("/api/billing/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { quota?: QuotaInfo } | null) => {
        if (!cancelled && data?.quota) setQuota(data.quota);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step, isProfessor, quota]);

  /** Avança para o perfil, carregando os dados do atleta se necessário. */
  async function continueFromAthlete(next?: { id: string; name: string }) {
    const target = next ?? athlete;
    setAthlete(target);
    setStep("profile");
    setStepError(null);

    if (profileLoadedFor === target.id) return;

    setLoadingProfile(true);
    try {
      const res = await fetch(`/api/profiles?userId=${target.id}`);
      const data = await res.json();
      if (res.ok) {
        setProfile(data.profile ? apiToForm(data.profile) : EMPTY_PROFILE);
        setProfileLoadedFor(target.id);
      } else {
        setStepError(t("wizard.profileStep.loadError"));
      }
    } catch {
      setStepError(t("wizard.profileStep.loadError"));
    } finally {
      setLoadingProfile(false);
    }
  }

  const payload = useMemo(() => formToPayload(profile), [profile]);

  function validateProfile(): string | null {
    const parsed = athleteProfileSchema.safeParse(payload);
    if (parsed.success) return null;
    const issue = parsed.error.issues[0];
    if (!issue) return t("wizard.errors.profileInvalid");
    if (String(issue.path[0]) === "equipment") {
      return t("errors.selectEquipment");
    }
    if (
      ["heightCm", "weightKg", "bodyFatPct"].includes(String(issue.path[0])) ||
      String(issue.path[0]) === "measurements"
    ) {
      return t("errors.invalidNumber");
    }
    return t("errors.required");
  }

  // ---------------- Etapa: perfil ----------------

  async function saveProfileAndContinue() {
    const invalid = validateProfile();
    if (invalid) {
      setStepError(invalid);
      return;
    }
    setBusy(true);
    setStepError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: athlete.id, ...payload }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStepError(
          data.error === "validation"
            ? t("wizard.errors.profileInvalid")
            : t("common.errorGeneric"),
        );
        return;
      }
      setStep("generate");
    } catch {
      setStepError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  // ---------------- Etapa: gerar ----------------

  async function generate() {
    setBusy(true);
    setStepError(null);
    try {
      const res = await fetch("/api/workouts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteUserId: athlete.id,
          profile: payload,
          locale,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        // Cota mensal esgotada — mensagem específica com o limite do plano
        const limit = (data as { quota?: { limit?: number } }).quota?.limit;
        setStepError(
          typeof limit === "number"
            ? t("errors.quotaExceeded", { limit })
            : t("errors.quotaExceeded", { limit: 3 }),
        );
        return;
      }
      if (!res.ok) {
        setStepError(
          data.error === "generationFailed"
            ? t("wizard.generateStep.error")
            : t("wizard.errors.generateFailed"),
        );
        return;
      }
      if (data.quota) setQuota(data.quota as QuotaInfo);
      setDraft(data.draft as ReviewDraft);
      setCatalog(data.catalog as CatalogExercise[]);
      setSource(data.source as "AI" | "SIMULATED");
      setStep("review");
    } catch {
      setStepError(t("wizard.errors.generateFailed"));
    } finally {
      setBusy(false);
    }
  }

  // ---------------- Etapa: salvar ----------------

  async function finish() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setStepError(t("wizard.errors.profileInvalid"));
      return;
    }
    setSaving(true);
    setStepError(null);
    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteUserId: athlete.id,
          title: draft.title.trim(),
          source,
          locale,
          days: draft.days,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStepError(t("wizard.errors.saveFailed"));
        return;
      }
      router.push(`/workouts/${data.id}`);
      router.refresh();
    } catch {
      setStepError(t("wizard.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // ---------------- Stepper ----------------

  const steps: Array<{ key: Step; label: string }> = [
    ...(isProfessor
      ? [{ key: "athlete" as Step, label: t("wizard.steps.athlete") }]
      : []),
    { key: "profile", label: t("wizard.steps.profile") },
    { key: "generate", label: t("wizard.steps.generate") },
    { key: "review", label: t("wizard.steps.review") },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Stepper */}
      <ol className="mb-6 flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                i === currentIdx
                  ? "bg-indigo-600 text-white"
                  : i < currentIdx
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-zinc-100 text-zinc-500"
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
                  i === currentIdx
                    ? "bg-indigo-500 text-white"
                    : i < currentIdx
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-300 text-zinc-600"
                }`}
              >
                {i < currentIdx ? "✓" : i + 1}
              </span>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-zinc-300">→</span>}
          </li>
        ))}
      </ol>

      <Card>
        {/* ---------------- Atleta ---------------- */}
        {step === "athlete" && (
          <AthleteStep
            me={me}
            students={students}
            selected={athlete}
            onSelect={(a) => setAthlete(a)}
            onContinue={() => continueFromAthlete()}
          />
        )}

        {/* ---------------- Perfil ---------------- */}
        {step === "profile" && (
          <div>
            <div className="mb-4">
              <CardTitle>{t("wizard.profileStep.title")}</CardTitle>
              <p className="mt-1 text-sm text-zinc-500">
                {t("wizard.profileStep.hint")}
              </p>
              <p className="mt-2">
                <Badge tone="info">{athlete.name}</Badge>
              </p>
            </div>

            {loadingProfile ? (
              <div className="flex items-center gap-2 py-10 text-sm text-zinc-600">
                <Spinner /> {t("common.loading")}
              </div>
            ) : (
              <ProfileForm
                value={profile}
                onChange={(next) => {
                  setProfile(next);
                  setStepError(null);
                }}
                error={stepError}
              />
            )}

            <div className="mt-6 flex items-center justify-between border-t border-zinc-200 pt-4">
              {isProfessor ? (
                <Button variant="outline" onClick={() => setStep("athlete")}>
                  {t("common.back")}
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={saveProfileAndContinue} loading={busy}>
                {t("common.continue")} →
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- Gerar ---------------- */}
        {step === "generate" && (
          <div>
            <CardTitle>{t("wizard.generateStep.title")}</CardTitle>
            <p className="mt-1 text-sm text-zinc-500">
              {t("wizard.generateStep.intro")}
            </p>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryItem label={t("wizard.generateStep.summaryAthlete")}>
                {athlete.name}
              </SummaryItem>
              <SummaryItem label={t("wizard.generateStep.summaryGoal")}>
                {t(`goals.${profile.goal}`)}
                {profile.goalNotes ? ` — ${profile.goalNotes}` : ""}
              </SummaryItem>
              <SummaryItem label={t("wizard.generateStep.summaryDays")}>
                {profile.daysPerWeek} · {profile.sessionMinutes}{" "}
                {t("profile.minutes")}
              </SummaryItem>
              <SummaryItem label={t("wizard.generateStep.summaryExperience")}>
                {t(`experience.${profile.experience}`)}
              </SummaryItem>
              <SummaryItem label={t("wizard.generateStep.summaryLimitations")}>
                {profile.limitations.length === 0
                  ? t("common.none")
                  : profile.limitations.map((l) => t(`limitations.${l}`)).join(", ")}
                {profile.limitationNotes
                  ? ` — ${profile.limitationNotes}`
                  : ""}
              </SummaryItem>
              <SummaryItem label={t("wizard.generateStep.summaryEquipment")}>
                {profile.equipment.map((e) => t(`equipment.${e}`)).join(", ")}
              </SummaryItem>
            </dl>

            {quota && quota.plan === "FREE" && (
              <p
                className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                  quota.remaining === 0
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600"
                }`}
                data-testid="quota-remaining"
              >
                {quota.remaining === 0
                  ? t("billing.quotaOut")
                  : t("billing.quotaNotice", {
                      remaining: quota.remaining,
                      limit: quota.limit,
                    })}
              </p>
            )}

            {stepError && (
              <Alert className="mt-4">
                {stepError}{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => generate()}
                >
                  {t("common.retry")}
                </button>
              </Alert>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-zinc-200 pt-4">
              <Button variant="outline" onClick={() => setStep("profile")}>
                {t("common.back")}
              </Button>
              <Button
                onClick={generate}
                loading={busy}
                disabled={!!quota && quota.remaining === 0}
                data-testid="generate-btn"
              >
                {busy
                  ? t("wizard.generateStep.generating")
                  : t("wizard.generateStep.button")}
              </Button>
            </div>
            {busy && (
              <p className="mt-3 text-center text-xs text-zinc-500">
                {t("wizard.generateStep.generatingHint")}
              </p>
            )}
          </div>
        )}

        {/* ---------------- Revisão ---------------- */}
        {step === "review" && draft && (
          <div>
            {source === "SIMULATED" && (
              <Alert tone="info" className="mb-4">
                {t("wizard.generateStep.simulatedNotice")}
              </Alert>
            )}
            <ReviewStep
              draft={draft}
              onChange={(next) => {
                setDraft(next);
                setStepError(null);
              }}
              catalog={catalog}
              equipment={profile.equipment as Equipment[]}
              locale={locale}
              saving={saving}
              error={stepError}
              onBack={() => setStep("generate")}
              onGenerateAgain={() => setStep("generate")}
              onFinish={finish}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-zinc-800">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Etapa 1: escolha do atleta
// ---------------------------------------------------------------------------

function AthleteStep({
  me,
  students,
  selected,
  onSelect,
  onContinue,
}: {
  me: WizardProps["me"];
  students: WizardProps["students"];
  selected: { id: string; name: string };
  onSelect: (a: { id: string; name: string }) => void;
  onContinue: (next?: { id: string; name: string }) => void;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [students, query]);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "emailTaken"
            ? t("dashboard.newStudentDialog.emailTaken")
            : t("common.errorGeneric"),
        );
        return;
      }
      setShowAdd(false);
      setName("");
      setEmail("");
      setPassword("");
      onContinue({ id: data.student.id, name: data.student.name });
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <CardTitle>{t("wizard.athleteStep.title")}</CardTitle>

      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onSelect({ id: me.id, name: me.name })}
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
            selected.id === me.id
              ? "border-indigo-500 bg-indigo-50"
              : "border-zinc-300 hover:bg-zinc-50"
          }`}
        >
          <span>
            <span className="block font-medium text-zinc-900">
              {t("wizard.athleteStep.me")}
            </span>
            <span className="block text-sm text-zinc-500">{me.name}</span>
          </span>
          <Badge tone="outline">{t(`roles.${me.role}`)}</Badge>
        </button>

        <div>
          <Input
            type="search"
            placeholder={t("wizard.athleteStep.searchStudents")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-1 py-2 text-sm text-zinc-500">
                {t("wizard.athleteStep.noStudents")}
              </li>
            )}
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ id: s.id, name: s.name })}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected.id === s.id
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <span>
                    <span className="block font-medium text-zinc-900">
                      {s.name}
                    </span>
                    <span className="block text-sm text-zinc-500">{s.email}</span>
                  </span>
                  <Badge tone="info">{t("roles.ALUNO")}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {error && <Alert>{error}</Alert>}

        {showAdd ? (
          <form
            onSubmit={addStudent}
            className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-3"
          >
            <Field label={t("wizard.athleteStep.newStudentName")} required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </Field>
            <Field label={t("wizard.athleteStep.newStudentEmail")} required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label={t("wizard.athleteStep.newStudentPassword")} required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </Field>
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" loading={busy} size="sm">
                {t("wizard.athleteStep.createStudent")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdd(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:border-indigo-400 hover:text-indigo-600"
          >
            + {t("wizard.athleteStep.newStudent")}
          </button>
        )}
      </div>

      <div className="mt-6 flex justify-end border-t border-zinc-200 pt-4">
        <Button onClick={() => onContinue()}>{t("common.continue")} →</Button>
      </div>
    </div>
  );
}
