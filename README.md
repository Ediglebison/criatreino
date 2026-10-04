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

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Connection string do PostgreSQL |
| `AUTH_SECRET` | Segredo do JWT da sessão (`openssl rand -base64 32`) |
| `OPENAI_API_KEY` | Se **vazia**, o gerador cai para o **modo simulado** (regras locais) |
| `OPENAI_MODEL` | Modelo usado (padrão `gpt-4o-mini`) |
| `OPENAI_BASE_URL` | Endpoint compatível com OpenAI (Groq, OpenRouter, Gemini, Ollama…). Vazio = `api.openai.com` |
| `NEXT_PUBLIC_APP_URL` | URL pública do app |

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
npm run build        # build de produção
npm run start        # produção
npm run lint         # ESLint
npm run db:generate  # regenera o Prisma Client (src/generated/prisma)
npm run db:migrate   # cria/aplica migrações (prisma migrate dev)
npm run db:seed      # seed: exercícios + usuários demo
npm run db:studio    # Prisma Studio
npm run test:e2e     # smoke test E2E de API/pages (exige `npm run dev` ativo)
npm run test:ui      # testes de UI no browser headless (Playwright)
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
- `src/proxy.ts` redireciona rotas protegidas (`/dashboard`, `/workouts`, `/students`).
- Toda rota de API **também** valida a sessão e as permissões (auto do professor/aluno,
  visibilidade do treino: dono, criador ou assignment) — não depende só do proxy.
- Perfis e alunos só são acessíveis/geráveis pelo professor vinculado.

## API (resumo)

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/api/auth/register` | Cadastro (name, email, password, role) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET/POST | `/api/students` | Lista/cadastra alunos do professor |
| GET/PUT | `/api/profiles?userId=` | Lê/salva perfil do atleta |
| POST | `/api/workouts/generate` | Gera sugestão (IA ou simulado) |
| GET/POST | `/api/workouts` | Lista/salva treinos |
| GET | `/api/workouts/[id]` | Detalhe (dias + exercícios) |
| POST | `/api/workouts/[id]/assign` | Envia para aluno |
| GET | `/api/workouts/[id]/pdf` | Exporta PDF |
| GET | `/api/exercises?muscleGroup=&exclude=` | Alternativas de substituição |

## Próximos passos (app mobile)

A API REST acima é a base para o app mobile futuro: sessão por cookie JWT (ou bearer),
mesmos endpoints e payloads. Basta expor o mesmo backend (ou extrair para um
serviço próprio) e trocar o transporte da sessão.

## Aviso

O plano gerado é uma **sugestão** e não substitui avaliação de profissionais de saúde ou
educação física. Os avisos/contraindicações do catálogo (`warningPt`/`warningEn`) devem
ser respeitados — o gerador já filtra automaticamente exercícios incompatíveis com as
limitações declaradas.
