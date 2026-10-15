// Gerencia DESTINOS DE EVENTO v2 (Event destinations) do Stripe em produção.
//
//   STRIPE_SECRET_KEY="sk_live_..." node scripts/stripe-v2-event-dest.mjs list
//   STRIPE_SECRET_KEY="sk_live_..." node scripts/stripe-v2-event-dest.mjs create --secret-out <arquivo> [--url <url>] [--name <nome>]
//   STRIPE_SECRET_KEY="sk_live_..." node scripts/stripe-v2-event-dest.mjs ping [id]
//
// Complementa o endpoint CLÁSSICO de stripe-webhook-setup.mjs (eventos v1).
// O destino v2 entrega os mesmos eventos no envelope v2 ("v1.checkout.session.completed"
// etc.) e é o plano de continuidade quando o clássico for descontinuado.
//
// Diferente do clássico, o signing secret do destino só é revelado na CRIAÇÃO —
// e só se pedirmos include=webhook_endpoint.signing_secret. Por isso o create
// exige --secret-out: o segredo vai só para o arquivo, nunca no terminal.
import { chmodSync, writeFileSync } from "node:fs";

const WEBHOOK_URL =
  process.env.BILLING_WEBHOOK_URL ??
  "https://criatreino.vercel.app/api/billing/webhook";

const DESTINATION_NAME = "CrIA Treino — webhook (v2)";

// Os três v1 que src/app/api/billing/webhook/route.ts trata, no formato v2
// (prefixo "v1." — enum de event types em stripe/types: V2.Core.Events).
const EVENT_TYPES = [
  "v1.checkout.session.completed",
  "v1.customer.subscription.updated",
  "v1.customer.subscription.deleted",
];

function valorDeFlag(nome) {
  const indice = process.argv.indexOf(nome);
  return indice !== -1 ? process.argv[indice + 1] : undefined;
}

async function listarDestinos(stripe) {
  const pagina = await stripe.v2.core.eventDestinations.list({
    limit: 100,
    include: ["webhook_endpoint.url"],
  });
  if (pagina.data.length === 0) {
    console.log("Nenhum destino de evento na conta (esperado antes do create).");
    return;
  }
  console.log(`Destinos de evento: ${pagina.data.length}\n`);
  for (const destino of pagina.data) {
    console.log(`  ${destino.id} — ${destino.name}`);
    console.log(`    status:  ${destino.status}`);
    console.log(
      `    URL:     ${destino.webhook_endpoint?.url ?? "(oculta)"}`,
    );
    console.log(`    eventos: ${destino.enabled_events.join(", ")}\n`);
  }
}

async function criarDestino(stripe) {
  const arquivoSecret = valorDeFlag("--secret-out");
  if (!arquivoSecret) {
    console.error(
      "✖ create exige --secret-out <arquivo> — o signing secret vai só para o arquivo, nunca no terminal",
    );
    process.exit(1);
  }

  const destino = await stripe.v2.core.eventDestinations.create({
    name: valorDeFlag("--name") ?? DESTINATION_NAME,
    type: "webhook_endpoint",
    // Payload "thin": os tipos v1.* são thin e o Stripe recusa snapshot —
    // "Enabled events list contains 'thin' event types when event_payload is 'snapshot'."
    event_payload: "thin",
    enabled_events: EVENT_TYPES,
    webhook_endpoint: { url: valorDeFlag("--url") ?? WEBHOOK_URL },
    include: ["webhook_endpoint.signing_secret", "webhook_endpoint.url"],
  });

  const signingSecret = destino.webhook_endpoint?.signing_secret;
  if (!signingSecret) {
    console.error(
      "✖ o Stripe não devolveu o signing secret na criação " +
        "(include=webhook_endpoint.signing_secret)",
    );
    console.error(
      "  Fallback: painel → Developers → Event destinations → destino → " +
        "Webhook endpoint signing secret → copie para o arquivo manualmente.",
    );
    process.exit(1);
  }
  writeFileSync(arquivoSecret, signingSecret, {
    encoding: "utf8",
    flag: "w",
    mode: 0o600,
  });
  chmodSync(arquivoSecret, 0o600);

  console.log(`✔ Destino criado: ${destino.id}`);
  console.log(`  Nome:    ${destino.name}`);
  console.log(`  Status:  ${destino.status}`);
  console.log(
    `  URL:     ${destino.webhook_endpoint?.url ?? (valorDeFlag("--url") ?? WEBHOOK_URL)}`,
  );
  console.log(`  Eventos: ${destino.enabled_events.join(", ")}`);
  console.log(
    `  Signing secret gravado em ${arquivoSecret} (permissão 600 — não sai daqui)`,
  );
}

async function pingarDestino(stripe, idDestino) {
  let alvo = idDestino;
  if (!alvo) {
    const pagina = await stripe.v2.core.eventDestinations.list({
      limit: 100,
      include: ["webhook_endpoint.url"],
    });
    const primeiro = pagina.data[0];
    if (!primeiro) {
      console.error(
        "✖ nenhum destino de evento na conta — rode primeiro: " +
          "node scripts/stripe-v2-event-dest.mjs create --secret-out <arquivo>",
      );
      process.exit(1);
    }
    alvo = primeiro.id;
    console.log(`Sem id — usando o primeiro destino da conta: ${alvo} (${primeiro.name})`);
  }

  const evento = await stripe.v2.core.eventDestinations.ping(alvo);
  console.log(`✔ Ping enviado para ${alvo}`);
  console.log(`  Evento:   ${evento.id}`);
  console.log(`  Tipo:     ${evento.type}`);
  console.log(`  Criado:   ${evento.created}`);
  console.log(`  Livemode: ${evento.livemode}`);
  console.log(
    "  A entrega é assíncrona — o endpoint deve responder 200 em segundos.",
  );
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("✖ exporte a chave: STRIPE_SECRET_KEY=\"sk_live_...\"");
    process.exit(1);
  }
  // sk_live_ (chave secreta padrão) ou rk_live_ (restricted key com
  // permissão de Event destinations) — ambas operam em modo live.
  if (!/^[sr]k_live_/.test(key)) {
    console.error(
      "✖ esta não é uma chave live (sk_live_.../rk_live_...) — para o destino de produção use a live",
    );
    process.exit(1);
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key);

  const [subcomando, ...resto] = process.argv.slice(2);
  switch (subcomando) {
    case "list":
      await listarDestinos(stripe);
      break;
    case "create":
      await criarDestino(stripe);
      break;
    case "ping":
      await pingarDestino(stripe, resto[0]);
      break;
    default:
      console.error("uso: node scripts/stripe-v2-event-dest.mjs <comando>");
      console.error("  list                          lista destinos (sem segredos)");
      console.error("  create --secret-out <arq>      cria destino (secret só no arquivo)");
      console.error("                                [--url <url>] [--name <nome>]");
      console.error("  ping [id]                     envia ping (sem id: primeiro destino)");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
