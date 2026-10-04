import OpenAI from "openai";
import { getStaticMessages } from "@/lib/i18n-static";
import {
  workoutDraftSchema,
  type AthleteProfileInput,
  type CatalogExercise,
  type Locale,
  type WorkoutDraft,
} from "@/lib/types";
import { GenerationError } from "./error";

// ---------------------------------------------------------------------------
// JSON Schema (strict mode) para structured outputs
// ---------------------------------------------------------------------------

const exerciseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "sets", "reps", "restSeconds", "tempo", "notes"],
  properties: {
    slug: { type: "string" },
    sets: { type: "integer", minimum: 1, maximum: 8 },
    reps: { type: "string" },
    restSeconds: { type: "integer", minimum: 0, maximum: 600 },
    tempo: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
  },
} as const;

const daySchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "focus", "exercises"],
  properties: {
    label: { type: "string" },
    focus: { type: "string" },
    exercises: { type: "array", minItems: 1, items: exerciseSchema },
  },
} as const;

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "days"],
  properties: {
    title: { type: "string" },
    days: { type: "array", minItems: 1, items: daySchema },
  },
} as const;

// ---------------------------------------------------------------------------
// Montagem do prompt
// ---------------------------------------------------------------------------

function ageFromBirthDate(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const diff = Date.now() - birth.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age >= 5 && age <= 120 ? age : null;
}

function buildAthleteBlock(
  profile: AthleteProfileInput,
  athleteName: string,
  locale: Locale,
) {
  const m = getStaticMessages(locale);
  const label = <T extends string>(map: Record<string, string>, key: T) =>
    map[key] ?? key;

  return {
    name: athleteName,
    age: ageFromBirthDate(profile.birthDate),
    sex: label(m.sex, profile.sex),
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    bodyFatPct: profile.bodyFatPct,
    circumferencesCm: profile.measurements,
    goal: `${profile.goal} (${label(m.goals, profile.goal)})`,
    goalNotes: profile.goalNotes || null,
    limitations: profile.limitations.map((l) => label(m.limitations, l)),
    limitationNotes: profile.limitationNotes || null,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    experience: `${profile.experience} (${label(m.experience, profile.experience)})`,
    availableEquipment: profile.equipment.map((e) => label(m.equipment, e)),
    observations: profile.observations || null,
  };
}

function buildCatalogBlock(catalog: CatalogExercise[], locale: Locale): string[] {
  const m = getStaticMessages(locale);
  return catalog.map((ex) => {
    const group = m.muscleGroups[ex.muscleGroup];
    const eq = m.equipment[ex.equipment];
    const warning =
      locale === "en-US" ? ex.warningEn : ex.warningPt;
    return `${ex.slug} | ${locale === "en-US" ? ex.nameEn : ex.namePt} | ${group} | ${eq}${warning ? ` | ${locale === "en-US" ? "CAUTION" : "CUIDADO"}: ${warning}` : ""}`;
  });
}

function buildSystemPrompt(locale: Locale): string {
  const lang = locale === "en-US" ? "English" : "Brazilian Portuguese";
  return `You are an expert strength and conditioning coach creating a personalized workout plan.

Rules:
- Respond ONLY with the JSON structure provided (structured output).
- Create EXACTLY "daysPerWeek" training days.
- Each day must have between 4 and 8 exercises (respect sessionMinutes: ~9 minutes per exercise).
- ONLY use slugs from the provided exercise catalog — never invent slugs.
- Only use exercises compatible with the available equipment (the catalog is already filtered).
- NEVER assign an exercise whose CAUTION/CUIDADO conflicts with a declared limitation.
- Order exercises: compound/multi-joint first, isolation last.
- Avoid repeating the same exercise on the same day; vary exercises across days when possible.
- sets/reps/rest must match the goal and experience:
  - FAT_LOSS: 3 sets x 12-15 reps, 45s rest, include machines/circuits sparingly.
  - MUSCLE_GAIN: 3-4 sets x 8-12 reps, 60-90s rest.
  - STRENGTH: 4 sets x 4-6 reps, 120-180s rest, compound lifts first.
  - ENDURANCE: 3 sets x 15-20 reps, 30-45s rest, may include 1 cardio finisher per day.
  - HEALTH / MOBILITY: 3 sets x 10-15 reps, 45-60s rest, low-risk exercises.
  - SPORT_SPECIFIC: 3-4 sets x 6-10 reps, 90-120s rest.
  - BEGINNER: 3 sets, simple movements. ADVANCED: up to 4 sets.
- Write "title", "label" and "focus" in ${lang}. Day labels look like "${locale === "en-US" ? "Day 1 — Chest, Shoulders, Triceps" : "Dia 1 — Peito, Ombros, Tríceps"}".
- "notes" only when a useful coaching cue exists (otherwise null); "tempo" usually null.
- Last exercise of a day may drop one set.`;
}

