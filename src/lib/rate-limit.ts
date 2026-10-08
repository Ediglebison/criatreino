import { prisma } from "@/lib/db";

/**
 * Rate limiting com janela fixa persistida no Postgres.
 *
 * Por que banco e não memória: o deploy alvo é Vercel (serverless), onde
 * cada instância tem memória isolada — um Map local não limitaria nada.
 * O incremento é atômico (INSERT ... ON CONFLICT DO UPDATE SET count+1
 * ... RETURNING), então requisições paralelas não furam a janela.
 */

export type LimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
};

function windowOf(windowSeconds: number): { start: Date; end: Date } {
  const size = windowSeconds * 1000;
  const startMs = Math.floor(Date.now() / size) * size;
  return { start: new Date(startMs), end: new Date(startMs + size) };
}

/**
 * Consome 1 tentativa da chave. `max` por janela de `windowSeconds`.
 * Nunca lança erro: em falha de infra permite a ação (disponibilidade >
 * limitação estrita), mas loga para diagnóstico.
 */
export async function consume(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const { start, end } = windowOf(windowSeconds);
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${start}, 1, ${end})
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "RateLimit"."count" + 1
      RETURNING "count"
    `;
    const count = Number(rows[0]?.count ?? 1);
    return {
      allowed: count <= max,
      count,
      remaining: Math.max(0, max - count),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((end.getTime() - Date.now()) / 1000),
      ),
    };
  } catch (error) {
    console.error("[rate-limit] falha ao consumir tentativa", key, error);
    return {
      allowed: true,
      count: 0,
      remaining: max,
      retryAfterSeconds: 0,
    };
  }
}

/** Devolve a tentativa quando a ação foi legítima (ex.: login correto). */
export async function refund(key: string, windowSeconds: number): Promise<void> {
  const { start } = windowOf(windowSeconds);
  try {
    await prisma.$queryRaw`
      UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0)
      WHERE "key" = ${key} AND "windowStart" = ${start}
    `;
  } catch (error) {
    console.error("[rate-limit] falha ao estornar tentativa", key, error);
  }
}

/** Remove janelas expiradas (chamada com baixa frequência nas rotas quentes). */
export async function pruneExpired(): Promise<void> {
  try {
    // Parâmetro vem do JS (UTC), igual a expiresAt — NOW() usaria o fuso
    // do servidor e desalinhearia a janela em relação ao resto.
    const now = new Date();
    await prisma.$queryRaw`DELETE FROM "RateLimit" WHERE "expiresAt" < ${now}`;
  } catch {
    // melhor esforço
  }
}

/** IP do cliente considerando proxies (Vercel/Cloudflare). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    // Entrada da DIREITA: cada proxy da cadeia anexa o IP que viu, então o
    // último é o do salto mais próximo (o único que o proxy de confiança
    // controla). A primeira entrada é forjável pelo cliente e permitia
    // contornar o limite por IP.
    const parts = fwd.split(",");
    return parts[parts.length - 1]!.trim().slice(0, 64);
  }
  return request.headers.get("x-real-ip")?.slice(0, 64) || "unknown";
}

/** Resposta padrão 429 com cabeçalhos de retry. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: "rateLimited", retryAfter: retryAfterSeconds }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
}
