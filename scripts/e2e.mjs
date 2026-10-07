// Smoke test E2E do CrIA Treino (roda contra um dev server já iniciado):
//   npm run test:e2e            → http://localhost:3000
//   BASE=http://IP:3000 npm run test:e2e
// Cobre: login → alunos → geração → revisão (remover/substituir) → salvar →
// atribuição → PDF → permissões → páginas SSR → i18n.
import { readFileSync } from "node:fs";
import { resetTestState, fillQuota } from "./test-reset.mjs";

const BASE = process.env.BASE || "http://localhost:3000";

// Fonte esperada da geração depende do .env: chave → OpenAI, sem chave → simulado
function expectedSource() {
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const key = (env.match(/^OPENAI_API_KEY=(.*)$/m)?.[1] ?? "")
      .replace(/^["']|["']$/g, "")
      .trim();
    return key ? "AI" : "SIMULATED";
  } catch {
    return "SIMULATED";
  }
}
const EXPECTED_SOURCE = expectedSource();

// Stripe configurado? (chave secreta + ao menos um preço de plano no .env)
function stripeConfigured() {
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const get = (name) =>
      (env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "")
        .replace(/^["']|["']$/g, "")
        .trim();
    const hasKey = Boolean(get("STRIPE_SECRET_KEY"));
    const prices = ["BASIC", "PRO", "ULTIMATE"].filter((p) =>
      Boolean(get(`STRIPE_PRICE_ID_${p}`)),
    );
    return { enabled: hasKey && prices.length > 0, prices };
  } catch {
    return { enabled: false, prices: [] };
  }
}
const STRIPE = stripeConfigured();

const log = (s) => console.log(s);
let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) log(`  ✔ ${name}`);
  else { failures++; log(`  ✘ ${name} ${detail}`); }
};

async function req(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const ct = res.headers.get("content-type") || "";
  let data = null;
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  else if (ct.includes("pdf")) data = Buffer.from(await res.arrayBuffer());
  else data = await res.text();
  return { status: res.status, data, setCookie, ct, headers: res.headers };
}

function sessionCookie(setCookie, prev = "") {
  const m = setCookie.match(/ct_session=[^;]+/);
  if (m) return m[0];
  const prevM = prev.match(/ct_session=[^;]+/);
  return prevM ? prevM[0] : "";
}

const profile = {
  birthDate: "1995-04-12",
  sex: "MALE",
  heightCm: 178,
  weightKg: 82,
  bodyFatPct: 18,
  measurements: { chest: 100, waist: 88, armRight: 36, thighRight: 58 },
  goal: "MUSCLE_GAIN",
  goalNotes: "Foco em hipertrofia, priorizar peito e costas.",
  limitations: ["KNEE"],
  limitationNotes: "Dor no joelho direito em agachamento profundo.",
  daysPerWeek: 4,
  sessionMinutes: 60,
  experience: "INTERMEDIATE",
  equipment: ["BARBELL", "DUMBBELL", "MACHINE"],
  observations: "Treina de manhã.",
};

