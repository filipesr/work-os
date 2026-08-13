# Auditoria de boas práticas Next.js — Work OS

**Data:** 2026-06-26
**Stack:** Next.js 15.1.11 (App Router) · React 19 · next-intl · NextAuth v5 · Prisma 6
**Origem:** anotação `melhores prática.md` ("analise as melhores práticas de NextJS —
https://github.com/Raullize/GuiaNextJS — e faça um levantamento do que podemos melhorar").

> Contexto: ferramenta **interna em fase de piloto**. Por isso SEO/Open Graph têm peso
> baixo, enquanto performance, type-safety e segurança têm peso alto. O resultado geral
> é **bom** — base sólida; os itens abaixo são refinamentos, não correções de arquitetura.

## O que já está correto (não mexer)

- `next/font/google` (Inter) no root layout — fontes otimizadas.
- `lib/env.ts` valida env com Zod na inicialização.
- Suspense streaming no `dashboard` e `reports/team-productivity`.
- `tsconfig` com `strict: true`; sem `@ts-ignore`/`@ts-expect-error`.
- Error boundaries (`error.tsx`/`global-error.tsx`) em boa cobertura.
- `lib/logger.ts` condiciona `console.log` a dev.
- `lucide-react` com imports nomeados (sem wildcard).
- `next.config.ts` com `reactStrictMode`, `poweredByHeader: false`, CSP, `remotePatterns`.

---

## Tier 1 — Maior valor / esforço razoável

### 1.1 Tipar os `any` nas Server Actions (type-safety)

19 ocorrências de `any` explícito, concentradas em `lib/actions/reporting.ts` (12×
`where: any` / `acc: any`), `lib/actions/task.ts` (4×, incl. `tx: any`),
`lib/actions/activity.ts` (2× `tx: any`).

- `tx: any` em `prisma.$transaction(async (tx) => …)` → usar `Prisma.TransactionClient`.
- `where: any` → usar `Prisma.TaskWhereInput` (e equivalentes por modelo).
- `acc: any` em reduces → tipar o acumulador.
- ESLint hoje só marca `no-explicit-any` como `warn`; após limpar, considerar subir para `error`.

### 1.2 Validar com Zod as Server Actions que faltam (segurança/robustez)

Hoje 3 de ~10 arquivos de action validam com Zod (`task`, `client`, `project`).
Sem schema: `reporting.ts`, `stage.ts` (extrai `formData.get(...) as string` cru),
`template.ts`, `dependency.ts`, `tv-activity.ts`. Server Actions são endpoints públicos
de fato — entrada não-validada é superfície de risco.

- Adicionar schemas em `lib/validations.ts` (seguir padrão `createTaskSchema`).
- Aplicar `safeParse` no início de cada action, retornando `{ error }` tipado.

### 1.3 Paralelizar waterfalls nas actions de task

`lib/actions/task.ts` tem `await` sequenciais que poderiam ser `Promise.all`:

- `unassignTask`: `task.findUnique` + `user.findUnique`.
- `completeTask`: idem.
- `completeStageAndAdvance`: `taskActiveStage.findUnique` + `user.findUnique`.
- `activateNextStages` / `checkAllDependenciesComplete`: `await` dentro de loop sobre
  dependências — avaliar batch (`findMany` único) em vez de N queries.

---

## Tier 2 — Bom retorno, escopo localizado

### 2.1 Suspense nos relatórios que faltam

`reports/productivity/page.tsx` e `reports/performance/page.tsx` fazem `Promise.all` de
3–4 queries e renderizam tudo de uma vez (usuário espera a query mais lenta). Espelhar o
padrão já existente em `reports/team-productivity/page.tsx` (cada widget em seu `<Suspense>`).

### 2.2 Avaliar `next/image` para avatares/imagens de perfil — **avaliado: não migrar agora**

Avaliação caso a caso concluída (2026-06-26). Veredito: **manter `<img>`** em todos
os casos por ora, pelos motivos abaixo. O ganho de `next/image` aqui é marginal e o
custo/risco não compensa numa ferramenta interna em piloto.

- **`components/ui/avatar.tsx` (`AvatarImage`)** — primitivo usado em 13 arquivos.
  Renderiza avatares circulares de **40px** roteados por `/api/proxy-image`, que existe
  justamente para contornar CORS/rate-limit das imagens do Google. Migrar o primitivo
  é a "troca em massa" que a auditoria desaconselha (raio de impacto em todos os
  avatares); exigiria `fill`+`sizes` e um ramo `unoptimized` para URLs `data:`. Ganho
  de otimização sobre miniaturas de 40px é desprezível. **Manter.**
- **`components/help/HelpFigure.tsx`** — screenshots de tutorial com **dimensões
  intrínsecas desconhecidas** e fallback via `onError` (mostra placeholder quando o
  print ainda não foi adicionado). `next/image` conflita com os dois padrões.
  `eslint-disable` deliberado e justificado. **Manter.**
- **`admin/users`, `admin/users/[userId]`, `admin/teams/[teamId]`, `tv/page.tsx`** —
  mesmos avatares de 40px proxied (estes emitem warning `no-img-element`). Dependem do
  proxy; trocar por `next/image` exigiria passar a URL crua + tratar hosts fora de
  `remotePatterns`/`data:`. Baixo valor. **Manter** (ou, se quiser zerar os warnings sem
  `next/image`, reusar o primitivo `<Avatar>` — churn próprio, fica para depois).

Reavaliar se/quando surgirem imagens grandes críticas de LCP (capas, banners, uploads
de alta resolução) — aí `next/image` passa a valer.

### 2.3 Cobertura de testes nas Server Actions críticas

977 linhas de teste hoje (bom para libs/validations/permissions), mas as actions de
mutação (`task.ts`, `project.ts`, `client.ts`) e componentes pesados (Kanban,
TaskDetailView) estão sem cobertura. Priorizar testes de auth-path + lógica das actions
de task (seguindo `__tests__/lib/actions/task-auth.test.ts` e `reporting.test.ts`).

---

## Tier 3 — Baixa prioridade (piloto interno)

### Feito (2026-06-26)

- **`loading.tsx`/`error.tsx` em rotas de topo** ✅ — adicionados `app/[locale]/loading.tsx`
  (spinner acessível), `app/[locale]/auth/signin/loading.tsx` (skeleton do card) e
  `app/[locale]/error.tsx` (boundary reusando `errors.general`). Antes só `(protected)`
  tinha esse par; o nível `[locale]` (landing/auth) ficava sem feedback/erro granular.
- **Middleware — fonte única de rotas protegidas** ✅ — lista extraída para
  `lib/routes.ts` (`PROTECTED_PATHS` + `isProtectedPath`), consumida por `middleware.ts`.
  Acabou a manutenção dupla.

### Adiado (com motivo)

- **CSP**: `script-src` usa `'unsafe-inline'` e `'unsafe-eval'` (`next.config.ts`).
  Endurecer com nonce/hash é trabalho real e arriscado (pode quebrar inline scripts do
  Next/next-intl). **Adiar para pós-piloto** — fazer junto de um teste de fumaça completo.
- **Metadata/SEO**: 24/33 páginas só herdam o `title` do template; sem `openGraph`.
  Ferramenta **interna atrás de auth** não é indexada — SEO/OG tem valor ~zero. O único
  ganho seria título de aba mais específico (baixo). **Adiar.**
- **Cache explícito**: nenhuma página declara `revalidate`/`dynamic`. Todas já são
  dinâmicas (auth + `searchParams`) e usam `revalidatePath` por mutação. Declarar cache
  explícito não traz ganho hoje e pode introduzir staleness sutil. **Não mexer** até haver
  gargalo medido.
- **Polling**: `reports/live-activity` e `tv/page.tsx` fazem polling a cada 10s via
  `useEffect`. Funciona bem na escala do piloto; SSE/WebSocket só compensa com muitos
  clientes simultâneos. **Adiar.**
- **`cloudinary` (SDK não importado)**: o pacote npm `cloudinary` está em `dependencies`
  mas **não é importado** em lugar nenhum. **Não remover** — há intenção clara de uso: as
  envs `CLOUDINARY_*` são **obrigatórias** em `lib/env.ts`, estão no `.env.example`, e
  `res.cloudinary.com` está liberado em CSP, `remotePatterns` e no allowlist do
  `/api/proxy-image`. A inconsistência real é env obrigatória para um SDK ainda não usado:
  **decidir** se vão (a) wirar uploads via SDK ou (b) afrouxar as envs para opcionais até lá.

---

## Registro de implementação

**Implementado** (commit deste levantamento):

- Tier 1.1 — eliminados os 19 `any` das Server Actions (`reporting.ts`, `task.ts`,
  `activity.ts`) com tipos `Prisma.*`.
- Tier 1.2 — validação Zod em `template.ts`, `stage.ts`, `dependency.ts`
  (schemas novos em `lib/validations.ts`); mensagens amigáveis para campo ausente/vazio.
- Tier 1.3 — `Promise.all` nos waterfalls de `unassignTask`, `completeTask`,
  `completeStageAndAdvance`, `unassignActiveStage` e `revertTaskStage`.
- Tier 1.3 (batch, 2026-07-01) — eliminados os 2 loops N+1 restantes em `task.ts`:
  `activateNextStages` batch-carrega as linhas pré-criadas dos dependentes num único
  `findMany` (era `findUnique` por dependente); o loop de atribuição de próximas etapas em
  `completeStageAndAdvance` batch-carrega os times num único `findMany` (era `findUnique`
  por etapa). Comportamento idêntico; testes de `activate-next-stages` ajustados aos 2
  `findMany` em ordem.
- Tier 2.1 — Suspense por widget em `reports/productivity` e `reports/performance`
  (com `cache()` para dedupe de queries compartilhadas).
- Tier 2.3 — testes novos: `__tests__/lib/actions/admin-actions-auth.test.ts` (+11) e
  schemas em `validations.test.ts` (+10).
- Tier 3 — `loading.tsx`/`error.tsx` de topo + `lib/routes.ts` (fonte única de rotas).

## Backlog — status

Atualizado em 2026-06-29 (release 2.2.0): a maior parte foi implementada.

| #   | Item                             | Tier | Status                                                                                                         |
| --- | -------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Migrar `<img>` → `next/image`    | 2.2  | ✅ N/A — não há `<img>` cru relevante (avatares via Radix/proxy). Item considerado satisfeito.                 |
| 2   | CSP com nonce/hash               | 3    | ✅ Feito — CSP por requisição no `middleware.ts` com nonce + `strict-dynamic`, sem `unsafe-inline` em scripts. |
| 3   | Metadata/OG por página           | 3    | ✅ Feito — `metadata` em `account`, `reports` e `admin/*` (8 páginas).                                         |
| 4   | `revalidate`/`dynamic` explícito | 3    | ✅ Feito — `dynamic = "force-dynamic"` no layout `(protected)`.                                                |
| 5   | Polling → SSE/WebSocket          | 3    | ✅ Feito — TV e live-activity via SSE (`/api/tv/stream`, `/api/live-activity/stream`) com fallback a polling.  |
| 6   | Decidir destino do `cloudinary`  | 3    | ✅ Feito — **removido** por completo (pacote, envs, hosts, `addFileArtifact`).                                 |
| 7   | Validação Zod em `reporting.ts`  | 1.2  | ✅ Feito — schemas em `lib/validations.ts`, `.parse()` em todas as funções com input.                          |
| 8   | Testes de componentes pesados    | 2.3  | ✅ Feito — `KanbanBoard` e `TaskDetailView` (Vitest).                                                          |

### Backlog de produto (release 2.2.0)

Do spec `docs/superpowers/specs/2026-06-19-calendar-and-team-productivity-design.md`,
seção "Fora de escopo / próximos passos":

- ✅ **SLA por etapa** (`expectedDurationHours`) + métrica No prazo/Acima na produtividade por equipe.
- ⛔️ **Drag-and-drop para reagendar** no calendário: removido (a semana é visualização e criação). `@dnd-kit/core` saiu das dependências.
- ✅ **Exportação CSV/PDF** (produtividade, performance, produtividade por equipe).
- ✅ **Relatório individual por colaborador** (`/reports/user/[userId]`).
- ⏳ **Notificação de "tarefa atrasada"** — adiada (requer infra de e-mail/cron; decisão do usuário).

---

## Follow-ups da feature de pré-criação de etapas (do code review)

Registrados aqui (versionado) a partir do review multi-agente da feature.

### Resolvidos (2026-06-26)

- Build quebrado: módulo `"use server"` exportava funções síncronas → helpers movidos
  para `lib/stage-assignment-helpers.ts`. **Lição:** o gate de verificação deve incluir
  `pnpm build`, não só `tsc` + testes.
- Bug da etapa inicial errada (template com dependências invertidas) → inicia a de menor
  ordem.
- Modal de avanço pré-preenche o responsável já definido na criação.
- `getBlockedDependencies` (dead code) removido; JSDoc do `StageAssigneeSelect` e
  comentário rascunho corrigidos.

### Resolvidos (2026-06-29)

- **`previewNextStages` × `activateNextStages`:** predicado comum extraído
  (`areAllPrerequisitesComplete` em `lib/stage-assignment-helpers.ts`); ambos os call-sites o usam.
- **N+1 em `previewNextStages`:** substituído por bulk-fetch (existentes + pré-requisitos +
  COMPLETED em 3 queries, checagem em memória).
- **`createTasksBatch`:** mensagens de erro movidas para `errors.batchCreate` (pt/es).
- **Toasts de `AdvanceStageButton`:** movidos para `tasks.stages.toasts` (pt/es).

### Abertos / inertes

- Migração adiciona `INACTIVE` no fim do enum — **inerte** (confirmado: nenhuma query
  ordena por status; todas as superfícies de dashboard/"minhas etapas" já excluem `INACTIVE`).

### Verificação pendente

- **Smoke manual** (`pnpm dev` + login Google): criar demanda, avançar etapa, reagendar no
  calendário (DnD), exportar CSV/PDF, abrir relatório individual, conferir SLA na
  produtividade por equipe. Automatizado (tsc/build/testes/lint) está verde; CSP-nonce e
  SSE foram validados em runtime via `curl`.
