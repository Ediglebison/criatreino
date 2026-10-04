import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const PROF = { email: "prof@criatreino.dev", password: "demo12345" };

async function login(page: Page, email = PROF.email) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PROF.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Preenche o formulário de avaliação e avança para a etapa de geração. */
async function fillProfileAndContinue(page: Page) {
  await expect(page.getByText("Perfil e questionário")).toBeVisible();
  // Espera o perfil carregar (o form é substituído por um spinner durante o fetch)
  await expect(page.locator("#height")).toBeVisible();

  await page.locator("#height").fill("178");
  await page.locator("#weight").fill("82");
  await page.locator("#goal").selectOption("MUSCLE_GAIN");

  // Limitação: joelhos (idempotente — o perfil salvo pode já tê-la)
  const knee = page.getByRole("button", { name: "Joelhos", exact: true });
  if ((await knee.getAttribute("aria-pressed")) !== "true") await knee.click();
  await expect(knee).toHaveAttribute("aria-pressed", "true");

  // Disponibilidade: 4 dias/semana + equipamento extra
  const fourDays = page.getByRole("button", { name: "4", exact: true });
  if ((await fourDays.getAttribute("aria-pressed")) !== "true") await fourDays.click();
  await expect(fourDays).toHaveAttribute("aria-pressed", "true");
  const barbell = page.getByRole("checkbox", { name: "Barra" });
  if (!(await barbell.isChecked())) await barbell.check();
  await expect(barbell).toBeChecked();
  await page.getByRole("radio", { name: "Intermediário" }).check();

  await page.getByRole("button", { name: /^Continuar/ }).click();
  await expect(page.getByText("Gerar sugestão com IA")).toBeVisible();
}

/** Gera o treino (modo simulado) e espera a etapa de revisão. */
async function generateAndReachReview(page: Page) {
  await page.getByRole("button", { name: "Gerar treino com IA" }).click();
  await expect(
    page.getByRole("heading", { name: "Revise antes de finalizar" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Modo simulado/)).toBeVisible();
}

/** Finaliza e devolve o id do treino salvo. */
async function finish(page: Page, title: string): Promise<string> {
  await page.locator("#workout-title").fill(title);
  await page.getByRole("button", { name: "Finalizar e salvar" }).click();
  await page.waitForURL(/\/workouts\/[a-z0-9]{15,}$/);
  return page.url().split("/").pop()!;
}

test.describe("Wizard de treino", () => {
  test("gera, revisa, substitui, remove e salva o treino", async ({ page }) => {
    await login(page);

    // ---- Etapa 1: atleta (padrão = professor, "Para mim") ----
    await page.goto("/workouts/new");
    await expect(page.getByText("Para quem é este treino?")).toBeVisible();
    await page.getByRole("button", { name: /^Continuar/ }).click();

    // ---- Etapa 2: perfil + questionário ----
    await fillProfileAndContinue(page);

    // ---- Etapa 3: geração ----
    await generateAndReachReview(page);

    // ---- Etapa 4: revisão ----
    const progress = page.getByText(/\d+ de \d+ revisados/);
    await expect(progress).toHaveText(/^0 de \d+ revisados/);

    // Checklist: marca o primeiro exercício como "não posso manter"
    const cannotKeep = page.getByLabel("Não posso manutar").first();
    await cannotKeep.check();
    await expect(progress).toHaveText(/^1 de \d+ revisados/);
    await expect(page.getByText(/Não posso manutar —/)).toBeVisible();

    // Substituição: abre o painel e aplica a primeira alternativa
    await page
      .getByRole("button", { name: "Substituir", exact: true })
      .first()
      .click();
    const panel = page.getByTestId("replace-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Escolha uma alternativa")).toBeVisible();
    // Espera o carregamento das alternativas antes de clicar
    await page
      .getByTestId("alternatives")
      .getByRole("button", { name: "Substituir", exact: true })
      .first()
      .click();
    await expect(page.getByText("Substituído").first()).toBeVisible();

    // Remoção + desfazer
    await page.getByRole("button", { name: "Remover", exact: true }).first().click();
    await expect(page.getByText("Removido da sessão").first()).toBeVisible();
    await page.getByRole("button", { name: "Desfazer", exact: true }).first().click();
    await expect(page.getByText("Removido da sessão")).toHaveCount(0);

    // ---- Finalização ----
    const title = "E2E — Treino do wizard";
    await finish(page, title);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // ---- Exportação: PDF ----
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /Exportar PDF/ }).click(),
    ]);
    const pdfPath = await download.path();
    const head = readFileSync(pdfPath!).subarray(0, 4).toString();
    expect(head).toBe("%PDF");

    // ---- Exportação: enviar para aluno ----
    await page.getByRole("button", { name: "Enviar para aluno" }).click();
    await expect(page.getByText("Enviar treino para um aluno")).toBeVisible();
    await page
      .locator("select")
      .first()
      .selectOption({ label: "Aluno Demo — aluno@criatreino.dev" });
    await page.locator("textarea").first().fill("Válido a partir de segunda.");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText("Treino enviado para Aluno Demo.")).toBeVisible();

    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByText(/Enviar para aluno: Aluno Demo/)).toBeVisible();
  });

  test("treino do próprio aluno não pode ser reenviado a ele", async ({ page }) => {
    await login(page);

    await page.goto("/workouts/new");
    await page.getByRole("button", { name: /Aluno Demo/ }).click();
    await page.getByRole("button", { name: /^Continuar/ }).click();

    await fillProfileAndContinue(page);
    await generateAndReachReview(page);

    const id = await finish(page, "E2E — Treino do aluno");

    await page.getByRole("button", { name: "Enviar para aluno" }).click();
    await page
      .locator("select")
      .first()
      .selectOption({ label: "Aluno Demo — aluno@criatreino.dev" });
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(
      page.getByText("Este treino já pertence a este aluno."),
    ).toBeVisible();

    // O aluno já é dono: o treino aparece na conta dele
    const res = await page.request.get(`/api/workouts/${id}`);
    expect(res.status()).toBe(200);
  });
});

test.describe("Navegação e i18n", () => {
  test("rota protegida redireciona para o login preservando o destino", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login\?next=/);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });

  test("404 é localizado em pt-BR e em en-US", async ({ page }) => {
    const pt = await page.goto("/pagina-inexistente");
    expect(pt?.status()).toBe(404);
    await expect(page.getByText("Página não encontrada")).toBeVisible();
    await expect(page.getByText("Voltar ao início")).toBeVisible();

    const en = await page.goto("/en-US/does-not-exist");
    expect(en?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("troca de idioma leva à versão em inglês", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await page.getByRole("link", { name: "EN", exact: true }).click();
    await page.waitForURL(/\/en-US/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  });
});
