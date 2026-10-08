// Cria (idempotente) os produtos/preços dos planos pagos no Stripe e grava
// STRIPE_PRICE_ID_{BASIC,PRO,ULTIMATE} no .env.
//
//   node scripts/stripe-setup.mjs
//
// Requer STRIPE_SECRET_KEY no .env (modo teste ou live). Reexecutar é seguro:
// produtos/preços já existentes são reaproveitados (identificação por metadata
// `cria_plan=<PLANO>`), então não duplica cobranças.
import { readFileSync, writeFileSync } from "node:fs";

function envFile() {
  return new URL("../.env", import.meta.url);
}

function getEnv(name) {
  const file = readFileSync(envFile(), "utf8");
  return (file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function setEnv(name, value) {
  let file = readFileSync(envFile(), "utf8");
  const line = `${name}="${value}"`;
  if (new RegExp(`^${name}=`, "m").test(file)) {
    file = file.replace(new RegExp(`^${name}=.*$`, "m"), line);
  } else {
    file = file.trimEnd() + `\n${line}\n`;
  }
  writeFileSync(envFile(), file);
}

// Nome → { unit_amount (centavos), moeda, nome do produto, desc }
const PLANS = [
  {
    plan: "BASIC",
    unitAmount: 890, // R$ 8,90
    name: "CrIA Treino Basic",
    description: "20 gerações de treino por mês",
  },
  {
    plan: "PRO",
    unitAmount: 2990, // R$ 29,90
    name: "CrIA Treino Pro",
    description: "100 gerações de treino por mês",
  },
  {
    plan: "ULTIMATE",
    unitAmount: 11990, // R$ 119,90
    name: "CrIA Treino Ultimate",
    description: "500 gerações de treino por mês",
  },
];

async function main() {
  // A chave pode vir do ambiente (produção):
  //   STRIPE_SECRET_KEY="sk_live_..." node scripts/stripe-setup.mjs
  // Nesse caso os IDs gerados são apenas IMPRESSOS — o .env local (que
  // guarda os preços de teste) permanece intacto.
  const keyFromShell = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const key = keyFromShell || getEnv("STRIPE_SECRET_KEY");
  if (!key) {
    console.error(
      "✖ STRIPE_SECRET_KEY ausente (no .env ou exportada no ambiente)",
    );
    process.exit(1);
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key);

  // Verifica a chave (e o modo) antes de criar qualquer coisa.
  await stripe.accounts.retrieve();
  console.log(
    `Conta Stripe ok (modo ${key.startsWith("sk_test") ? "TESTE" : "LIVE"})\n`,
  );

  // Mapa produto existente por metadata (evita duplicar a cada execução)
  const existingProducts = await stripe.products.list({ limit: 100 });
  const byPlan = new Map(
    existingProducts.data
      .filter((p) => p.metadata?.cria_plan)
      .map((p) => [p.metadata.cria_plan, p]),
  );

  for (const spec of PLANS) {
    let product = byPlan.get(spec.plan);

    if (!product) {
      product = await stripe.products.create({
        name: spec.name,
        description: spec.description,
        metadata: { cria_plan: spec.plan },
      });
      console.log(`✔ produto criado: ${spec.name} (${product.id})`);
    } else {
      console.log(`→ produto já existe: ${spec.name} (${product.id})`);
    }

    // Preço recorrente mensal em BRL, identificado por metadata do plano.
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });
    let price = prices.data.find(
      (p) =>
        p.metadata?.cria_plan === spec.plan &&
        p.recurring?.interval === "month" &&
        p.currency === "brl",
    );

    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: spec.unitAmount,
        currency: "brl",
        recurring: { interval: "month" },
        nickname: `${spec.plan} mensal`,
        metadata: { cria_plan: spec.plan },
      });
      console.log(
        `  ✔ preço criado: R$ ${(spec.unitAmount / 100).toFixed(2)}/mês (${price.id})`,
      );
    } else {
      console.log(
        `  → preço já existe: R$ ${(price.unit_amount / 100).toFixed(2)}/mês (${price.id})`,
      );
    }

    if (keyFromShell) {
      console.log(
        `  → registre no painel do servidor: STRIPE_PRICE_ID_${spec.plan}=${price.id}`,
      );
    } else {
      setEnv(`STRIPE_PRICE_ID_${spec.plan}`, price.id);
    }
  }

  if (keyFromShell) {
    console.log(
      "\n✔ Preços live criados — copie os STRIPE_PRICE_ID_* acima para o painel (ex.: Vercel).",
    );
  } else {
    console.log("\n✔ STRIPE_PRICE_ID_{BASIC,PRO,ULTIMATE} gravados no .env");
    console.log(
      "Próximo passo: `stripe listen --forward-to localhost:3000/api/billing/webhook` e cole o whsec_ no STRIPE_WEBHOOK_SECRET.",
    );
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
