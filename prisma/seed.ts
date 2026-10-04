import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { exercises } from "./seed-data/exercises";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedExercises() {
  let updated = 0;
  let created = 0;
  for (const ex of exercises) {
    const data = {
      namePt: ex.namePt,
      nameEn: ex.nameEn,
      muscleGroup: ex.muscleGroup,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment,
      warningPt: ex.warningPt ?? null,
      warningEn: ex.warningEn ?? null,
    };
    const existing = await prisma.exercise.findUnique({
      where: { slug: ex.slug },
      select: { id: true },
    });
    if (existing) {
      await prisma.exercise.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.exercise.create({ data: { slug: ex.slug, ...data } });
      created++;
    }
  }
  console.log(`Exercícios: ${created} criados, ${updated} atualizados`);
}

async function seedUsers() {
  const password = await hash("demo12345", 10);

  const professor = await prisma.user.upsert({
    where: { email: "prof@criatreino.dev" },
    update: {},
    create: {
      email: "prof@criatreino.dev",
      name: "Prof. Demo",
      passwordHash: password,
      role: "PROFESSOR",
      locale: "pt-BR",
    },
  });

  const aluno1 = await prisma.user.upsert({
    where: { email: "aluno@criatreino.dev" },
    update: { professorId: professor.id },
    create: {
      email: "aluno@criatreino.dev",
      name: "Aluno Demo",
      passwordHash: password,
      role: "ALUNO",
      locale: "pt-BR",
      professorId: professor.id,
    },
  });

  const aluno2 = await prisma.user.upsert({
    where: { email: "maria@criatreino.dev" },
    update: { professorId: professor.id },
    create: {
      email: "maria@criatreino.dev",
      name: "Maria Silva",
      passwordHash: password,
      role: "ALUNO",
      locale: "pt-BR",
      professorId: professor.id,
    },
  });

  // Perfil de exemplo do próprio professor (para testar o wizard)
  await prisma.athleteProfile.upsert({
    where: { userId: professor.id },
    update: {},
    create: {
      userId: professor.id,
      birthDate: new Date("1990-05-12"),
      sex: "MALE",
      heightCm: 178,
      weightKg: 82,
      bodyFatPct: 18,
      measurements: {
        chest: 102,
        waist: 88,
        hips: 100,
        armRight: 36,
        armLeft: 35.5,
        thighRight: 58,
        thighLeft: 57.5,
        calf: 39,
      },
      goal: "MUSCLE_GAIN",
      goalNotes: "Ganhar massa e melhorar condicionamento",
      limitations: ["SHOULDER"],
      limitationNotes: "Tendinite no ombro direito em tratamento",
      daysPerWeek: 4,
      sessionMinutes: 60,
      experience: "INTERMEDIATE",
      equipment: ["BARBELL", "DUMBBELL", "MACHINE", "CABLE", "BODYWEIGHT"],
      observations: "",
    },
  });

  console.log(
    `Usuários: ${professor.email}, ${aluno1.email}, ${aluno2.email} (senha demo12345)`,
  );
}

async function main() {
  console.log("Seed do CrIA Treino...");
  await seedExercises();
  await seedUsers();
  console.log("OK ✔");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
