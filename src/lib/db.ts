import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Singleton do Prisma Client (cada instância cria um pool de conexões)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Pool enxuto: na Vercel cada instância serverless tem o seu —
    // manter pequeno evita estourar o limite de conexões do Postgres
    // gerenciado (Neon/Supabase contam por instância).
    max: Number(process.env.PG_POOL_MAX ?? 5),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
