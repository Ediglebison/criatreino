// Smoke test do webhook do Stripe sem depender da CLI pareada.
//
// Assina eventos sintéticos com o MESMO algoritmo do Stripe
// (HMAC-SHA256 sobre `t.payload`, verificado por stripe.webhooks.constructEvent)
// usando o STRIPE_WEBHOOK_SECRET do .env, e valida que /api/billing/webhook:
//   - rejeita assinatura ausente/inválida (400)
//   - ativa o plano correto por metadata no checkout.session.completed
//   - troca o plano pelo preço na assinatura ativa (customer.subscription.updated)
//   - NÃO rebaixa quando o preço não mapeia para nenhum plano
//   - volta para FREE no customer.subscription.deleted
//   - os limites de cota acompanham o plano (20/100/500/3)
//
//   node scripts/billing-smoke.mjs [BASE]     (padrão http://localhost:3000)
//
// Ao final restaura o professor demo para FREE (mesmo estado do e2e).
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

const SECRET = env("STRIPE_WEBHOOK_SECRET");
const PRICE_PRO = env("STRIPE_PRICE_ID_PRO");
const PRICE_ULTIMATE = env("STRIPE_PRICE_ID_ULTIMATE");

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

function sessionCookie(setCookie) {
  return setCookie.match(/ct_session=[^;]+/)?.[0] || "";
}

