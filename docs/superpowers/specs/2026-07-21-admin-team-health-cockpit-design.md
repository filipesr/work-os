# Design — Cockpit de gestão de time na home admin

- **Data:** 2026-07-21
- **Status:** Aprovado para plano de implementação
- **Escopo:** Dashboard admin (`app/[locale]/(protected)/admin/page.tsx`)
- **Fora de escopo:** dashboard pessoal (fase futura), throughput/CFD, limites de WIP _enforced_, capacidade em horas

## 1. Contexto e problema

A home admin hoje é uma **página de atalhos**: 5 contadores crus (usuários, clientes, projetos, tarefas ativas, templates) + hub de navegação + storage NAS. Não há **nenhum sinal de gestão** de tempo/pessoas.

A análise existe, mas **escondida em `/reports`** (gargalos, on-time, horas, carga por time, SLA), exigindo que o gestor saia da home e navegue. Três sinais acionáveis de gestão **não existem em lugar nenhum como decisão do dia a dia**:

- **Carga por pessoa** — só existe carga por _time_ (`getTeamCurrentLoad`) e a auto-visão do colaborador. O gestor não enxerga quem está sobrecarregado/ocioso.
- **Aging (tempo parado na etapa)** — `activatedAt`/`enteredAt` existem, mas nada calcula "há quanto tempo isso está na etapa". O único sinal de risco é por _prazo_.
- **Bloqueios** — `getTeamBlockedStages()` existe (`lib/actions/task.ts:1186`) mas **está órfão**, não plugado em nenhuma tela.

**Objetivo:** transformar a home admin num _cockpit_ onde o gestor vê e age sobre **carga das pessoas, trabalho envelhecendo e trabalho bloqueado** — sem sair da página.

## 2. Metas e não-metas

**Metas**

- Balancear carga: mostrar carga por pessoa, destacando sobrecarregados e ociosos (base para 1:1 e redistribuição).
- Antecipar atrasos: fila de itens em voo envelhecendo (tempo-na-etapa acima do SLA) e/ou perto do prazo.
- Desbloquear: fila de itens bloqueados, ordenada por severidade, mostrando o que estão aguardando.

**Não-metas (agora)**

- Throughput/tendência/CFD (não priorizado).
- Limites de WIP _enforced_, capacidade em horas/disponibilidade.
- Dashboard pessoal (fase futura, reusando os mesmos cálculos).

## 3. Abordagens documentadas (justificativa)

- **Métricas de fluxo — Vacanti, _Actionable Agile Metrics for Predictability_:** WIP, cycle time, throughput e **work item age**. O **aging WIP** é o sinal proativo nº1 (ver o que envelhece antes de atrasar). → fila de aging.
- **Lei de Little (WIP = throughput × cycle time):** menos/visível WIP ⇒ menor tempo de ciclo. → carga por pessoa como WIP.
- **Teoria das Restrições (Goldratt):** o gargalo governa a vazão. → destacar itens estourando o SLA da etapa.
- **Making Work Visible (DeGrandis) — "5 ladrões do tempo":** excesso de WIP, trabalho negligenciado/envelhecido, dependências/bloqueios. → aging + blocked + carga.
- **Balanceamento de carga & 1:1 (Gallup; Google re:Work):** visibilidade de carga por pessoa previne burnout e embasa conversas de gestão. → balanço de carga.

## 4. Métricas e definições

Constantes (em `lib/actions/team-health.ts`, fáceis de ajustar):

```
OVERLOAD_CEILING   = 8    // teto absoluto de etapas ativas → sempre sinaliza sobrecarga
OVERLOAD_MARGIN    = 3    // acima da mediana do time por esta margem → sobrecarga relativa
IDLE_THRESHOLD     = 1    // <= isto → ocioso (candidato a receber trabalho)
DEFAULT_SLA_HOURS  = 72   // 3 dias, usado quando a etapa não tem expectedDurationHours
AGING_ALERT_RATIO  = 1.0  // ageHours/slaHours >= isto → envelhecendo
QUEUE_LIMIT        = 6     // itens no topo de cada fila (+ "ver todos")
```

**Carga por pessoa** (WIP baseado em etapas ATIVAS atribuídas):

- `count` = nº de `TaskActiveStage` com `status = ACTIVE` e `assigneeId = user`.
- Quebra por risco de prazo da task: `onTrack | dueSoon | overdue` via `getDueState(task.dueDate)` (reusa `lib/dates.ts`).
- `median` = mediana de `count` entre os membros dos times no escopo (inclui quem tem 0).
- **Sobrecarregado** = `count >= OVERLOAD_CEILING` **OU** `count >= median + OVERLOAD_MARGIN`.
- **Ocioso** = `count <= IDLE_THRESHOLD`.

**Aging / em risco** (etapas em voo):

- Candidatos: `TaskActiveStage.status = ACTIVE` nos times do escopo.
- `ageHours = now − activatedAt`; `slaHours = stage.expectedDurationHours ?? DEFAULT_SLA_HOURS`; `agingRatio = ageHours / slaHours`.
- Entra na fila se `agingRatio >= AGING_ALERT_RATIO` **OU** `getDueState(task.dueDate) ∈ {overdue, dueSoon}`.
- Ordenação: `agingRatio` desc, desempate por `dueDate` asc. Cada card exibe idade + múltiplo do SLA (ex.: "há 3d — 2,0× o SLA") e badge de prazo quando aplicável.

**Bloqueados** (proxy de severidade — ver §7 sobre `blockedAt`):

