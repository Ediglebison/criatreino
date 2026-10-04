import { generateWithAI } from "./ai";
import { GenerationError } from "./error";
import { simulateWorkout } from "./simulator";
import type {
  AthleteProfileInput,
  CatalogExercise,
  Locale,
  WorkoutDraft,
} from "@/lib/types";

export type GenerateWorkoutInput = {
  profile: AthleteProfileInput;
  athleteName: string;
  locale: Locale;
  catalog: CatalogExercise[];
};

export type GenerateWorkoutResult = {
  draft: WorkoutDraft;
  source: "AI" | "SIMULATED";
};

/**
 * Gera a sugestão de treino.
 * - Sem OPENAI_API_KEY → modo simulado (regras locais, determinísticas).
 * - Com chave → OpenAI structured outputs; erros viram GenerationError.
 */
export async function generateWorkout(
  input: GenerateWorkoutInput,
): Promise<GenerateWorkoutResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      draft: simulateWorkout({
        profile: input.profile,
        locale: input.locale,
        catalog: input.catalog,
        seed: input.athleteName,
      }),
      source: "SIMULATED",
    };
  }

  try {
    const draft = await generateWithAI(input);
    return { draft, source: "AI" };
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new GenerationError(`Falha na chamada da OpenAI: ${message}`);
  }
}
