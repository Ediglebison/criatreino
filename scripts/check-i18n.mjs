// Verifica paridade de chaves entre messages/pt-BR.json e messages/en-US.json.
// Rodo: npm run check:i18n  (também faz parte de `npm run test` / CI)
import { readFileSync } from "node:fs";

const LOCALES = ["pt-BR", "en-US"];

function load(locale) {
  return JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"),
  );
}

/** Achata JSON em "caminho.chave" → valor (objetos viram nós, o resto é folha). */
function flatten(value, prefix = "", out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, out);
    } else {
      out.set(path, child);
    }
  }
  return out;
}

const [base, ...others] = LOCALES;
const maps = new Map(LOCALES.map((l) => [l, flatten(load(l))]));
let failures = 0;

for (const locale of others) {
  const ref = maps.get(base);
  const cur = maps.get(locale);

  const missing = [...ref.keys()].filter((k) => !cur.has(k));
  const extra = [...cur.keys()].filter((k) => !ref.has(k));

  if (missing.length) {
    failures++;
    console.error(`✘ ${locale}: ${missing.length} chave(s) ausente(s) vs ${base}:`);
    for (const k of missing.slice(0, 20)) console.error(`    - ${k}`);
  }
  if (extra.length) {
    failures++;
    console.error(`✘ ${locale}: ${extra.length} chave(s) extra(s) vs ${base}:`);
    for (const k of extra.slice(0, 20)) console.error(`    - ${k}`);
  }
  if (!missing.length && !extra.length) {
    console.log(`✔ ${locale}: ${cur.size} chaves em paridade com ${base}`);
  }
}

// Valores vazios quebram a UI (chave existe, mensagem não).
for (const locale of LOCALES) {
  const empty = [...maps.get(locale)]
    .filter(([, v]) => typeof v === "string" && v.trim() === "")
    .map(([k]) => k);
  if (empty.length) {
    failures++;
    console.error(`✘ ${locale}: ${empty.length} valor(es) vazio(s):`);
    for (const k of empty.slice(0, 20)) console.error(`    - ${k}`);
  }
}

if (failures) {
  console.error(`\nParidade i18n: ${failures} problema(s).`);
  process.exit(1);
}
console.log("\nParidade i18n OK ✔");
