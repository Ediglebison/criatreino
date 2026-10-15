# Feature Map

> Auto-maintained index of every user-facing feature and the code path that implements it. Updated alongside the code — not after the fact.

## Cadastro (registro)

Cria conta de professor ou aluno e já inicia a sessão.

**Flow:**

1. `src/app/[locale]/register/page.tsx` — página pública de registro
2. `src/components/AuthForm.tsx` — formulário (nome, e-mail, senha, papel); envia POST para `/api/auth/register`
3. `src/app/api/auth/register/route.ts` — valida com Zod, aplica rate limit por IP, cria o `User`
4. `src/lib/auth/password.ts` — hash da senha com bcrypt
5. `src/lib/auth/session.ts` — grava o cookie de sessão JWT httpOnly

---

## Login

Autentica e redireciona para o destino pedido (`next`).

**Flow:**

1. `src/app/[locale]/login/page.tsx` — página pública de login
2. `src/components/AuthForm.tsx` — envia POST para `/api/auth/login`
3. `src/app/api/auth/login/route.ts` — CSRF por Origin, rate limit por IP e por e-mail, verifica a senha
4. `src/lib/auth/password.ts` — compara com o hash bcrypt
5. `src/lib/auth/session.ts` — grava o cookie de sessão
6. `src/proxy.ts` — em requisições seguintes, rotas protegidas exigem a sessão e `next` é validado por `src/lib/safe-redirect.ts`

---

## Recuperação de senha

Pedido por e-mail com token de uso único; a troca derruba todas as sessões abertas.

**Flow:**

1. `src/app/[locale]/forgot-password/page.tsx` — coleta o e-mail
2. `src/components/ForgotPasswordForm.tsx` — envia POST para `/api/auth/forgot`
3. `src/app/api/auth/forgot/route.ts` — rate limit; resposta sempre `200` (anti-enumeração)
4. `src/lib/auth/reset.ts` — gera token de 256 bits e grava só o hash SHA-256
5. `src/lib/email.ts` — envia o link pelo transporte ativo (`SMTP_PASS` → Gmail SMTP, senão Resend, senão log do servidor)
6. `src/app/[locale]/reset-password/page.tsx` + `src/components/ResetPasswordForm.tsx` — troca a senha
7. `src/app/api/auth/reset/route.ts` — consome o token (uso único) e incrementa `User.sessionVersion`, invalidando cookies antigos

---

## Dashboard

Painel do usuário com estatísticas, resumo do plano, treinos recentes e alunos.

**Flow:**

1. `src/app/[locale]/dashboard/page.tsx` — contagens via Prisma, lista de treinos visíveis e cota do mês (professores)
2. `src/lib/billing/quota.ts` — cota do mês corrente (professores)
3. `src/app/[locale]/billing/page.tsx` — card-resumo aponta para a gestão completa de planos/assinatura

---

## Gestão de alunos

O professor cadastra e lista alunos vinculados (`User.role = ALUNO`, `professorId`).

**Flow:**

1. `src/app/[locale]/students/page.tsx` — lista os alunos do professor da sessão
2. `src/components/StudentManager.tsx` — busca, criação de aluno e contadores
3. `src/app/api/students/route.ts` — GET/POST; aluno existente sem professor é vinculado
4. `src/lib/db.ts` — acesso ao PostgreSQL via Prisma

---

## Wizard de treino — perfil do atleta

Formulário de medidas e questionário (objetivo, limitações, disponibilidade), salvo como perfil.

**Flow:**

1. `src/app/[locale]/workouts/new/page.tsx` — carrega alunos, perfil próprio e aluno pré-selecionado
2. `src/components/wizard/WorkoutWizard.tsx` — orquestra as etapas
3. `src/components/wizard/ProfileForm.tsx` — formulário do perfil e conversão payload/form
4. `src/app/api/profiles/route.ts` — GET/PUT; acesso restrito a si ou ao próprio professor
5. `src/lib/types.ts` — schema Zod `athleteProfileSchema`

---

## Geração de treino (IA ou simulado)

Sugestão de plano de treino a partir do perfil e do catálogo filtrado por equipamento.

**Flow:**

1. `src/components/wizard/WorkoutWizard.tsx` — etapa "gerar"; envia POST para `/api/workouts/generate`
2. `src/app/api/workouts/generate/route.ts` — sessão + papel, rate limit por IP, reserva de cota, orquestra a geração
3. `src/lib/billing/quota.ts` — reserva atômica (`402 quotaExceeded` sem cota; estorno em falha)
4. `src/lib/workout/catalog.ts` — catálogo filtrado pelos equipamentos do atleta
5. `src/lib/workout/generate.ts` — escolhe IA ou simulado conforme `OPENAI_API_KEY`
6. `src/lib/workout/ai.ts` — prompt, structured outputs (fallback `json_object`), validação e `repairDraft`
7. `src/lib/workout/simulator.ts` — fallback determinístico por regras (splits, séries/reps/descanso)

