// Recria o endpoint de webhook CLÁSSICO (eventos v1) para produção.
//
//   STRIPE_SECRET_KEY="sk_live_..." node scripts/stripe-webhook-setup.mjs
//
// Por que clássico e não "destino de evento" (v2): a rota
// /api/billing/webhook foi implementada e testada contra o formato v1
// (checkout.session.completed, customer.subscription.*). Além disso, o
// signing secret de um endpoint clássico é revelado EXATAMENTE uma vez —
// na criação — então o script apaga os endpoints antigos da MESMA URL
// (nunca toca em outros) e cria um novo, te entregando o whsec_ no terminal.
const WEBHOOK_URL =
  process.env.BILLING_WEBHOOK_URL ??
  "https://criatreino.vercel.app/api/billing/webhook";

const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("✖ exporte a chave: STRIPE_SECRET_KEY=\"sk_live_...\"");
    process.exit(1);
  }
  // sk_live_ (chave secreta padrão) ou rk_live_ (restricted key com
  // permissão de Webhooks) — ambas operam em modo live.
  if (!/^[sr]k_live_/.test(key)) {
    console.error(
      "✖ esta não é uma chave live (sk_live_.../rk_live_...) — para o webhook de produção use a live",
    );
    process.exit(1);
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key);

  const account = await stripe.accounts.retrieve();
  console.log(`Conta Stripe ok (${account.id}) — modo LIVE\n`);

  // Só remove endpoints que apontam para a NOSSA URL.
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  for (const endpoint of existing.data) {
    if (endpoint.url === WEBHOOK_URL) {
      try {
        await stripe.webhookEndpoints.del(endpoint.id);
        console.log(`  ↳ endpoint antigo removido: ${endpoint.id}`);
      } catch (error) {
        console.log(
          `  ↳ não consegui remover ${endpoint.id} (${endpoint.url}, ` +
            `${endpoint.api_version ?? "v?"}) — apague-o pelo painel: ` +
            `${error.message}`,
        );
      }
    }
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
  });

  console.log(`\n✔ Endpoint clássico criado: ${endpoint.id}`);
  console.log(`  URL:   ${endpoint.url}`);
  console.log(`  Eventos: ${endpoint.enabled_events.join(", ")}`);
  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.log("║  SIGNING SECRET (só aparece nesta criação — copie AGORA):   ║");
  console.log(
    "╠══════════════════════════════════════════════════════════════╣",
  );
  console.log(`║  ${endpoint.secret}`);
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );
  console.log("\nPróximos passos:");
  console.log(
    "1) Vercel → Settings → Environment Variables → STRIPE_WEBHOOK_SECRET" +
      " (Production) → substitua pelo valor acima",
  );
  console.log("2) Peça o redeploy (o valor só vale em deploy novo)");
  console.log(
    "3) Developers → Webhooks → o endpoint → Send test event → entregará" +
      " 200 {\"received\":true}",
  );
  console.log(
    "4) Delete no painel o antigo 'Destino de evento' v2, se ainda existir" +
      " (evita entregas duplicadas/ruidosas).",
  );
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
