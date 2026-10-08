import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(resolve(process.cwd(), "package.json"));

const ALUNO = { email: "aluno@criatreino.dev", password: "demo12345" };

/** Tipos mínimos do pg/bcryptjs (require evita empacotar @types/* extras). */
type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Array<{ id: string }> }>;
};
const { Client } = require("pg") as {
  Client: new (cfg: { connectionString: string }) => PgClient;
};
const { hashSync } = require("bcryptjs") as {
  hashSync: (value: string, rounds: number) => string;
};

function connectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  return (file.match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

/** Insere um token de reset válido direto no banco (o valor em claro só existe aqui). */
async function insertResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const db = new Client({ connectionString: connectionString() });
  await db.connect();
  try {
    await db.query(
      'INSERT INTO "PasswordReset" (id, "userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4)',
      [randomBytes(12).toString("hex"), userId, tokenHash, expiresAt],
    );
  } finally {
    await db.end();
  }
  return token;
}

async function alunoId(): Promise<string> {
  const db = new Client({ connectionString: connectionString() });
  await db.connect();
  try {
    const res = await db.query('SELECT id FROM "User" WHERE email = $1', [ALUNO.email]);
    expect(res.rows[0]?.id, "aluno demo existe").toBeTruthy();
    return res.rows[0].id;
  } finally {
    await db.end();
  }
}

/** Restaura a senha do aluno e limpa tokens (sempre roda, mesmo em falha). */
async function restoreAluno() {
  const db = new Client({ connectionString: connectionString() });
  await db.connect();
  try {
    await db.query('UPDATE "User" SET "passwordHash" = $1 WHERE email = $2', [
      hashSync(ALUNO.password, 10),
      ALUNO.email,
    ]);
    await db.query('DELETE FROM "PasswordReset"');
  } finally {
    await db.end();
  }
}

test("login oferece recuperação e o pedido responde mensagem genérica", async ({
  page,
}) => {
  await page.goto("/login");
  const link = page.getByRole("link", { name: "Esqueceu a senha?" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/forgot-password/);

  await page.locator("#email").fill(ALUNO.email);
  await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
  // Mesmo aviso exista a conta ou não (anti-enumeração)
  await expect(page.getByText(/Se existir uma conta com este email/)).toBeVisible();
});

test("redefinição completa: nova senha loga e tela de sucesso aparece", async ({
  page,
}) => {
  const token = await insertResetToken(await alunoId());
  try {
    await page.goto(`/reset-password?token=${token}`);
    await page.locator("#password").fill("novasenha1234");
    await page.locator("#confirm").fill("novasenha1234");
    await page.getByRole("button", { name: "Redefinir senha" }).click();

    await expect(page).toHaveURL(/login\?reset=ok/);
    await expect(page.getByText(/Senha redefinida com sucesso/)).toBeVisible();

    await page.locator("#email").fill(ALUNO.email);
    await page.locator("#password").fill("novasenha1234");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/dashboard/);
  } finally {
    await restoreAluno();
  }
});

test("acesso direto ao reset sem token mostra o estado de link inválido", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(page.getByText("Link inválido ou expirado.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Enviar link de recuperação" }),
  ).toBeVisible();
});

/** Garante senha demo de volta caso uma falha interrompa o fluxo acima. */
test.afterAll(async () => {
  await restoreAluno();
});