---

## Revisão com substituição de exercícios

Checklist para substituir (por alternativas do mesmo grupo) ou remover exercícios antes de finalizar.

**Flow:**

1. `src/components/wizard/ReviewStep.tsx` — checklist, remoção, substituição e "gerar novamente"
2. `src/app/api/exercises/route.ts` — alternativas por `muscleGroup` com `exclude`
3. `src/lib/workout/catalog.ts` — catálogo completo para a UI
4. `src/components/wizard/WorkoutWizard.tsx` — aplica substituições/remoções no draft antes de salvar

---

## Finalizar e salvar treino

Grava o plano revisado como `Workout` final com dias e exercícios.

**Flow:**

1. `src/components/wizard/WorkoutWizard.tsx` — etapa final; envia POST para `/api/workouts`
2. `src/app/api/workouts/route.ts` — valida o draft, remove removidos, resolve slugs no catálogo e cria `Workout`/`WorkoutDay`/`WorkoutExercise` (guarda `replacedFromId`)
3. `src/lib/workout/catalog.ts` — resolve slugs para ids
4. `src/lib/db.ts` — persistência via Prisma

---

## Ver treino

Página do treino com dias, exercícios, avisos e origem das substituições.

**Flow:**

1. `src/app/[locale]/workouts/[id]/page.tsx` — carrega o treino; visibilidade = dono, criador ou assignment
2. `src/lib/types.ts` — `exerciseName`/`exerciseWarning` conforme o locale
3. `src/app/[locale]/dashboard/page.tsx` — entra pela lista de treinos recentes

---

## Enviar treino para um aluno

O criador exporta o treino para a conta de um aluno, criando um `Assignment`.

**Flow:**

1. `src/components/AssignDialog.tsx` — lista alunos e envia a atribuição
2. `src/app/api/workouts/[id]/assign/route.ts` — valida criador, aluno e duplicatas; vincula o aluno ao professor se preciso
3. `src/app/[locale]/workouts/[id]/page.tsx` — o aluno vê o treino recebido (assinatura "do professor")

---

## Exportar PDF

Download do treino montado em PDF no servidor.

**Flow:**

1. `src/app/[locale]/workouts/[id]/page.tsx` — botão para `/api/workouts/[id]/pdf`
2. `src/app/api/workouts/[id]/pdf/route.ts` — monta os dados (visibilidade igual à página)
3. `src/lib/workout/pdf.ts` — jsPDF + jspdf-autotable; nome do arquivo slugificado

---

## Assinatura paga (Stripe)

Upgrade/change de plano Básico/Pro/Ultimate via Checkout ou troca de preço na assinatura ativa.

**Flow:**

1. `src/app/[locale]/billing/page.tsx` — página de planos (professor); renderiza o `BillingCard`
2. `src/components/BillingCard.tsx` — escolha do plano
3. `src/app/api/billing/checkout/route.ts` — cria sessão de Checkout ou atualiza a assinatura existente (prorata)
4. `src/lib/billing/stripe.ts` — cliente lazy; sem chaves responde `503 billingDisabled`
5. `src/app/[locale]/billing/page.tsx` — aviso `?billing=success|cancel`

---

## Cancelar ou reativar assinatura (autoatendimento)

O próprio professor agenda ou remove o cancelamento da própria assinatura (cancel_at_period_end).

**Flow:**

1. `src/app/[locale]/billing/page.tsx` — seção "Minha assinatura" com status ao vivo
2. `src/components/MySubscription.tsx` — ações cancelar/reativar com confirmação
3. `src/app/api/billing/cancel/route.ts` — aplica `cancel_at_period_end` na assinatura do usuário da sessão
4. `src/lib/billing/subscription.ts` — resumo e atualização da assinatura (compartilhado com a rota admin)
5. `src/app/api/billing/webhook/route.ts` — devolve o usuário a FREE quando o Stripe confirmar o fim

---

## Webhook do Stripe sincroniza o plano

Eventos do Stripe ativam, trocam ou rebaixam `User.plan`.

**Flow:**