async function main() {
  const up = await fetch(BASE + "/", { redirect: "manual" }).catch(() => null);
  if (!up) {
    console.error(`Servidor indisponível em ${BASE}. Inicie com "npm run dev" (ou defina BASE=...).`);
    process.exit(1);
  }

  // 0. Zera cota/rate limit das execuções anteriores (cota grátis = 3/mês)
  try {
    const reset = await resetTestState();
    log(`\n[0] Reset de estado (RateLimit: ${reset.rateLimit}, UsageRecord: ${reset.usageRecord})`);
  } catch (e) {
    log(`\n[0] ⚠ reset de estado falhou (${e.message}) — a cota pode estar esgotada`);
  }

  // 1. Login professor
  log("\n[1] Login PROFESSOR");
  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: "prof@criatreino.dev", password: "demo12345" },
  });
  const profCookie = sessionCookie(login.setCookie);
  check("login 200 + cookie", login.status === 200 && !!profCookie, `status=${login.status}`);
  check("role PROFESSOR", login.data?.user?.role === "PROFESSOR");

  // 1b. login inválido
  const bad = await req("/api/auth/login", {
    method: "POST",
    body: { email: "prof@criatreino.dev", password: "errada" },
  });
  check("senha errada → 401", bad.status === 401, `status=${bad.status}`);

  // 2. Alunos
  log("\n[2] Lista de alunos");
  const students = await req("/api/students", { cookie: profCookie });
  const aluno = students.data?.students?.[0];
  check("lista 200", students.status === 200, `status=${students.status}`);
  check("aluno encontrado", aluno?.email === "aluno@criatreino.dev");

  // 3. Gerar treino (sem OPENAI_API_KEY → SIMULATED)
  log("\n[3] Geração de treino");
  const gen = await req("/api/workouts/generate", {
    method: "POST",
    cookie: profCookie,
    body: { athleteUserId: aluno.id, profile, locale: "pt-BR" },
  });
  check(
    "generate 200",
    gen.status === 200,
    `status=${gen.status} ${JSON.stringify(gen.data)?.slice(0, 300)}` +
      (gen.status === 502
        ? ` ← chave presente mas o provedor recusou a chamada (créditos/modelo/base URL). Esperado: source=${EXPECTED_SOURCE}`
        : ""),
  );
  check(
    `source ${EXPECTED_SOURCE}`,
    gen.data?.source === EXPECTED_SOURCE,
    `source=${gen.data?.source} (esperado ${EXPECTED_SOURCE})`,
  );
  // Cota: a resposta carrega o contador pós-geração
  const quota = gen.data?.quota;
  check(
    "quota retornada (used=1, remaining=limit-1)",
    !!quota && quota.used === 1 && quota.remaining === quota.limit - 1,
    `quota=${JSON.stringify(quota)}`,
  );
  check("limite grátis = 3/mês (env default)", quota?.limit === 3, `limit=${quota?.limit}`);
  log(`     → cota: ${quota?.used}/${quota?.limit}, plano ${quota?.plan}`);

  if (gen.status !== 200) {
    log(
      `\n❌ Geração indisponível — suíte interrompida.\n` +
        `   Fonte esperada: ${EXPECTED_SOURCE}.` +
        (EXPECTED_SOURCE === "AI"
          ? " Com chave configurada, o provedor recusou a chamada (créditos, modelo ou OPENAI_BASE_URL)."
          : " Sem chave no .env o gerador local deveria funcionar.") +
        "\n   Demais verificações dependem do draft gerado.",
    );
    process.exit(1);
  }
  const draft = gen.data?.draft;
  check("draft tem dias", Array.isArray(draft?.days) && draft.days.length === profile.daysPerWeek, `days=${draft?.days?.length}`);
  check("cada dia tem exercícios", draft?.days?.every((d) => d.exercises.length > 0));
  const totalEx = draft?.days?.reduce((a, d) => a + d.exercises.length, 0) ?? 0;
  log(`     → ${draft?.days?.length} dias, ${totalEx} exercícios, título="${draft?.title}"`);
  const catalog = gen.data?.catalog ?? [];
  check("catálogo retornado", catalog.length > 0, `len=${catalog.length}`);
  const slugs = new Set(catalog.map((c) => c.slug));
  check("slugs do draft existem no catálogo", draft.days.every((d) => d.exercises.every((e) => slugs.has(e.slug))));
  check(
    "catálogo traz avisos de segurança",
    catalog.some((c) => c.warningPt),
    "0 warnings",
  );

  // limitação: joelho não deve aparecer agachamento livre pesado? (sanidade)
  const kneeOk = draft.days.every((d) => d.exercises.every((e) => !/squat-barbell|barbell-back-squat/.test(e.slug)));
  log(`     → agachamento com barra evitado (limitação joelho): ${kneeOk ? "sim" : "NÃO"}`);

  // 4. Revisão: 1 remoção + 1 substituição
  log("\n[4] Revisão (remover + substituir)");
  const days = JSON.parse(JSON.stringify(draft.days));
  const day0 = days[0];
  const removed = day0.exercises.pop();
  check("removido 1 exercício do dia 1", day0.exercises.length >= 1, `slug=${removed?.slug}`);
  const target = day0.exercises[0];
  const orig = catalog.find((c) => c.slug === target.slug);
  const replacement = catalog.find(
    (c) => c.slug !== target.slug && c.muscleGroup === orig.muscleGroup && c.equipment === orig.equipment,
  );
  check("substituto encontrado", !!replacement, `orig=${target.slug}`);
  if (replacement) {
    target.replacedFromSlug = target.slug;
    target.slug = replacement.slug;
    log(`     → ${orig.slug} ⇒ ${replacement.slug}`);
  }

  // 5. Salvar
  log("\n[5] Salvar treino");
  const save = await req("/api/workouts", {
    method: "POST",
    cookie: profCookie,
    body: {
      athleteUserId: aluno.id,
      title: draft.title,
      source: gen.data.source,
      locale: "pt-BR",
      days,
    },
  });
  check("save 200/201", save.status === 200 || save.status === 201, `status=${save.status} ${JSON.stringify(save.data)}`);
  const workoutId = save.data?.id;
  check("id retornado", !!workoutId);

  // 5b. salvar com slug inválido → 400
  const badSave = await req("/api/workouts", {
    method: "POST",
    cookie: profCookie,
    body: {
      athleteUserId: aluno.id,
      title: "X",
      source: "MANUAL",
      locale: "pt-BR",
      days: [{ label: "D1", exercises: [{ slug: "nao-existe", sets: 3, reps: "10" }] }],
    },
  });
  check("slug desconhecido → 400", badSave.status === 400, `status=${badSave.status}`);

  // 6. Detalhe
  log("\n[6] Detalhe do treino");
  const detail = await req(`/api/workouts/${workoutId}`, { cookie: profCookie });
  check("detail 200", detail.status === 200, `status=${detail.status}`);
  const w = detail.data?.workout ?? detail.data;
  const savedDays = w?.days ?? [];
  const savedEx = savedDays.reduce((a, d) => a + d.exercises.length, 0);
  check("remoção persistida", savedEx === totalEx - 1, `esperado=${totalEx - 1} obtido=${savedEx}`);
  const hasReplacement = savedDays.some((d) => d.exercises.some((e) => e.replacedFrom || e.replacedFromId || e.replacedFromSlug));
  check("substituição persistida", hasReplacement);
  log(`     → ${savedDays.length} dias / ${savedEx} exercícios`);

  // 7. Atribuir
  log("\n[7] Atribuir ao aluno");
  const assignOwner = await req(`/api/workouts/${workoutId}/assign`, {
    method: "POST",
    cookie: profCookie,
    body: { studentId: aluno.id, note: "Bom treino!" },
  });
  check("atribuir ao próprio dono → 409 alreadyOwner", assignOwner.status === 409 && assignOwner.data?.error === "alreadyOwner", `status=${assignOwner.status}`);

  // 7b. 2º caminho: treino próprio do professor → atribuir a aluno
  const ownDays = JSON.parse(JSON.stringify(draft.days));
  const ownSave = await req("/api/workouts", {
    method: "POST",
    cookie: profCookie,
    body: {
      athleteUserId: login.data.user.id, // dono = professor
      title: "Treino base — professor",
      source: gen.data.source,
      locale: "pt-BR",
      days: ownDays,
    },
  });
  check("salva treino próprio", ownSave.status === 200 && !!ownSave.data?.id, `status=${ownSave.status}`);
  const ownId = ownSave.data?.id;
  const maria = students.data.students[1];
  const assign = await req(`/api/workouts/${ownId}/assign`, {
    method: "POST",
    cookie: profCookie,
    body: { studentId: maria.id, note: "Foco em postura." },
  });
  check("assign 200/201", assign.status === 200 || assign.status === 201, `status=${assign.status} ${JSON.stringify(assign.data)}`);
  const assign2 = await req(`/api/workouts/${ownId}/assign`, {
    method: "POST",
    cookie: profCookie,
    body: { studentId: maria.id },
  });
  check("atribuição duplicada → 409", assign2.status === 409, `status=${assign2.status}`);
  const assignOtherProf = await req(`/api/workouts/${ownId}/assign`, {
    method: "POST",
    cookie: profCookie,
    body: { studentId: login.data.user.id }, // não é ALUNO
  });
  check("atribuir a não-aluno → 404", assignOtherProf.status === 404, `status=${assignOtherProf.status}`);

  // 8. PDF
  log("\n[8] Exportação PDF");
  const pdf = await req(`/api/workouts/${workoutId}/pdf?locale=pt-BR`, { cookie: profCookie });
  check("pdf 200", pdf.status === 200, `status=${pdf.status}`);
  check("content-type pdf", pdf.ct.includes("pdf"), `ct=${pdf.ct}`);
  check("magic bytes %PDF", Buffer.isBuffer(pdf.data) && pdf.data.subarray(0, 4).toString() === "%PDF", `len=${pdf.data?.length}`);
  check("tamanho plausível", Buffer.isBuffer(pdf.data) && pdf.data.length > 3000, `len=${pdf.data?.length}`);
  log(`     → ${pdf.data?.length} bytes`);

  // 9. Visão do aluno
  log("\n[9] Visão do ALUNO");
  const alunoLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: "aluno@criatreino.dev", password: "demo12345" },
  });
  const alunoCookie = sessionCookie(alunoLogin.setCookie);
  check("login aluno", alunoLogin.status === 200 && !!alunoCookie, `status=${alunoLogin.status}`);
  const meu = await req("/api/workouts", { cookie: alunoCookie });
  check("aluno vê o treino", meu.status === 200 && meu.data?.workouts?.some((x) => x.id === workoutId), `n=${meu.data?.workouts?.length}`);
  const alunoPdf = await req(`/api/workouts/${workoutId}/pdf?locale=pt-BR`, { cookie: alunoCookie });
  check("aluno baixa PDF", alunoPdf.status === 200, `status=${alunoPdf.status}`);
  const alunoDet = await req(`/api/workouts/${workoutId}`, { cookie: alunoCookie });
  check("aluno vê detalhe", alunoDet.status === 200, `status=${alunoDet.status}`);

  // 9b. Maria recebe via Assignment
  const mariaLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: "maria@criatreino.dev", password: "demo12345" },
  });
  const mariaCookie = sessionCookie(mariaLogin.setCookie);
  const mariaList = await req("/api/workouts", { cookie: mariaCookie });
  check("maria recebe via assignment", mariaList.data?.workouts?.some((x) => x.id === ownId), `n=${mariaList.data?.workouts?.length}`);
  const mariaDet = await req(`/api/workouts/${ownId}`, { cookie: mariaCookie });
  check("maria vê detalhe", mariaDet.status === 200, `status=${mariaDet.status}`);
  const mariaPdf = await req(`/api/workouts/${ownId}/pdf?locale=en-US`, { cookie: mariaCookie });
  check("maria baixa PDF en-US", mariaPdf.status === 200 && mariaPdf.ct.includes("pdf"), `status=${mariaPdf.status}`);
  const mariaOther = await req(`/api/workouts/${workoutId}`, { cookie: mariaCookie });
  check("maria não acessa treino não atribuído", mariaOther.status === 403 || mariaOther.status === 404, `status=${mariaOther.status}`);

  // 9c. Páginas SSR autenticadas
  log("\n[9c] Páginas SSR");
  const pages = ["/dashboard", "/students", "/workouts/new", `/workouts/${workoutId}`];
  for (const p of pages) {
    const r = await fetch(BASE + p, { headers: { cookie: profCookie } });
    check(`GET ${p} → 200`, r.status === 200, `status=${r.status}`);
  }
  const enDash = await fetch(BASE + "/en-US/dashboard", { headers: { cookie: profCookie } });
  check("GET /en-US/dashboard → 200", enDash.status === 200, `status=${enDash.status}`);
  const denied = await fetch(BASE + `/workouts/${ownId}`, { headers: { cookie: alunoCookie } });
  check("aluno bloqueado de treino alheio", denied.status === 404 || denied.status === 403, `status=${denied.status}`);

  // 9b. aluno não pode acessar alunos de outro professor
  const forbidden = await req("/api/students", { cookie: alunoCookie });
  check("aluno → /api/students = 403", forbidden.status === 403, `status=${forbidden.status}`);

  // 9d. aluno não gera nem cria treino (função do professor)
  const alunoGen = await req("/api/workouts/generate", {
    method: "POST",
    cookie: alunoCookie,
    body: { athleteUserId: login.data.user.id, profile, locale: "pt-BR" },
  });
  check("aluno → generate = 403", alunoGen.status === 403, `status=${alunoGen.status}`);
  const alunoCreate = await req("/api/workouts", {
    method: "POST",
    cookie: alunoCookie,
    body: {
      athleteUserId: login.data.user.id,
      title: "X",
      source: "MANUAL",
      locale: "pt-BR",
      days: [{ label: "D1", exercises: [{ slug: "flexao-de-peito", sets: 3, reps: "10" }] }],
    },
  });
  check("aluno → criar treino = 403", alunoCreate.status === 403, `status=${alunoCreate.status}`);

  // 9e. cota estourada → 402 (sem pagar IA: preenche a cota direto no banco)
  log("\n[9e] Cota mensal");
  const status0 = await req("/api/billing/status", { cookie: profCookie });
  check("billing/status 200", status0.status === 200, `status=${status0.status}`);
  check(
    "status: plan FREE, checkout coerente com o .env",
    status0.data?.plan === "FREE" && status0.data?.checkoutEnabled === STRIPE.enabled,
    `esperado checkoutEnabled=${STRIPE.enabled} → ${JSON.stringify(status0.data)}`,
  );
  check(
    "status: lista os planos com preço configurado",
    Array.isArray(status0.data?.plans) &&
      status0.data.plans.length === STRIPE.prices.length,
    `plans=${JSON.stringify(status0.data?.plans)} esperado=${STRIPE.prices.length}`,
  );
  const quotaNow = status0.data?.quota;
  check(
    "usage registrado bate com as gerações desta suíte",
    quotaNow?.used === 1,
    `used=${quotaNow?.used}`,
  );

  // Contrato do checkout: sem Stripe → 503; com Stripe → plano inválido → 400
  const badCheckout = await req("/api/billing/checkout", {
    method: "POST",
    cookie: profCookie,
    body: { plan: "ENTERPRISE" },
  });
  if (STRIPE.enabled) {
    check(
      "checkout: plano inválido → 400",
      badCheckout.status === 400,
      `status=${badCheckout.status} body=${JSON.stringify(badCheckout.data)}`,
    );
  } else {
    check(
      "checkout sem Stripe → 503 billingDisabled",
      badCheckout.status === 503 && badCheckout.data?.error === "billingDisabled",
      `status=${badCheckout.status} body=${JSON.stringify(badCheckout.data)}`,
    );
  }

  try {
    await fillQuota("prof@criatreino.dev", 2); // 1 já usada + 2 = limite 3
  } catch (e) {
    log(`     ⚠ fillQuota falhou: ${e.message}`);
  }
  const blocked = await req("/api/workouts/generate", {
    method: "POST",
    cookie: profCookie,
    body: { athleteUserId: aluno.id, profile, locale: "pt-BR" },
  });
  check(
    "402 quotaExceeded ao estourar a cota",
    blocked.status === 402 && blocked.data?.error === "quotaExceeded",
    `status=${blocked.status} body=${JSON.stringify(blocked.data)?.slice(0, 200)}`,
  );
  check(
    "402 carrega o status da cota (para a UI)",
    blocked.data?.quota?.remaining === 0 && blocked.data?.quota?.limit === 3,
    JSON.stringify(blocked.data?.quota),
  );
  const quotaExceeded = await req("/api/billing/status", { cookie: profCookie });
  check(
    "status reflete cota esgotada (remaining=0)",
    quotaExceeded.data?.quota?.remaining === 0,
    `quota=${JSON.stringify(quotaExceeded.data?.quota)}`,
  );

  // 9f. segurança: headers e Origin
  log("\n[9f] Cabeçalhos de segurança");
  const page = await fetch(BASE + "/dashboard", { redirect: "manual" });
  check(
    "X-Frame-Options + nosniff nas páginas",
    page.headers.get("x-frame-options") === "DENY" &&
      page.headers.get("x-content-type-options") === "nosniff",
    `xfo=${page.headers.get("x-frame-options")} nosniff=${page.headers.get("x-content-type-options")}`,
  );
  const apiProbe = await fetch(BASE + "/api/health");
  check("health 200", apiProbe.status === 200, `status=${apiProbe.status}`);
  check(
    "headers também em /api",
    apiProbe.headers.get("x-content-type-options") === "nosniff",
    `nosniff=${apiProbe.headers.get("x-content-type-options")}`,
  );
  // Origin cross-site no login → 403 (CSRF de login)
  const csrf = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ email: "prof@criatreino.dev", password: "demo12345" }),
  });
  check("login com Origin hostil → 403", csrf.status === 403, `status=${csrf.status}`);

  // Zera de novo para não sujar as próximas execuções/visualizações
  try {
    await resetTestState();
  } catch {
    /* melhor esforço */
  }

  // 10. Sem sessão
  log("\n[10] Proteção de rotas");
  const anon = await req("/api/workouts");
  check("anônimo → 401", anon.status === 401, `status=${anon.status}`);
  const anonPage = await fetch(BASE + "/dashboard", { redirect: "manual" });
  check("anônimo /dashboard → redirect login", [302, 307, 303].includes(anonPage.status), `status=${anonPage.status}`);

  // 11. i18n
  log("\n[11] i18n");
  const pt = await fetch(BASE + "/");
  const en = await fetch(BASE + "/en-US/");
  check("landing pt 200", pt.status === 200, `status=${pt.status}`);
  check("landing en 200", en.status === 200, `status=${en.status}`);
  const enText = await en.text();
  check("landing en em inglês", /Workout|training|Generate/i.test(enText));
  const nf = await fetch(BASE + "/pagina-inexistente");
  check("404 status", nf.status === 404, `status=${nf.status}`);
  const nfText = await nf.text();
  check("404 localizado (pt-BR)", nfText.includes("Página não encontrada"), "mensagem padrão do Next");
  const nfEn = await fetch(BASE + "/en-US/does-not-exist");
  const nfEnText = await nfEn.text();
  check("404 localizado (en-US)", nfEn.status === 404 && nfEnText.includes("Page not found"), `status=${nfEn.status}`);

  log(failures === 0 ? "\n✅ E2E OK" : `\n❌ ${failures} falha(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO FATAL", e);
  process.exit(1);
});
