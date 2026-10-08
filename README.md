# CrIA Treino

SaaS de treinos personalizados gerados com inteligência artificial. O professor (ou o próprio aluno) preenche medidas corporais e um questionário de objetivos/limitações/disponibilidade; a IA sugere um treino; o plano é revisado com um **checklist de substituição de exercícios** antes de finalizar; ao final o treino pode ser **enviado para um usuário aluno** ou **exportado em PDF**.

> Fluxo: cadastro/login → wizard (atleta → perfil → gerar com IA → revisão) → finalizar → ver treino → enviar para aluno / exportar PDF.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, RSC) |
| UI | React 19 + Tailwind CSS 4 |
| i18n | next-intl 4 (`pt-BR` padrão, `en-US` com prefixo `/en-US`) |
| Banco | PostgreSQL + Prisma ORM 7 (driver adapter `@prisma/adapter-pg`) |
| Auth | JWT (jose) em cookie httpOnly + bcryptjs — papéis `PROFESSOR` / `ALUNO` |
| IA | OpenAI (structured outputs / JSON schema) com fallback por regras |
| PDF | jsPDF + jspdf-autotable (geração no servidor) |
| Validação | Zod 4 |

## Requisitos

- Node 20.9+ (testado com Node 24)
- PostgreSQL 14+ rodando local (ex.: no WSL)

## Como rodar

```bash
# 1) Banco (uma vez) — no WSL:
sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib
sudo service postgresql start
sudo -u postgres psql -c "CREATE ROLE criaotreino WITH LOGIN PASSWORD 'criaotreino_dev' CREATEDB;"
sudo -u postgres createdb -O criaotreino criaotreino

# 2) Dependências
npm install

# 3) Variáveis de ambiente
cp .env.example .env   # ajuste DATABASE_URL/AUTH_SECRET

# 4) Migrações + seed (catálogo de 101 exercícios + usuários demo)
npm run db:migrate
npm run db:seed

# 5) Desenvolvimento
npm run dev             # http://localhost:3000
```

### Usuários do seed

| E-mail | Perfil | Senha |
| --- | --- | --- |
| `prof@criatreino.dev` | Professor | `demo12345` |
| `aluno@criatreino.dev` | Aluno (vinculado) | `demo12345` |
| `maria@criatreino.dev` | Aluna (vinculada) | `demo12345` |

> **Produção:** quando `NODE_ENV=production` o seed semeia só o catálogo de
> exercícios e **omite as contas demo** (senha publicada). Para forçar em um
> staging, use `SEED_DEMO=1 npm run db:seed`.

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Connection string do PostgreSQL (em produção: `?sslmode=require`) |
| `AUTH_SECRET` | Segredo do JWT da sessão, **mín. 32 caracteres** (`openssl rand -base64 48`) |
| `OPENAI_API_KEY` | Se **vazia**, o gerador cai para o **modo simulado** (regras locais) |
| `OPENAI_MODEL` | Modelo usado (padrão `gpt-4o-mini`) |
| `OPENAI_BASE_URL` | Endpoint compatível com OpenAI (Groq, OpenRouter, Gemini, Ollama…). Vazio = `api.openai.com` |
| `NEXT_PUBLIC_APP_URL` | URL pública do app (fallback das URLs de checkout Stripe) |
| `STRIPE_SECRET_KEY` | Chave da API Stripe. **Vazia** = planos pagos desativados (503 `billingDisabled`) |
| `STRIPE_PRICE_ID_BASIC` | Preço recorrente mensal do plano **Basic** (R$ 8,90 → 20 gerações) |
| `STRIPE_PRICE_ID_PRO` | Preço recorrente mensal do plano **Pro** (R$ 29,90 → 100 gerações) |
| `STRIPE_PRICE_ID_ULTIMATE` | Preço recorrente mensal do plano **Ultimate** (R$ 119,90 → 500 gerações) |
| `STRIPE_WEBHOOK_SECRET` | Segredo do endpoint de webhook (`whsec_...`) |
| `BILLING_FREE_MONTHLY_LIMIT` | Gerações/mês do plano grátis (padrão `3`) |
| `BILLING_BASIC_MONTHLY_LIMIT` | Gerações/mês do plano Basic (padrão `20`) |
| `BILLING_PRO_MONTHLY_LIMIT` | Gerações/mês do plano Pro (padrão `100`) |
| `BILLING_ULTIMATE_MONTHLY_LIMIT` | Gerações/mês do plano Ultimate (padrão `500`) |
| `PG_POOL_MAX` | Conexões por instância do pool (padrão `5`) |
| `RESEND_API_KEY` | Chave do Resend (e-mails de recuperação de senha). **Vazia** = link impresso no log do servidor (dev/local) |
| `EMAIL_FROM` | Remetente dos e-mails (padrão `CrIA Treino <onboarding@resend.dev>`) |

