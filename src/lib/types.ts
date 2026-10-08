import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums espelhados do Prisma (para uso em forms/IA sem importar o client)
// ---------------------------------------------------------------------------

export const GOALS = [
  "FAT_LOSS",
  "MUSCLE_GAIN",
  "STRENGTH",
  "ENDURANCE",
  "HEALTH",
  "MOBILITY",
  "SPORT_SPECIFIC",
] as const;

export const SEXES = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"] as const;

export const EXPERIENCE_LEVELS = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
] as const;

export const MUSCLE_GROUPS = [
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

export const EQUIPMENT = [
  "BARBELL",
  "DUMBBELL",
  "MACHINE",
  "CABLE",
  "BODYWEIGHT",
  "KETTLEBELL",
  "BAND",
  "OTHER",
] as const;

export const LIMITATIONS = [
  "SHOULDER",
  "KNEE",
  "LOWER_BACK",
  "NECK",
  "WRIST",
  "ANKLE",
  "ELBOW",
  "HIP",
  "OTHER",
] as const;

export type Goal = (typeof GOALS)[number];
export type Sex = (typeof SEXES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type LimitationCode = (typeof LIMITATIONS)[number];
export type Role = "PROFESSOR" | "ALUNO" | "ADMIN";

// ---------------------------------------------------------------------------
// Perfil do atleta (payload do formulário de avaliação)
// ---------------------------------------------------------------------------

export const measurementsSchema = z.object({
  chest: z.number().min(0).max(300).nullable().optional(),
  waist: z.number().min(0).max(300).nullable().optional(),
  hips: z.number().min(0).max(300).nullable().optional(),
  armRight: z.number().min(0).max(300).nullable().optional(),
  armLeft: z.number().min(0).max(300).nullable().optional(),
  thighRight: z.number().min(0).max(400).nullable().optional(),
  thighLeft: z.number().min(0).max(400).nullable().optional(),
  calf: z.number().min(0).max(300).nullable().optional(),
});

export const athleteProfileSchema = z.object({
  birthDate: z.iso.date().nullable().optional(),
  sex: z.enum(SEXES),
  heightCm: z.number().min(50).max(260).nullable().optional(),
  weightKg: z.number().min(20).max(400).nullable().optional(),
  bodyFatPct: z.number().min(1).max(70).nullable().optional(),
  measurements: measurementsSchema,

  goal: z.enum(GOALS),
  goalNotes: z.string().max(1000).default(""),

  limitations: z.array(z.enum(LIMITATIONS)),
  limitationNotes: z.string().max(2000).default(""),

  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(240),
  experience: z.enum(EXPERIENCE_LEVELS),

  equipment: z.array(z.enum(EQUIPMENT)).min(1),
  observations: z.string().max(2000).default(""),
});

export type AthleteProfileInput = z.infer<typeof athleteProfileSchema>;
export type Measurements = z.infer<typeof measurementsSchema>;

// ---------------------------------------------------------------------------
// Treino (draft da IA e formato salvo)
// ---------------------------------------------------------------------------

export const draftExerciseSchema = z.object({
  slug: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1).max(30),
  restSeconds: z.number().int().min(0).max(600).nullable().optional(),
  tempo: z.string().max(20).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
  // Preenchido na revisão (checklist)
  replacedFromSlug: z.string().nullable().optional(),
  removed: z.boolean().optional(),
});

export const draftDaySchema = z.object({
  label: z.string().min(1).max(120),
  focus: z.string().max(200).nullable().optional(),
  exercises: z.array(draftExerciseSchema).min(1).max(15),
});

export const workoutDraftSchema = z.object({
  title: z.string().min(1).max(120),
  days: z.array(draftDaySchema).min(1).max(7),
});

export type DraftExercise = z.infer<typeof draftExerciseSchema>;
export type DraftDay = z.infer<typeof draftDaySchema>;
export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;

// ---------------------------------------------------------------------------
// Item do catálogo de exercícios (retornado pela API para a UI)
// ---------------------------------------------------------------------------

export type CatalogExercise = {
  id: string;
  slug: string;
  namePt: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  warningPt: string | null;
  warningEn: string | null;
};

// ---------------------------------------------------------------------------
// Sessão (payload do JWT no cookie)
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  professorId: string | null;
  /** Versão das sessões no JWT (bump derruba cookies antigos). */
  sessionVersion?: number;
};

// ---------------------------------------------------------------------------
// Helpers de i18n simples usados fora do React (PDF, API)
// ---------------------------------------------------------------------------

export type Locale = "pt-BR" | "en-US";

export function exerciseName(
  ex: { namePt: string; nameEn: string },
  locale: string,
): string {
  return locale === "en-US" ? ex.nameEn : ex.namePt;
}

export function exerciseWarning(
  ex: { warningPt: string | null; warningEn: string | null },
  locale: string,
): string | null {
  return locale === "en-US" ? ex.warningEn : ex.warningPt;
}