// ---------------------------------------------------------------------------
// Chamada à OpenAI + validação/repair
// ---------------------------------------------------------------------------

export type AIGenerateParams = {
  profile: AthleteProfileInput;
  athleteName: string;
  locale: Locale;
  catalog: CatalogExercise[];
};

export async function generateWithAI(
  params: AIGenerateParams,
): Promise<WorkoutDraft> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new GenerationError("OPENAI_API_KEY não configurado");
  }

  const { profile, athleteName, locale, catalog } = params;

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const system = buildSystemPrompt(locale);
  const user = [
    `ATHLETE PROFILE:\n${JSON.stringify(buildAthleteBlock(profile, athleteName, locale), null, 2)}`,
    `EXERCISE CATALOG (slug | name | muscle group | equipment${locale === "en-US" ? " | caution" : " | cuidado"}):\n${buildCatalogBlock(catalog, locale).join("\n")}`,
  ].join("\n\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const completion = await client.chat.completions.create(
    {
      model,
      temperature: 0.4,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "workout_plan",
          strict: true,
          schema: planSchema,
        },
      },
    },
    { timeout: 60_000, maxRetries: 1 },
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new GenerationError("Resposta vazia do modelo");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new GenerationError("Resposta inválida do modelo (JSON)");
  }

  const parsed = workoutDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GenerationError("Estrutura de treino inválida do modelo");
  }

  const repaired = repairDraft(parsed.data, catalog, profile, locale);

  // Dia a menos que o solicitado → uma retentativa com correção explícita
  if (repaired.days.length < profile.daysPerWeek) {
    const corrected = await retryWithCorrection(
      client,
      model,
      messages,
      `You returned ${repaired.days.length} days but the athlete trains ${profile.daysPerWeek} days per week. Return the full plan with exactly ${profile.daysPerWeek} days.`,
    );
    if (corrected) {
      const second = repairDraft(corrected, catalog, profile, locale);
      if (second.days.length === profile.daysPerWeek) {
        return second;
      }
    }
  }

  return repaired;
}

async function retryWithCorrection(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  correction: string,
): Promise<WorkoutDraft | null> {
  try {
    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.2,
        messages: [...messages, { role: "user", content: correction }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "workout_plan",
            strict: true,
            schema: planSchema,
          },
        },
      },
      { timeout: 60_000, maxRetries: 1 },
    );
    const content = completion.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = workoutDraftSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Normaliza o plano vindo da IA:
 * - remove slugs desconhecidos/duplicados
 * - limita a daysPerWeek dias e 8 exercícios por dia
 * - garante título
 */
export function repairDraft(
  draft: WorkoutDraft,
  catalog: CatalogExercise[],
  profile: AthleteProfileInput,
  locale: Locale,
): WorkoutDraft {
  const bySlug = new Map(catalog.map((e) => [e.slug, e]));

  const days = draft.days
    .slice(0, profile.daysPerWeek)
    .map((day) => {
      const seen = new Set<string>();
      const exercises = day.exercises
        .filter((ex) => {
          if (!bySlug.has(ex.slug) || seen.has(ex.slug)) return false;
          seen.add(ex.slug);
          return true;
        })
        .slice(0, 8)
        .map((ex) => ({
          ...ex,
          sets: Math.min(8, Math.max(1, ex.sets)),
          restSeconds: Math.min(600, Math.max(0, ex.restSeconds ?? 60)),
        }));
      return { ...day, exercises };
    })
    .filter((d) => d.exercises.length > 0);

  if (days.length === 0) {
    throw new GenerationError("Modelo retornou um treino vazio");
  }

  const title = draft.title.trim().slice(0, 120);
  return {
    title: title || (locale === "en-US" ? "Workout plan" : "Plano de treino"),
    days,
  };
}
