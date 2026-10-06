// Zera o estado volátil das suítes de teste no Postgres:
//   - RateLimit    (senhas erradas/rajadas de requisições das execuções anteriores)
//   - UsageRecord  (cota mensal de 3 gerações do professor demo)
// Sem isso, 1ª execução passa e a seguinte cai em 402/429.
//
//   node scripts/test-reset.mjs          (usado por test:e2e e pelo globalSetup do Playwright)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function env(name) {
  const file = readFileSync(new URL("../.env", import.meta.url), "utf8");
  return (file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

/** Zera RateLimit + UsageRecord. Retorna { rateLimit, usageRecord } (linhas apagadas). */
export async function resetTestState(connectionString = process.env.DATABASE_URL || env("DATABASE_URL")) {
  const { Client } = require("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const rate = await client.query('DELETE FROM "RateLimit"');
    const usage = await client.query('DELETE FROM "UsageRecord"');
    return { rateLimit: rate.rowCount, usageRecord: usage.rowCount };
  } finally {
    await client.end();
  }
}

/**
 * Preenche a cota do mês corrente do usuário com `count` gerações COMPLETED
 * direto no banco — testa o bloqueio 402 sem pagar chamadas de IA.
 */
export async function fillQuota(
  email,
  count,
  connectionString = process.env.DATABASE_URL || env("DATABASE_URL"),
) {
  const { Client } = require("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const user = await client.query(
      'SELECT id FROM "User" WHERE email = $1',
      [email],
    );
    if (!user.rows[0]) throw new Error(`usuário ${email} não existe`);
    const now = new Date();
    // O Prisma grava `timestamp without time zone` em UTC "cru"; o driver pg
    // converteria um Date JS para o fuso local (ex.: 2026-09-30 21:00 em
    // UTC-3) e a aplicação não contaria as linhas. Passa a string UTC.
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01 00:00:00`;
    await client.query(
      `INSERT INTO "UsageRecord" ("id", "userId", "status", "periodStart", "createdAt", "completedAt", "source")
       SELECT gen_random_uuid()::text, $1, 'COMPLETED', $2::timestamp, now() - make_interval(mins => n), now(), 'AI'
       FROM generate_series(1, $3) AS n`,
      [user.rows[0].id, period, count],
    );
    return count;
  } finally {
    await client.end();
  }
}