- Candidatos: `TaskActiveStage.status = BLOCKED` nos times do escopo (generaliza `getTeamBlockedStages` p/ múltiplos times).
- Severidade = `now − activatedAt` (tempo na etapa; proxy, já que não há `blockedAt`).
- "Aguardando": as etapas de que esta depende (`StageDependency`, relação `dependsOn`) cujo `TaskActiveStage` correspondente **não está COMPLETED** para a mesma task. Exibe os nomes dessas etapas.
- Ordenação: severidade desc.

## 5. Camada de dados — `lib/actions/team-health.ts` (novo)

Todas `"use server"`, `requireManagerOrAdmin()`, e **escopadas por time**: `teamIds` = times do usuário atual (`getSessionUser().teams`); se `ADMIN`, todos os times, com filtro opcional `?team=`. (Premissa a validar: gestores são membros dos times que gerenciam — ver §9.)

- `getTeamMemberLoad(teamIds): Promise<MemberLoad[]>` — por membro: `{ user, count, onTrack, dueSoon, overdue, overloaded, idle }`. Reusa o padrão de `getTeamCurrentLoad` (`reporting.ts:871`).
- `getAgingStages(teamIds): Promise<AgingItem[]>` — itens ACTIVE que batem o critério de aging/risco, já ordenados; `{ task, stage, assignee, ageHours, slaHours, agingRatio, dueState }`.
- `getBlockedStages(teamIds): Promise<BlockedItem[]>` — itens BLOCKED, ordenados por severidade; `{ task, stage, assignee, ageHours, waitingOn: string[] }`.

Reusa: `expectedDurationHours` (SLA, `schema.prisma:225`), `todayInSaoPaulo`/`daysUntil`, `getDueState`, `status-styles`, `formatDisplayDate`. Índices já existentes cobrem os filtros (`@@index([assigneeId, status])`, `@@index([status])`).

## 6. UI — 3 blocos na home admin

Ordem na página: **cockpit primeiro** (as 3 filas), depois os 5 contadores + hub (condensados, permanecem).

1. **Balanço de carga** (`components/admin/TeamLoadBalance.tsx`) — uma linha por pessoa: nome + barra empilhada `onTrack/dueSoon/overdue` (cores de `status-styles`) + total; badge **Sobrecarga** (vermelho) / **Ocioso** (cinza). Ordena por `count` desc. Clique na pessoa → `/admin/tasks?assignee=<id>` (ou filtro equivalente).
2. **Envelhecendo / em risco** (`components/admin/AgingQueue.tsx`) — top `QUEUE_LIMIT`: `task · etapa · responsável · "há X (N× o SLA)"` + badge de prazo. Clique → tarefa. "Ver todos" → `/reports/performance` (gargalos).
3. **Bloqueados & esperando** (`components/admin/BlockedQueue.tsx`) — top `QUEUE_LIMIT`: `task · etapa · responsável · "aguardando: [etapas]" · há X na etapa`. Clique → tarefa.

Estado vazio explícito por bloco (ex.: "Ninguém sobrecarregado 🎉", "Nada bloqueado"). Orquestrador `AdminHealthSection` agrupa os três.

## 7. Arquitetura

- **Server Components + `<Suspense>`** por bloco (streaming), seguindo o padrão dos reports; skeletons próprios. Reusa `StatCard`, badges, formatadores.
- Monta em `admin/page.tsx` acima dos contadores.
- **i18n:** novo namespace `admin.health.*` em `locales/{pt-BR,es-ES}/admin.json`, mantido em paridade (o teste `__tests__/i18n/locale-parity.test.ts` cobre). Sem strings hardcoded (usa `t()`; datas via `@/lib/date-locale`).
- **`blockedAt` (fase 2, opcional):** para duração precisa de bloqueio, adicionar `blockedAt DateTime?` em `TaskActiveStage` e setá-lo na transição para `BLOCKED` (`lib/actions/stage-assignment.ts`). Fase 1 fica no proxy `activatedAt`.

## 8. Faseamento

- **Fase 1 (este plano):** `lib/actions/team-health.ts` (3 funções) + 3 componentes + montagem na home admin + i18n + testes. Proxy de bloqueio via tempo-na-etapa.
- **Fase 2 (opcional, futuro):** migração `blockedAt`; limiar de aging configurável por template; espelhar os cálculos no dashboard pessoal (Personal Kanban).

## 9. Verificação e testes

- **Unit (vitest)** para `team-health.ts` com `@/auth` + `@/lib/prisma` mockados (padrão de `reporting.test.ts`): mediana/sobrecarga/ocioso; `agingRatio` com e sem SLA (default 72h); ordenações; RBAC (`requireManagerOrAdmin` rejeita MEMBER/unauth); escopo por time.
- **Smoke de render (RTL/jsdom)** dos 3 componentes com dados de fixture (inclui estados vazios).
- **Paridade i18n** 45/45 verde; **tsc 0**; **build limpo**.
- Fechamento: rodar o app e conferir os 3 blocos com dados de seed reais (fluxo end-to-end).

## 10. Riscos / questões em aberto

- **Premissa de escopo:** gestor vê "os times dele" = times dos quais é _membro_. Se a modelagem de "gerencia" divergir de "é membro", ajustar `teamIds`. Validar no seed/produção.
- **Sem `blockedAt`:** severidade de bloqueio é proxy (tempo-na-etapa), não tempo-bloqueado real. Aceito na fase 1; fase 2 corrige.
- **Mediana em times pequenos:** com poucos membros a mediana é instável; o **teto absoluto** (`OVERLOAD_CEILING`) garante um piso de sinal útil.
- **Custo de query do "aguardando":** resolver dependências pendentes por item bloqueado pode ser N+1; mitigar com `include` de `stage.dependsOn` + as etapas ativas da task numa consulta, ou aceitar fallback genérico ("aguardando etapas anteriores") se ficar caro.