1. `src/app/api/billing/webhook/route.ts` — verifica a assinatura HMAC (secret único ou lista por vírgula); entregas do destino v2 (envelope `v2.core.event`, ex.: ping) recebem ACK 200 sem processamento
2. `src/lib/billing/stripe.ts` — mapa preço → plano interno
3. `src/lib/db.ts` — `User.plan` e ids de customer/assinatura atualizados por `updateMany`

---

## Cota mensal de gerações

Cada plano tem limite de gerações/mês; a reserva é atômica no banco.

**Flow:**

1. `src/app/api/billing/status/route.ts` — plano, cota usada/restante e planos configurados (dashboard e wizard)
2. `src/lib/billing/quota.ts` — reserva `INSERT` condicional, settle (COMPLETED/FAILED) e auditoria
3. `src/lib/billing/settings.ts` — limite efetivo (override do admin em `AdminSetting`, fallback `.env`)
4. `src/lib/billing/limits.ts` — constantes por plano e período UTC

---

## Painel administrativo — visão geral

Métricas do produto, MRR e cadastros recentes (role `ADMIN`).

**Flow:**

1. `src/app/[locale]/admin/layout.tsx` — guard de sessão + papel ADMIN
2. `src/app/[locale]/admin/page.tsx` — contagens via Prisma e cálculo de MRR
3. `src/lib/billing/prices.ts` — preços reais do Stripe com fallback estático

---

## Painel administrativo — usuários

Busca, filtros e edição de cadastro (nome, e-mail, papel, plano, senha).

**Flow:**

1. `src/app/[locale]/admin/users/page.tsx` — lista usuários com consumo do mês e limites
2. `src/components/admin/AdminUsers.tsx` — filtros e modal de edição
3. `src/app/api/admin/users/[id]/route.ts` — `requireAdmin`; transação ajusta papel, vínculos e `sessionVersion`
4. `src/lib/auth/guard.ts` — guard compartilhado das rotas admin

---

## Painel administrativo — assinaturas

Status ao vivo no Stripe com agendamento de cancelamento e reativação.

**Flow:**

1. `src/app/[locale]/admin/subscriptions/page.tsx` — assinantes + status ao vivo do Stripe
2. `src/components/admin/AdminSubscriptions.tsx` — ações cancel/reactivate
3. `src/app/api/admin/subscriptions/cancel/route.ts` — `requireAdmin`; delega o `cancel_at_period_end` à lib
4. `src/lib/billing/subscription.ts` — atualização da assinatura Stripe (compartilhada com o autoatendimento)
5. `src/app/api/billing/webhook/route.ts` — devolve o usuário a FREE quando o Stripe confirmar o fim

---

## Painel administrativo — catálogo de exercícios

CRUD do catálogo usado pelo gerador e pela UI de substituição.

**Flow:**

1. `src/app/[locale]/admin/exercises/page.tsx` — lista com contagem de uso
2. `src/components/admin/AdminExercises.tsx` — busca, criação, edição e exclusão
3. `src/app/api/admin/exercises/route.ts` — cria (slug kebab-case, `409 slugTaken`)
4. `src/app/api/admin/exercises/[id]/route.ts` — edita; exclusão bloqueada com `409 inUse` se o exercício está em algum treino

---

## Painel administrativo — limites de cota

Edita os limites de gerações/mês por plano, com fallback para o `.env`.

**Flow:**

1. `src/app/[locale]/admin/settings/page.tsx` — estados atuais e estado do billing
2. `src/components/admin/AdminLimits.tsx` — edição dos quatro planos
3. `src/app/api/admin/settings/limits/route.ts` — `PUT`; número grava override, `null` limpa
4. `src/lib/billing/settings.ts` — persiste em `AdminSetting` e invalida o cache (15s)

---

## Idiomas pt-BR e en-US

Locale na URL (`/en-US/...`), pt-BR sem prefixo; mensagens em JSON com paridade verificada.

**Flow:**

1. `src/proxy.ts` — middleware next-intl: detecta/ redige o locale e protege rotas
2. `src/i18n/routing.ts` — locales, default e `localePrefix: as-needed`
3. `src/i18n/request.ts` — carrega `messages/<locale>.json` por requisição
4. `src/components/LangSwitcher.tsx` — troca o prefixo de idioma na URL
5. `scripts/check-i18n.mjs` — garante paridade de chaves entre os JSONs (roda no CI)

---

## Página 404 localizada

URLs desconhecidas caem em um 404 estilizado e traduzido.

**Flow:**

1. `src/app/[locale]/[...rest]/page.tsx` — catch-all chama `notFound()`
2. `src/app/[locale]/not-found.tsx` — página 404 com mensagens do locale

---
