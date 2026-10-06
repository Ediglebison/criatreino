/**
 * Validação de variáveis de ambiente no boot do servidor.
 *
 * Sem isso, um deploy mal configurado só falha na primeira requisição
 * (AUTH_SECRET lança no primeiro login, DATABASE_URL só falha na primeira
 * query — o pg conecta de forma preguiçosa). Aqui o deploy quebrado fica
 * evidente no log de inicialização.
 */

type EnvCheck = {
  name: string;
  required: boolean;
  hint: string;
};

const CHECKS: EnvCheck[] = [
  {
    name: "AUTH_SECRET",
    required: true,
    hint: "crie um segredo forte: openssl rand -base64 48",
  },
  {
    name: "DATABASE_URL",
    required: true,
    hint: "ex.: postgresql://user:pass@host:5432/db?sslmode=require",
  },
  {
    name: "OPENAI_API_KEY",
    required: false,
    hint: "ausente → geração SIMULADA (fallback local)",
  },
  {
    name: "STRIPE_SECRET_KEY",
    required: false,
    hint: "ausente → upgrade desativado (503 billingDisabled)",
  },
];

export function validateEnv(): void {
  const problems: string[] = [];

  for (const check of CHECKS) {
    const raw = process.env[check.name];
    const present = Boolean(raw && raw.trim());
    if (check.required && !present) {
      problems.push(`  - ${check.name} ausente (${check.hint})`);
    }
  }

  // AUTH_SECRET fraco em produção é tão ruim quanto ausente.
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length < 32) {
    problems.push(
      `  - AUTH_SECRET com apenas ${secret.length} caracteres (mínimo 32)`,
    );
  }

  // sslmode ausente em host que não é localhost → conexão em claro recusada
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && !/localhost|127\.0\.0\.1/.test(dbUrl) && !dbUrl.includes("sslmode=")) {
    console.warn(
      "[env] DATABASE_URL sem sslmode — provedores gerenciados (Neon, Supabase, RDS) exigem sslmode=require",
    );
  }

  if (problems.length > 0) {
    const banner = [
      "",
      "╔════════════════════════════════════════════════════════════╗",
      "║  AMBIENTE INCOMPLETO — o app não vai funcionar corretamente ║",
      "╚════════════════════════════════════════════════════════════╝",
      ...problems,
      "",
    ].join("\n");
    console.error(banner);
    // Não derruba o processo (o health check e os logs já denunciam),
    // mas em produção o erro deve ser impossível de ignorar.
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Env vars obrigatórias ausentes: ${problems.length}`);
    }
  }
}
