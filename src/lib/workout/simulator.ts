import { getStaticMessages } from "@/lib/i18n-static";
import type {
  AthleteProfileInput,
  CatalogExercise,
  DraftDay,
  DraftExercise,
  ExperienceLevel,
  Goal,
  LimitationCode,
  Locale,
  MuscleGroup,
  WorkoutDraft,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Palavras-chave de limitação → avisos dos exercícios a evitar
// ---------------------------------------------------------------------------

const LIMITATION_KEYWORDS: Record<LimitationCode, string[]> = {
  SHOULDER: ["shoulder", "ombro", "manguito"],
  KNEE: ["knee", "joelho"],
  LOWER_BACK: ["lower back", "lombar", "lumbar", "coluna", "lower-back"],
  NECK: ["neck", "pescoço", "pescoco"],
  WRIST: ["wrist", "punho"],
  ANKLE: ["ankle", "tornozelo"],
  ELBOW: ["elbow", "cotovelo"],
  HIP: ["hip", "quadril"],
  OTHER: [],
};

export function isBlockedByLimitation(
  ex: Pick<CatalogExercise, "warningPt" | "warningEn">,
  limitations: LimitationCode[],
): boolean {
  if (!ex.warningPt && !ex.warningEn) return false;
  const text = `${ex.warningPt ?? ""} ${ex.warningEn ?? ""}`.toLowerCase();
  return limitations.some((code) =>
    (LIMITATION_KEYWORDS[code] ?? []).some((kw) => text.includes(kw)),
  );
}

// ---------------------------------------------------------------------------
// Esquema de séries/reps/descanso por objetivo
// ---------------------------------------------------------------------------

type Scheme = { reps: string; restSeconds: number };

const SCHEMES: Record<Goal, Scheme> = {
  FAT_LOSS: { reps: "12-15", restSeconds: 45 },
  MUSCLE_GAIN: { reps: "8-12", restSeconds: 75 },
  STRENGTH: { reps: "4-6", restSeconds: 150 },
  ENDURANCE: { reps: "15-20", restSeconds: 40 },
  HEALTH: { reps: "12-15", restSeconds: 60 },
  MOBILITY: { reps: "10-12", restSeconds: 45 },
  SPORT_SPECIFIC: { reps: "6-10", restSeconds: 90 },
};

function setsFor(experience: ExperienceLevel): number {
  if (experience === "BEGINNER") return 3;
  if (experience === "ADVANCED") return 4;
  return 3;
}

// ---------------------------------------------------------------------------
// Divisões de treino por quantidade de dias
// ---------------------------------------------------------------------------

const FULL_BODY: MuscleGroup[] = [
  "LEGS",
  "CHEST",
  "BACK",
  "SHOULDERS",
  "BICEPS",
  "TRICEPS",
  "ABS",
];
const UPPER: MuscleGroup[] = ["CHEST", "BACK", "SHOULDERS", "BICEPS", "TRICEPS", "ABS"];
const LOWER: MuscleGroup[] = ["LEGS", "GLUTES", "ABS"];
const PUSH: MuscleGroup[] = ["CHEST", "SHOULDERS", "TRICEPS"];
const PULL: MuscleGroup[] = ["BACK", "BICEPS"];
const LEG_DAY: MuscleGroup[] = ["LEGS", "GLUTES", "ABS"];

const SPLITS: Record<number, MuscleGroup[][]> = {
  1: [FULL_BODY],
  2: [UPPER, LOWER],
  3: [PUSH, PULL, LEG_DAY],
  4: [UPPER, LOWER, UPPER, LOWER],
  5: [UPPER, LOWER, PUSH, PULL, LEG_DAY],
  6: [PUSH, PULL, LEG_DAY, PUSH, PULL, LEG_DAY],
  7: [PUSH, PULL, LEG_DAY, PUSH, PULL, LEG_DAY, FULL_BODY],
};

// Peso de cada grupo dentro de um dia (fatia de exercícios)
const GROUP_WEIGHT: Record<MuscleGroup, number> = {
  CHEST: 3,
  BACK: 3,
  LEGS: 3,
  SHOULDERS: 2,
  GLUTES: 2,
  BICEPS: 2,
  TRICEPS: 2,
  ABS: 2,
  CARDIO: 1,
};

// Ordem de prioridade dentro do dia (compounds primeiro)
const GROUP_ORDER: MuscleGroup[] = [
  "LEGS",
  "CHEST",
  "BACK",
  "GLUTES",
  "SHOULDERS",
  "BICEPS",
  "TRICEPS",
  "ABS",
  "CARDIO",
];

// ---------------------------------------------------------------------------
// RNG determinístico (variedade entre gerações sem aleatoriedade maluca)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Geração por regras (fallback sem OPENAI_API_KEY)
// ---------------------------------------------------------------------------

export type SimulateInput = {
  profile: AthleteProfileInput;
  locale: Locale;
  catalog: CatalogExercise[];
  /** seed opcional para variar entre gerações */
  seed?: string;
};

export function simulateWorkout(input: SimulateInput): WorkoutDraft {
  const { profile, catalog, locale } = input;
  const messages = getStaticMessages(locale);

  const rand = mulberry32(
    hashString(
      `${profile.goal}|${profile.daysPerWeek}|${profile.experience}|${input.seed ?? ""}|${Date.now()}`,
    ),
  );

  const allowed = catalog.filter(
    (e) => !isBlockedByLimitation(e, profile.limitations),
  );
  const scheme = SCHEMES[profile.goal];
  const baseSets = setsFor(profile.experience);

  const includeCardio =
    profile.goal === "ENDURANCE" ||
    profile.goal === "FAT_LOSS" ||
    profile.goal === "HEALTH";

  const split = SPLITS[profile.daysPerWeek] ?? SPLITS[3];

  // Total de exercícios por sessão a partir da duração (~9 min por exercício)
  const perSession = Math.min(8, Math.max(4, Math.round(profile.sessionMinutes / 9)));

  const dayWord = locale === "en-US" ? "Day" : "Dia";
  const days: DraftDay[] = [];

  for (let dayIndex = 0; dayIndex < split.length; dayIndex++) {
    const template = split[dayIndex];
    const activeGroups = template.filter((g) => g !== "CARDIO" || includeCardio);

    // Distribui a cota do dia entre os grupos
    const weights = activeGroups.map((g) => GROUP_WEIGHT[g]);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const allocation = weights.map((w) =>
      Math.max(1, Math.round((w / totalWeight) * perSession)),
    );
    let allocated = allocation.reduce((a, b) => a + b, 0);
    while (allocated > perSession) {
      let maxIdx = 0;
      for (let i = 1; i < allocation.length; i++) {
        if (allocation[i] > allocation[maxIdx]) maxIdx = i;
      }
      if (allocation[maxIdx] <= 1) break;
      allocation[maxIdx] -= 1;
      allocated -= 1;
    }
    while (allocated < perSession) {
      const idx = allocation.findIndex((n) => n < 4);
      if (idx === -1) break;
      allocation[idx] += 1;
      allocated += 1;
    }

    const exercises: DraftExercise[] = [];
    const used = new Set<string>();

    const orderedGroups = [...activeGroups].sort(
      (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
    );

    for (const group of orderedGroups) {
      const wanted = allocation[activeGroups.indexOf(group)] ?? 1;
      const options = shuffle(
        allowed.filter(
          (e) => e.muscleGroup === group && !used.has(e.slug),
        ),
        rand,
      ).slice(0, wanted);

      for (const ex of options) {
        used.add(ex.slug);
        exercises.push({
          slug: ex.slug,
          sets: baseSets,
          reps: scheme.reps,
          restSeconds: scheme.restSeconds,
          tempo: null,
          notes: null,
        });
      }
    }

    if (exercises.length === 0) continue;

    // Último exercício do dia: menos séries (isolamento/core)
    const last = exercises[exercises.length - 1];
    last.sets = Math.max(2, baseSets - 1);

    const focusNames = activeGroups.map(
      (g) => messages.muscleGroups[g as keyof typeof messages.muscleGroups],
    );

    days.push({
      label: `${dayWord} ${dayIndex + 1} — ${focusNames.join(", ")}`,
      focus: focusNames.join(", "),
      exercises,
    });
  }

  const goalLabel = messages.goals[profile.goal as keyof typeof messages.goals];
  const title =
    locale === "en-US"
      ? `${goalLabel} — ${profile.daysPerWeek}x/week`
      : `${goalLabel} — ${profile.daysPerWeek}x/semana`;

  return { title, days };
}
