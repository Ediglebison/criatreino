/**
 * Diagnóstico: chama `generateWithAI` fora do Next para expor o erro real.
 * Uso: BASE_URL=http://192.168.1.10:3000 npx tsx scripts/probe-ai.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AthleteProfileInput, CatalogExercise } from "../src/lib/types";
import { generateWithAI } from "../src/lib/workout/ai";

async function main() {
  // Carrega .env manualmente (mesmas regras básicas do Next: remove aspas)
  const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }

  console.log("model =", JSON.stringify(process.env.OPENAI_MODEL));
  console.log("key   =", (process.env.OPENAI_API_KEY ?? "").slice(0, 6) + "...");

  const BASE = process.env.BASE_URL || "http://192.168.1.10:3000";
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "prof@criatreino.dev", password: "demo12345" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").match(
    /ct_session=[^;]+/,
  )![0];
  const catalog: CatalogExercise[] = (
    await (await fetch(BASE + "/api/exercises", { headers: { cookie } })).json()
  ).exercises;

  const profile: AthleteProfileInput = {
    birthDate: "1995-04-12",
    sex: "MALE",
    heightCm: 178,
    weightKg: 82,
    measurements: {},
    goal: "MUSCLE_GAIN",
    goalNotes: "",
    limitations: ["KNEE"],
    limitationNotes: "",
    daysPerWeek: 3,
    sessionMinutes: 60,
    experience: "INTERMEDIATE",
    equipment: ["BARBELL", "DUMBBELL", "MACHINE"],
    observations: "",
  };

  const t0 = Date.now();
  try {
    const draft = await generateWithAI({
      profile,
      athleteName: "Aluno Demo",
      locale: "pt-BR",
      catalog,
    });
    const ex = draft.days.reduce((a, d) => a + d.exercises.length, 0);
    console.log(`OK em ${Date.now() - t0}ms → ${draft.days.length} dias, ${ex} exercícios`);
    console.log("título:", draft.title);
  } catch (error) {
    const err = error as Error & { status?: number; type?: string; error?: unknown };
    console.error(`FALHOU em ${Date.now() - t0}ms`);
    console.error("name:", err.name);
    console.error("status:", err.status, "| type:", err.type);
    console.error("message:", err.message);
    if (err.error) console.error("body:", JSON.stringify(err.error).slice(0, 600));
    console.error(err.stack?.split("\n").slice(0, 5).join("\n"));
    process.exitCode = 1;
  }
}

main();