Variáveis obrigatórias são validadas no boot (`src/lib/env.ts`): em produção um
deploy sem `AUTH_SECRET`/`DATABASE_URL` falha no log de inicialização em vez de
virar 500 silencioso.

### Provedor de IA gratuito (Groq)

O app conversa com a API da OpenAI, então qualquer endpoint compatível serve.
Para exercitar o caminho **AI** sem cartão de crédito:

1. Crie a chave em <https://console.groq.com/keys> (plano gratuito, sem cartão);
2. no `.env`:

```bash
OPENAI_API_KEY="gsk_..."
OPENAI_BASE_URL="https://api.groq.com/openai/v1"
OPENAI_MODEL="openai/gpt-oss-120b"   # ou openai/gpt-oss-20b, qwen/qwen3.8-27b
```

Sem `OPENAI_API_KEY` o gerador usa o **modo simulado** (regras locais, sem rede).
Se o provedor recusar `response_format: json_schema`, o código repete
automaticamente em `json_object` com a schema no prompt.

> Após editar o `.env`, aguarde o dev server recarregar antes de rodar os testes.
> Diagnóstico isolado do caminho de geração: `npx tsx scripts/probe-ai.ts`.

## Scripts

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção (prisma generate + next build)
npm run start        # produção
npm run lint         # ESLint
npm run test         # typecheck (tsc) + lint
npm run db:generate  # regenera o Prisma Client (src/generated/prisma)
npm run db:migrate   # cria/aplica migrações locais (prisma migrate dev)
npm run db:deploy    # aplica migrações pendentes (prisma migrate deploy)
npm run db:seed      # seed: exercícios + usuários demo (omitidos em produção)
npm run db:studio    # Prisma Studio
npm run test:e2e     # smoke test E2E de API/pages (exige `npm run dev` ativo)
npm run test:ui      # testes de UI no browser headless (Playwright)
npm run test:billing        # smoke do webhook Stripe (assinatura sintética + planos)
npm run test:billing:checkout  # checkout E2E contra a API real do Stripe (teste)
npm run stripe:setup  # cria produto/preço dos 3 planos e grava STRIPE_PRICE_ID_* no .env
npx tsx scripts/probe-ai.ts   # diagnóstico: 1 chamada real ao provedor de IA
```

### Smoke test E2E

`scripts/e2e.mjs` percorre o fluxo completo via HTTP — login, lista de alunos,
geração (modo simulado), revisão (remoção + substituição), salvamento, os dois
caminhos de exportação (dono direto e `Assignment`), download do PDF, permissões,
páginas SSR e i18n (52 verificações).

```bash
npm run dev                    # terminal 1
npm run test:e2e               # terminal 2 (BASE=http://localhost:3000)
BASE=http://192.168.1.10:3000 npm run test:e2e   # se o servidor estiver em outra interface
```

### Testes de UI (Playwright)

`tests/wizard.spec.ts` exercita o fluxo num Chromium headless: login → wizard
(4 etapas) → geração → revisão (checklist, substituição, remoção) → finalização →
download do PDF → envio para aluno, além de redirecionamento de rotas protegidas,
404 localizado e troca de idioma. Uma configuração é idempotente: roda de novo
sobre o mesmo banco sem depender do estado deixado pela execução anterior.

```bash
npx playwright install chromium   # uma vez
npm run dev                       # terminal 1
npm run test:ui                   # terminal 2 (BASE_URL=http://localhost:3000)
```

### Testes de billing (Stripe)

Dois smoke tests dedicados (ambos exigem servidor ativo; use `BASE`/`BASE_URL`
para outra porta):

- `npm run test:billing` — assina eventos de webhook sintéticos com o mesmo
  HMAC do Stripe (`STRIPE_WEBHOOK_SECRET` do `.env`) e valida: rejeição de
  assinatura ausente/inválida, ativação por `metadata.plan`, troca de plano
  pelo preço da assinatura, guarda anti-downgrade com preço não mapeado,
  volta para `FREE` no cancelamento, limites de cota por plano (20/100/500/3)
  e evento de usuário inexistente sem 500. Restaura o professor demo ao final.
- `npm run test:billing:checkout` — roda contra a **API real do Stripe em modo
  teste**: cria sessão de Checkout (preço/metadata conferidos), 400 para plano
  inválido, 409 `samePlan` e upgrades BASIC → PRO → ULTIMATE **na mesma
  assinatura** (prorata, sem duplicar cobrança). Apaga o customer/assinatura
  de teste ao final.

Sem chaves Stripe no `.env`, os testes saem com instrução (`stripe:setup`).

## Estrutura

```
prisma/
  schema.prisma          # modelos: User, AthleteProfile, Workout, WorkoutDay,
                         #          WorkoutExercise, Exercise, Assignment
  seed.ts                # seed (catálogo + usuários demo)
  seed-data/exercises.ts # 101 exercícios (PT-BR/EN, grupo muscular, equipamento, avisos)
