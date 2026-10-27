// Checkout E2E contra a API REAL do Stripe (modo teste).
//
// Valida POST /api/billing/checkout de ponta a ponta:
//   - FREE → cria sessão de Checkout com preço/metadata/mode corretos
//   - plano inválido → 400
//   - assinante no mesmo plano → 409 samePlan
//   - upgrade BASIC → PRO → ULTIMATE na MESMA assinatura (prorata, sem duplicar)
//   - /api/billing/status acompanha o plano (20/100/500)
//
// Requer STRIPE_SECRET_KEY no .env. Cria um customer + assinatura de teste
// (cartão pm_card_visa) e APAGA tudo ao final; restaura o professor demo
// para FREE (mesmo estado do e2e).
//
//   npm run test:billing:checkout      (exige servidor ativo; BASE p/ outra porta)

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BASE = process.argv[2] || process.env.BASE || "http://localhost:3000";

function env(name) {
  const file = readFileSync(new URL("../.env", import.meta.url), "utf8");
  return (file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

const SECRET_KEY = env("STRIPE_SECRET_KEY");
const PRICE = {
  BASIC: env("STRIPE_PRICE_ID_BASIC"),
  PRO: env("STRIPE_PRICE_ID_PRO"),
  ULTIMATE: env("STRIPE_PRICE_ID_ULTIMATE"),
};

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ✔ ${name}`);
  else {
    failures++;
    console.log(`  ✘ ${name} ${detail}`);
  }
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
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : null;
  return { status: res.status, data, setCookie: res.headers.get("set-cookie") || "" };
}

async function main() {
  if (!SECRET_KEY || !PRICE.BASIC || !PRICE.PRO || !PRICE.ULTIMATE) {
    console.error(
      "✖ Configure STRIPE_SECRET_KEY e STRIPE_PRICE_ID_{BASIC,PRO,ULTIMATE} no .env\n" +
        "  (rode: node scripts/stripe-setup.mjs)",
    );
    process.exit(1);
  }

  const Stripe = require("stripe");
  const stripe = new Stripe(SECRET_KEY);
  const { Client } = require("pg");

  console.log(`Checkout E2E (Stripe real) → ${BASE}\n`);

  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: "prof@criatreino.dev", password: "demo12345" },
  });
  const cookie = login.setCookie.match(/ct_session=[^;]+/)?.[0] || "";
  const userId = login.data?.user?.id;
  check("login professor", login.status === 200 && !!userId, `status=${login.status}`);

  // --- 1. FREE → cria sessão de checkout real (BASIC) ---
  const co = await req("/api/billing/checkout", {
    method: "POST",
    cookie,
    body: { plan: "BASIC" },
  });
  check(
    "checkout FREE → 200 com URL do Stripe",
    co.status === 200 && /^https:\/\/checkout\.stripe\.com/.test(co.data?.url || ""),
    `status=${co.status} url=${co.data?.url}`,
  );

  if (co.data?.url) {
    // A URL traz um fragmento #fid... — o id é a última barra antes dele.
    const sid = co.data.url.split("#")[0].split("?")[0].split("/").pop();
    const sess = await stripe.checkout.sessions.retrieve(sid, {
      expand: ["line_items"],
    });
    const price = sess.line_items?.data?.[0]?.price?.id;
    check(
      "sessão: preço BASIC + metadata.plan + mode subscription",
      price === PRICE.BASIC && sess.metadata?.plan === "BASIC" && sess.mode === "subscription",
      `price=${price} plan=${sess.metadata?.plan} mode=${sess.mode}`,
    );
    // Abandonada de propósito: expira para não poluir o dashboard de teste.
    await stripe.checkout.sessions.expire(sid).catch(() => {});
  }

  // --- 2. Plano inválido → 400 ---
  const bad = await req("/api/billing/checkout", {
    method: "POST",
    cookie,
    body: { plan: "ENTERPRISE" },
  });
  check("plano inválido → 400", bad.status === 400, `status=${bad.status}`);

  // --- 3. Sincroniza uma assinatura BASIC real (como o webhook faria) ---
  const customer = await stripe.customers.create({
    email: "prof@criatreino.dev",
    name: "Billing E2E",
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: PRICE.BASIC }],
    metadata: { userId, plan: "BASIC" },
  });
  check(
    "assinatura BASIC ativa no Stripe",
    sub.status === "active" && sub.items.data[0].price.id === PRICE.BASIC,
    `status=${sub.status}`,
  );

  const client = new Client({ connectionString: env("DATABASE_URL") });
  await client.connect();
  await client.query(
    `UPDATE "User" SET plan='BASIC', "stripeCustomerId"=$1, "stripeSubscriptionId"=$2 WHERE id=$3`,
    [customer.id, sub.id, userId],
  );

  const st1 = await req("/api/billing/status", { cookie });
  check(
    "status: BASIC + limite 20",
    st1.data?.plan === "BASIC" && st1.data?.quota?.limit === 20,
    JSON.stringify(st1.data?.quota),
  );

  // --- 4. Mesmo plano → 409 ---
  const same = await req("/api/billing/checkout", {
    method: "POST",
    cookie,
    body: { plan: "BASIC" },
  });
  check(
    "mesmo plano → 409 samePlan",
    same.status === 409 && same.data?.error === "samePlan",
    `status=${same.status} body=${JSON.stringify(same.data)}`,
  );

  // --- 5. Upgrade BASIC → PRO na MESMA assinatura ---
  const up = await req("/api/billing/checkout", {
    method: "POST",
    cookie,
    body: { plan: "PRO" },
  });
  const subPro = await stripe.subscriptions.retrieve(sub.id);
  check(
    "upgrade → 200 {updated:true, plan:PRO}",
    up.status === 200 && up.data?.updated === true && up.data?.plan === "PRO",
    `status=${up.status} body=${JSON.stringify(up.data)}`,
  );
  check(
    "mesma assinatura agora no preço PRO (sem duplicar cobrança)",
    subPro.items.data[0].price.id === PRICE.PRO,
    `price=${subPro.items.data[0].price.id}`,
  );
  // Espelha o webhook — plano só muda quando o Stripe confirmar.
  await client.query(`UPDATE "User" SET plan='PRO' WHERE id=$1`, [userId]);
  const st2 = await req("/api/billing/status", { cookie });
  check(
    "status: PRO + limite 100",
    st2.data?.plan === "PRO" && st2.data?.quota?.limit === 100,
    JSON.stringify(st2.data?.quota),
  );

  // --- 6. Upgrade PRO → ULTIMATE ---
  const up2 = await req("/api/billing/checkout", {
    method: "POST",
    cookie,
    body: { plan: "ULTIMATE" },
  });
  const subFinal = await stripe.subscriptions.retrieve(sub.id);
  check(
    "upgrade → ULTIMATE na mesma assinatura",
    up2.status === 200 && subFinal.items.data[0].price.id === PRICE.ULTIMATE,
    `status=${up2.status} price=${subFinal.items.data[0].price.id}`,
  );
  // Espelha o webhook — plano só muda quando o Stripe confirmar.
  await client.query(`UPDATE "User" SET plan='ULTIMATE' WHERE id=$1`, [userId]);
  const st3 = await req("/api/billing/status", { cookie });
  check(
    "status: ULTIMATE + limite 500",
    st3.data?.plan === "ULTIMATE" && st3.data?.quota?.limit === 500,
    JSON.stringify(st3.data?.quota),
  );

  // --- Cleanup: cancela sub, apaga customer, restaura FREE ---
  await stripe.subscriptions.cancel(sub.id, { prorate: false }).catch(() => {});
  await stripe.customers.del(customer.id).catch(() => {});
  await client.query(
    `UPDATE "User" SET plan='FREE', "stripeCustomerId"=NULL, "stripeSubscriptionId"=NULL WHERE id=$1`,
    [userId],
  );
  await client.query('DELETE FROM "UsageRecord"');
  await client.end();

  const fin = await req("/api/billing/status", { cookie });
  check(
    "estado restaurado: FREE + limite 3 + cota zerada",
    fin.data?.plan === "FREE" &&
      fin.data?.quota?.limit === 3 &&
      fin.data?.quota?.used === 0,
    JSON.stringify(fin.data?.quota),
  );

  console.log(
    failures === 0
      ? "\n✅ CHECKOUT E2E OK"
      : `\n✖ ${failures} falha(s) no checkout e2e`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`✖ ${err.stack || err.message}`);
  process.exit(1);
});