async function postWebhook(payload, signature) {
  const res = await fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body: payload,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function main() {
  if (!SECRET) {
    console.error("✖ STRIPE_WEBHOOK_SECRET ausente no .env");
    process.exit(1);
  }
  const Stripe = require("stripe");
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"));

  const sign = (payload) =>
    stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

  console.log(`Webhook smoke → ${BASE}\n`);

  // Login do professor demo
  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: "prof@criatreino.dev", password: "demo12345" },
  });
  check("login professor", login.status === 200, `status=${login.status}`);
  const cookie = sessionCookie(login.setCookie);
  const userId = login.data?.user?.id;
  check("userId obtido", Boolean(userId));

  const status = async () => (await req("/api/billing/status", { cookie })).data;

  const base = await status();
  check(
    "estado inicial: FREE + 3 gerações",
    base?.plan === "FREE" && base?.quota?.limit === 3,
    JSON.stringify(base?.quota),
  );

  // 1. Assinatura ausente e inválida → 400
  const noSig = await postWebhook(JSON.stringify({ type: "test" }));
  check("sem assinatura → 400", noSig.status === 400, `status=${noSig.status}`);

  const badPayload = JSON.stringify({ type: "test" });
  const badSig = await postWebhook(badPayload, sign(badPayload) + "tampered");
  check("assinatura inválida → 400", badSig.status === 400, `status=${badSig.status}`);

  const wrongSecret = await postWebhook(
    badPayload,
    stripe.webhooks.generateTestHeaderString({
      payload: badPayload,
      secret: "whsec_wrong",
    }),
  );
  check("segredo errado → 400", wrongSecret.status === 400, `status=${wrongSecret.status}`);

  // 2. checkout.session.completed com metadata.plan=BASIC → plano BASIC
  const checkoutEvent = JSON.stringify({
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        client_reference_id: userId,
        customer: "cus_smoke_test",
        subscription: "sub_smoke_test",
        metadata: { userId, plan: "BASIC" },
      },
    },
  });
  const r1 = await postWebhook(checkoutEvent, sign(checkoutEvent));
  check("checkout.completed → 200", r1.status === 200, JSON.stringify(r1.data));
  const s1 = await status();
  check(
    "plano BASIC + limite 20",
    s1?.plan === "BASIC" && s1?.quota?.limit === 20,
    JSON.stringify(s1?.quota),
  );

  // 3. Assinatura ativa com preço ULTIMATE → troca para ULTIMATE
  const updUlt = JSON.stringify({
    type: "customer.subscription.updated",
    data: {
      object: {
        object: "subscription",
        id: "sub_smoke_test",
        customer: "cus_smoke_test",
        status: "active",
        metadata: { plan: "ULTIMATE" },
        items: { data: [{ price: { id: PRICE_ULTIMATE } }] },
      },
    },
  });
  const r2 = await postWebhook(updUlt, sign(updUlt));
  check("subscription.updated → 200", r2.status === 200, JSON.stringify(r2.data));
  const s2 = await status();
  check(
    "plano ULTIMATE + limite 500",
    s2?.plan === "ULTIMATE" && s2?.quota?.limit === 500,
    JSON.stringify(s2?.quota),
  );

  // 4. Assinatura ativa com preço desconhecido → NÃO rebaixa (mantém ULTIMATE)
  const updUnknown = JSON.stringify({
    type: "customer.subscription.updated",
    data: {
      object: {
        object: "subscription",
        id: "sub_smoke_test",
        customer: "cus_smoke_test",
        status: "active",
        metadata: {},
        items: { data: [{ price: { id: "price_not_mapped" } }] },
      },
    },
  });
  const r3 = await postWebhook(updUnknown, sign(updUnknown));
  check("preço não mapeado → 200", r3.status === 200, JSON.stringify(r3.data));
  const s3 = await status();
  check(
    "mantém ULTIMATE (não rebaixa)",
    s3?.plan === "ULTIMATE",
    `plan=${s3?.plan}`,
  );

  // 5. Preço PRO (sem metadata) → troca para PRO (resolução inversa por preço)
  const updPro = JSON.stringify({
    type: "customer.subscription.updated",
    data: {
      object: {
        object: "subscription",
        id: "sub_smoke_test",
        customer: "cus_smoke_test",
        status: "active",
        metadata: {},
        items: { data: [{ price: { id: PRICE_PRO } }] },
      },
    },
  });
  const r4 = await postWebhook(updPro, sign(updPro));
  check("troca por preço PRO → 200", r4.status === 200, JSON.stringify(r4.data));
  const s4 = await status();
  check(
    "plano PRO + limite 100",
    s4?.plan === "PRO" && s4?.quota?.limit === 100,
    JSON.stringify(s4?.quota),
  );

  // 6. Assinatura cancelada → FREE
  const deleted = JSON.stringify({
    type: "customer.subscription.deleted",
    data: {
      object: {
        object: "subscription",
        id: "sub_smoke_test",
        customer: "cus_smoke_test",
        status: "canceled",
        metadata: {},
        items: { data: [{ price: { id: PRICE_PRO } }] },
      },
    },
  });
  const r5 = await postWebhook(deleted, sign(deleted));
  check("subscription.deleted → 200", r5.status === 200, JSON.stringify(r5.data));
  const s5 = await status();
  check(
    "volta para FREE + limite 3",
    s5?.plan === "FREE" && s5?.quota?.limit === 3,
    JSON.stringify(s5?.quota),
  );

  // 7. Evento de usuário inexistente não pode 500 (o Stripe reenviaria p/ sempre)
  const orphan = JSON.stringify({
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        client_reference_id: "user_that_does_not_exist",
        customer: "cus_orphan",
        subscription: "sub_orphan",
        metadata: { userId: "user_that_does_not_exist", plan: "PRO" },
      },
    },
  });
  const r6 = await postWebhook(orphan, sign(orphan));
  check("usuário inexistente → 200 (sem 500)", r6.status === 200, `status=${r6.status}`);

  // Restaura o estado FREE do professor (o e2e depende dele)
  const { Client } = require("pg");
  const client = new Client({ connectionString: env("DATABASE_URL") });
  await client.connect();
  await client.query(
    `UPDATE "User" SET plan='FREE', "stripeCustomerId"=NULL, "stripeSubscriptionId"=NULL WHERE email='prof@criatreino.dev'`,
  );
  await client.query('DELETE FROM "UsageRecord"');
  await client.end();

  const final = await status();
  check(
    "estado restaurado: FREE + cota zerada",
    final?.plan === "FREE" && final?.quota?.limit === 3 && final?.quota?.used === 0,
    JSON.stringify(final?.quota),
  );

  console.log(
    failures === 0
      ? "\n✅ WEBHOOK SMOKE OK"
      : `\n✖ ${failures} falha(s) no webhook smoke`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`✖ ${err.stack || err.message}`);
  process.exit(1);
});