messages/                # mensagens i18n (pt-BR.json, en-US.json)
src/
  proxy.ts               # Next 16: i18n + proteção de rotas (antes era middleware)
  i18n/                  # routing, navigation (Link/useRouter com idioma), request config
  components/
    wizard/              # WorkoutWizard (4 etapas), ProfileForm, ReviewStep (checklist)
    ...
  lib/
    auth/                # jwt (cookie) + session (next/headers) + password (bcrypt)
    workout/
      generate.ts        # orquestrador: OpenAI ou simulado
      ai.ts              # prompt + JSON schema strict + validação/repair
      simulator.ts       # fallback por regras (splits, séries/reps/descanso)
      catalog.ts         # catálogo filtrado por equipamento / alternativas
      pdf.ts             # montagem do PDF (jsPDF + autotable)
    types.ts             # tipos, enums e schemas Zod compartilhados
  app/
    [locale]/            # páginas: landing, login, register, dashboard,
                         #          students, workouts/new, workouts/[id]
    api/                 # auth, students, profiles, workouts (CRUD/generate/assign/pdf),
                         #      exercises
```

## Fluxo detalhado

1. **Wizard (`/workouts/new`)** — escolha do atleta (eu/aluno/novo aluno), formulário de
   medidas + questionário (objetivo, limitações, dias/semana, duração, experiência,
   equipamentos), resumo e geração.
2. **Geração** — `POST /api/workouts/generate`: monta o prompt com o perfil e o catálogo
   filtrado pelos equipamentos disponíveis; a OpenAI responde com JSON schema *strict*
   (`days` = dias/semana, slugs só do catálogo); o plano é validado/reparado
   (slugs inválidos removidos, limite de dias/exercícios). Sem chave → `simulator.ts`.
3. **Revisão com checklist** — cada exercício pode ser marcado como
   “não posso manutar” e **substituído** por alternativas do mesmo grupo muscular
   (filtros: equipamentos disponíveis, avisos/contraindicações visíveis) ou **removido**;
   progresso “X de Y revisados”; opção de gerar novamente.
4. **Finalizar** — `POST /api/workouts` grava Workout/WorkoutDay/WorkoutExercise
   (guardando `replacedFromId` do exercício original).
5. **Compartilhar** — página do treino permite **enviar para aluno**
   (`POST /api/workouts/[id]/assign`, cria `Assignment` e vincula o aluno ao professor)
   e **exportar PDF** (`GET /api/workouts/[id]/pdf`).

## Segurança

- Senhas com bcrypt; sessão em JWT httpOnly (7 dias) assinado com `AUTH_SECRET`.
- **Recuperação de senha**: token de 256 bits com validade de 30 min, guardado
  **só como hash SHA-256** no banco e de uso único (consumo condicional atômico).
  Resposta `200` sempre igual, exista a conta ou não (anti-enumeração).
- **Troca de senha derruba as sessões**: `User.sessionVersion` incrementa no
  reset (e na troca pelo painel admin) e o `getSession()` compara com a versão
  embutida no JWT — cookies antigos passam a valer `null` (fail-closed).
- `src/proxy.ts` redireciona rotas protegidas (`/dashboard`, `/workouts`, `/students`).
- Toda rota de API **também** valida a sessão e as permissões (auto do professor/aluno,
  visibilidade do treino: dono, criador ou assignment) — não depende só do proxy.
- Perfis e alunos só são acessíveis/geráveis pelo professor vinculado.
- **CSP com nonce por requisição** nas páginas (produção): `script-src` com
  nonce + `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri`/`form-action 'self'` — aplicada no `proxy.ts`; em dev fica
  desligada para não quebrar o HMR.
- **Rate limiting** persistido no Postgres (`src/lib/rate-limit.ts`): login
  20/min por IP e 5/15min por e-mail, cadastro 10/h por IP, geração 10/min por
  IP. O IP vem da **última** entrada do `X-Forwarded-For` (a anexada pelo
  proxy de confiança — a primeira seria forjável).
- **Cota de gerações** atômica no banco (`src/lib/billing/quota.ts`): reserva
  `INSERT...WHERE count < limit` (sem corrida), `402 quotaExceeded` com status
  para a UI, estorno em falha de geração.
- **CSRF de login**: `Origin`/`Referer` precisam bater com a origem efetiva
  (Host da conexão + `X-Forwarded-Proto`; `X-Forwarded-Host` é ignorado por
  ser forjável) nas rotas de login/cadastro/**recuperação**. `Origin: "null"`
  (iframe sandbox) é recusado quando o navegador envia `Sec-Fetch-*`.
- **Role check**: geração e criação de treino exigem `PROFESSOR` (403 caso
  contrário).
- Cabeçalhos de segurança em todas as respostas via `next.config.ts`
  (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS
  em produção).
- Redirecionamento pós-login aceita apenas caminhos internos (`safeNextPath`).
- Texto livre do atleta é truncado no prompt da IA (superfície de prompt
  injection), e a saída só aceita slugs do catálogo.
- `src/lib/env.ts` valida `AUTH_SECRET`/`DATABASE_URL` no boot (falha cedo em
  produção); `GET /api/health` expõe o status do banco para monitoramento.

## Faturamento (Stripe)

- Planos e gerações/mês (período mensal em UTC, dia 1):

  | Plano | Preço | Gerações/mês | Env do limite |
  | --- | --- | --- | --- |
  | FREE | — | 3 | `BILLING_FREE_MONTHLY_LIMIT` |
  | BASIC | R$ 8,90 | 20 | `BILLING_BASIC_MONTHLY_LIMIT` |
  | PRO | R$ 29,90 | 100 | `BILLING_PRO_MONTHLY_LIMIT` |
  | ULTIMATE | R$ 119,90 | 500 | `BILLING_ULTIMATE_MONTHLY_LIMIT` |

  Os preços são exibidos pela UI (`messages/*.json`); os valores cobrados vêm
  dos `STRIPE_PRICE_ID_*` — mantenha os dois em sincronia.
- Sem chaves Stripe, o sistema degrada: planos pagos escondidos e
  `/api/billing/checkout` responde `503 billingDisabled`.
- Checkout: `POST /api/billing/checkout` com `{ "plan": "BASIC" | "PRO" |
  "ULTIMATE" }`. FREE cria uma sessão de Checkout; assinante ativo troca o
  preço da mesma assinatura (prorata via Stripe).
- Webhook `/api/billing/webhook` verifica a assinatura (`STRIPE_WEBHOOK_SECRET`)
  e processa `checkout.session.completed`, `customer.subscription.updated` e
  `customer.subscription.deleted` para sincronizar `User.plan` (plano vem do
  metadata do checkout/preço da assinatura).
- Configuração local da CLI (opcional) — a partir da 1.5x o `--events` é
  obrigatório; copie o `whsec_` que ele imprime para o `STRIPE_WEBHOOK_SECRET`:

  ```bash
  stripe login   # pareamento único (abre o browser)
  stripe listen \
    --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted \
    --forward-to localhost:3000/api/billing/webhook
  ```

## Painel administrativo (`/admin`)

- Exclusivo da role `ADMIN` (enum `Role`; a proteção fica no layout
  `/admin/layout.tsx` + guard `requireAdmin()` em toda rota `/api/admin/*`).
  O `proxy.ts` exige sessão para `/admin`; quem não é ADMIN cai no `/dashboard`.
- Conta admin: `ediglebison@gmail.com` (promovida no banco:
  `UPDATE "User" SET role='ADMIN' WHERE email='ediglebison@gmail.com';`).
  Admin **mantém** as capacidades de professor (helper `canTeach()` em
  `src/lib/roles.ts`) — promoção de conta existente não quebra o uso atual.
  Como o JWT carrega a role, a promoção só aparece no navegador após novo login.
- Telas:
  - **Visão geral** (`/admin`): contagens (professores, alunos, treinos,
    atribuições, exercícios, gerações do mês, novos em 30 dias), receita MRR
    (valores lidos do Stripe quando configurado, senão referência em
    `src/lib/billing/prices.ts`) e cadastros recentes.
  - **Usuários** (`/admin/users`): busca/filtro por função e plano, uso da cota
    do mês, vínculos e edição (nome, email, função, plano, senha). Rebaixar a
    `ALUNO` desvincula os alunos do professor; `ADMIN`/`PROFESSOR` não pode ser
    aluno de ninguém. Não há exclusão de usuários. Alteração de plano é override
    manual no banco — a assinatura Stripe não é mexida aqui.
  - **Assinaturas** (`/admin/subscriptions`): status ao vivo do Stripe (status,
    valor, renovação, agendamento de cancelamento), link direto para o cliente
    no dashboard do Stripe e ações **Agendar cancelamento** / **Reativar**
    (`cancel_at_period_end`; o webhook devolve a FREE no fim do período).
  - **Exercícios** (`/admin/exercises`): CRUD do catálogo (slug kebab-case,
    nomes PT/EN, grupo, equipamento, músculos secundários, avisos). Exclusão é
    bloqueada com `409 inUse` enquanto o exercício estiver em algum treino.
  - **Configurações** (`/admin/settings`): limites de cota editáveis — gravados
    na tabela `AdminSetting` com fallback para o `.env`
    (`BILLING_*_MONTHLY_LIMIT`), cache de 15s invalidado na gravação, então o
    novo limite vale imediatamente para novas gerações. Mostra também o estado
    do billing (Stripe/webhook/preços).
- Como testar sem browser: crie uma conta ADMIN temporária (ou promova o
  `prof@criatreino.dev`), rode `npm run test:e2e` (a seção `[10b]` garante que
  anônimo leva `401` e professor leva `403` nas rotas admin) e reverta.

## Recuperação de senha

1. No login, **“Esqueceu a senha?”** → `/forgot-password` (email);
2. `POST /api/auth/forgot` cria o token (30 min, hash SHA-256) e envia o link
   `${APP}/[locale]/reset-password?token=...` por e-mail — resposta sempre
   `200 { ok: true }`, mesmo para email inexistente;
3. `/reset-password` troca a senha via `POST /api/auth/reset` (uso único);
4. sucesso incrementa `sessionVersion` → **todas as sessões abertas caem** e o
   login é redirecionado com o aviso “senha redefinida”.

E-mail: com `RESEND_API_KEY` o Resend entrega de verdade (`EMAIL_FROM` como
remetente; o domínio precisa estar verificado, senão use
`onboarding@resend.dev`, que só entrega para o dono da conta). **Sem chave o
link é impresso no log do servidor** como `[email:console]` — o fluxo inteiro
funciona em dev local. Rate limit: 10/10min por IP e 5/15min por email no
`forgot`; 10/10min por IP no `reset`.

## API (resumo)

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/api/auth/register` | Cadastro (name, email, password, role) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/forgot` | Pedido de recuperação (sempre 200 genérico) |
| POST | `/api/auth/reset` | Troca a senha pelo token (uso único, derruba sessões) |
| GET/POST | `/api/students` | Lista/cadastra alunos do professor |
| GET/PUT | `/api/profiles?userId=` | Lê/salva perfil do atleta |
| POST | `/api/workouts/generate` | Gera sugestão (IA ou simulado) — professor, cota 402 |
| GET/POST | `/api/workouts` | Lista/salva treinos (criação: professor) |
| GET | `/api/workouts/[id]` | Detalhe (dias + exercícios) |
| POST | `/api/workouts/[id]/assign` | Envia para aluno |
| GET | `/api/workouts/[id]/pdf` | Exporta PDF |
| GET | `/api/exercises?muscleGroup=&exclude=` | Alternativas de substituição |
| GET | `/api/billing/status` | Plano, cota usada/restante e reset |
| POST | `/api/billing/checkout` | Cria sessão de checkout Stripe |
| POST | `/api/billing/webhook` | Webhook Stripe (assinatura verificada) |
| PATCH | `/api/admin/users/[id]` | Edita cadastro — ADMIN |
| PUT | `/api/admin/settings/limits` | Limites de cota (número ou `null` = `.env`) — ADMIN |
| POST | `/api/admin/exercises` | Cria exercício do catálogo — ADMIN |
| PATCH/DELETE | `/api/admin/exercises/[id]` | Edita/exclui exercício — ADMIN |
| POST | `/api/admin/subscriptions/cancel` | Cancela (`cancel`)/reativa (`reactivate`) assinatura — ADMIN |
| GET | `/api/health` | Health check (200 ok / 503 banco fora) |

## Produção (Vercel + Postgres gerenciado)

1. **Banco** (Neon ou Supabase): criar o projeto e anotar o connection string —
   precisa de `?sslmode=require` (provedores gerenciados recusam conexão em claro).
2. **Migrações**: aplique uma vez a partir da sua máquina:
   `DATABASE_URL="..." npm run db:deploy` (em CI/Vercel, o mesmo comando antes
   do build). Nunca use `db:migrate` (dev) em produção.
3. **Seed**: `DATABASE_URL="..." npm run db:seed` — em produção semeia **só o
   catálogo** (contas demo omitidas; `SEED_DEMO=1` para forçar).
4. **Vercel**: importe o repositório (framework Next.js). Build = `npm run build`
   (já roda `prisma generate`), variáveis de ambiente do `.env.example` no
   painel, `AUTH_SECRET` com ≥32 caracteres.
5. **Stripe**: crie um produto com **3 preços recorrentes mensais** (BRL) —
   Basic R$ 8,90, Pro R$ 29,90 e Ultimate R$ 119,90 — preencha
   `STRIPE_SECRET_KEY` e os `STRIPE_PRICE_ID_{BASIC,PRO,ULTIMATE}`, e um
   endpoint de webhook apontando para `https://<domínio>/api/billing/webhook`
   com os eventos `checkout.session.completed`, `customer.subscription.updated`
   e `customer.subscription.deleted` — copie o `whsec_` para
   `STRIPE_WEBHOOK_SECRET`.
6. **Health**: configure um uptime em `GET /api/health` (200 = ok, 503 = banco).

## Próximos passos (app mobile)

A API REST acima é a base para o app mobile futuro: sessão por cookie JWT (ou bearer),
mesmos endpoints e payloads. Basta expor o mesmo backend (ou extrair para um
serviço próprio) e trocar o transporte da sessão.

## Aviso

O plano gerado é uma **sugestão** e não substitui avaliação de profissionais de saúde ou
educação física. Os avisos/contraindicações do catálogo (`warningPt`/`warningEn`) devem
ser respeitados — o gerador já filtra automaticamente exercícios incompatíveis com as
limitações declaradas.
