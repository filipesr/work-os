# Cockpit de saúde do time (home admin)

Doc de referência/operação. O **design** e o **plano de implementação** completos estão em
`docs/superpowers/specs/2026-07-21-admin-team-health-cockpit-design.md` e
`docs/superpowers/plans/2026-07-21-admin-team-health-cockpit.md`.

## O que é e por quê

A home admin (`/admin`) abre com um cockpit de **gestão por exceção**: em vez de listar tudo,
faz aparecer só o que precisa de ação — quem está sobrecarregado/ocioso, o que está envelhecendo
e o que está bloqueado. Ancorado em abordagens documentadas:

- **Métricas de fluxo (Vacanti, _Actionable Agile_)** — WIP, cycle time, throughput e **work item age**; o aging WIP é o sinal proativo nº1.
- **Lei de Little** — menos/visível WIP ⇒ menor tempo de ciclo.
- **Teoria das Restrições (Goldratt)** — o gargalo governa a vazão.
- **Making Work Visible (DeGrandis)** — os "5 ladrões do tempo" (excesso de WIP, trabalho negligenciado, bloqueios…).
- **Balanceamento de carga / 1:1 (Gallup; Google re:Work)** — visibilidade de carga por pessoa.

## Layout da página

`app/[locale]/(protected)/admin/page.tsx` — duas colunas (`lg:grid-cols-[minmax(0,1fr)_320px]`):

- **Esquerda:** 5 contadores (usuários/clientes/projetos/tarefas ativas/templates) + o cockpit (`AdminHealthSection`).
- **Direita (menu fixo, `lg:sticky`):** hub de navegação compacto (`NavItem`) + card de armazenamento NAS (`StorageBreakdown`).

`components/admin/AdminHealthSection.tsx` orquestra os 3 blocos, cada um em `<Suspense>` (streaming).

## Os 3 blocos

### 1. Balanço de carga — `components/admin/TeamLoadBalance.tsx` (+ `TeamLoadBalanceClient.tsx`)

- **Resumo:** total de colaboradores · sobrecarregados · ociosos · WIP mediano.
- **Filtro** (client): Todos / Sobrecarga / Ociosos / Ativos. Lista **rolável** (`max-h-80`).
- **Drill-down:** clicar num colaborador abre um **drawer** (`Dialog` Radix) com as etapas ativas dele — cada item mostra **Criada em**, **Atribuída em** e **Vencimento** (colorido por atraso) + link pra tarefa.

### 2. Envelhecendo / em risco — `components/admin/AgingQueue.tsx`

- Fila (top `QUEUE_LIMIT`) de etapas ativas estourando o SLA da etapa e/ou perto do prazo, ordenada por `agingRatio` desc.
- **Legenda no rodapé** explica SLA e o cálculo. "Ver todos" → `/reports/performance`.

### 3. Bloqueados & esperando — `components/admin/BlockedQueue.tsx`

- Fila (top `QUEUE_LIMIT`) de etapas `BLOCKED`, ordenada por severidade, mostrando **o que cada uma aguarda** (dependências não concluídas).

## Métricas, fórmulas e calibração

Constantes em **`lib/actions/team-health.ts`** (fáceis de ajustar):

| Constante                      | Valor | Uso                                                                                        |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------ |
| `OVERLOAD_CEILING`             | 8     | teto absoluto de etapas ativas → sempre sinaliza sobrecarga                                |
| `OVERLOAD_MARGIN`              | 3     | acima da mediana do time por esta margem → sobrecarga relativa                             |
| `OVERLOAD_RELATIVE_MIN_MEDIAN` | 2     | a regra relativa só vale se a mediana do time ≥ isto (evita falso positivo em time ocioso) |
| `IDLE_THRESHOLD`               | 1     | `count <=` isto → ocioso                                                                   |
| `DEFAULT_SLA_HOURS`            | 72    | SLA usado quando a etapa não tem `expectedDurationHours`                                   |
| `AGING_ALERT_RATIO`            | 1.0   | `ageHours/slaHours >=` isto → envelhecendo                                                 |
| `QUEUE_LIMIT`                  | 6     | itens no topo das filas de aging/bloqueados                                                |

- **Carga (WIP):** `count` = etapas `ACTIVE` atribuídas; quebra por prazo via `getDueState` (`lib/dates.ts`); **sobrecarregado** = `count >= OVERLOAD_CEILING || (median >= OVERLOAD_RELATIVE_MIN_MEDIAN && count >= median + OVERLOAD_MARGIN)`; **ocioso** = `count <= IDLE_THRESHOLD`. O badge "Ocioso" some quando ociosos são maioria (deixa de ser exceção).
- **Aging:** `ageHours = agora − activatedAt`; `slaHours = stage.expectedDurationHours ?? 72`; entra se `ageHours/slaHours >= 1` **ou** o prazo está vencido/próximo.
- **Bloqueio:** severidade = tempo desde `blockedAt` (fallback `activatedAt` p/ linhas antigas); `waitingOn` = pré-requisitos (`StageDependency`) não `COMPLETED` na task.
- **Atribuição (drawer):** "Atribuída em" = `assignedAt` (fallback `activatedAt`). `blockedAt`/`assignedAt` são carimbados ao ENTRAR no estado (transição→BLOCKED em `activateNextStages`; assign/claim/create-com-assignee).

## Camada de dados

`lib/actions/team-health.ts` (módulo server-only, **sem `"use server"`** — exporta constantes/tipos):
`getTeamMemberLoad`, `getAgingStages`, `getBlockedStages`, `median`, `resolveTeamIds`.
`lib/actions/member-drill.ts` (**`"use server"`**, callable do client): `getMemberActiveStages(userId)`.

- Todas exigem `requireManagerOrAdmin()`.
- **Escopo fail-closed:** ADMIN vê todos os times; MANAGER só os seus (`resolveTeamIds`). Escopo vazio → `in: []` → nada vaza. O drill (`getMemberActiveStages`) verifica que o alvo é membro de um time do gestor antes de retornar as tarefas.
- Helpers puros em `lib/team-health-format.ts` (`formatAge`, `loadSegments`, tipo `MemberStage`).

## i18n

Namespace `admin.health.*` em `locales/{pt-BR,es-ES}/admin.json`, mantido em paridade pelo guard
`__tests__/i18n/locale-parity.test.ts`. Sem strings hardcoded; datas via `lib/dates` / `lib/date-locale`.

## Testes

- Unit (vitest): `__tests__/lib/actions/team-health.test.ts` (mediana, sobrecarga/ocioso, aging ratio + SLA default, `waitingOn`, RBAC) e `__tests__/lib/actions/member-drill.test.ts` (RBAC + fail-closed + campos de data).
- Helpers puros: `__tests__/lib/team-health-format.test.ts`.
- Guard i18n: `__tests__/i18n/locale-parity.test.ts`.

## Pendências / próximos passos

- **A. Smoke — camada de dados ✅ (read-only, banco real):** os 3 blocos + drawer foram rodados contra o banco de produção e computam corretamente (colunas novas, backfill, `assignedAt` no drawer). **Falta só o visual autenticado** (login Google): abrir `/admin` como ADMIN/MANAGER, conferir pixels/estados vazios/filtro e trocar para es-ES. Auth é Google-only com sessão no banco — headless exigiria cunhar sessão (não feito em prod). Promovível a E2E Playwright com sessão semeada num DB de dev.
- **B. ✅ Fase 2 (schema) — implementada e aplicada** — `blockedAt` e `assignedAt` em `TaskActiveStage`, carimbados nas transições; migração `20260721120000` + backfill de `activatedAt` **aplicados**. Timestamps exatos ativos (o fallback `?? activatedAt` cobre só eventuais linhas pré-backfill).
- **C. Calibração — parcial ✅:** #1 regra relativa só com mediana ≥ `OVERLOAD_RELATIVE_MIN_MEDIAN` e #2 badge "Ocioso" some quando maioria — **aplicados** (validados no banco real: 0 falsos positivos). **Ainda em aberto:** SLA default (72h), filtro default (`"all"` vs `"overloaded"`), largura do menu (320px) vs storage — decidir olhando `/admin` com o time.
- **D. Minors não-bloqueantes:** `getAgingStages` sem tiebreak de `dueDate` (ordem indeterminada em ratios iguais); teste de `getBlockedStages` usa 1 task (adicionar fixture com 2 tasks p/ blindar a chave por-task).
- **E. Escopo RBAC (nota):** aging/blocked escopam por `stage.defaultTeamId` (time dono da etapa) vs carga por member-team — defensável por design.
- **F. i18n residual:** título hardcoded do `StorageBreakdown` em `admin/page.tsx`; `sr-only "Close"` do `components/ui/dialog.tsx`.
- **G. Cobertura de teste:** `TeamLoadBalanceClient` e os Server Components do cockpit não têm smoke RTL (só data functions + helpers puros).
- **H. Fase 2 (produto) — parcial ✅:** **dashboard pessoal "Meu foco"** (Personal Kanban) implementado (commit `78afa5a`) — reusa `getMyFocus`/`stageAgingRatio` com o mesmo cálculo, escopado a `assigneeId=eu`: resumo (meu WIP · envelhecendo · em risco) + nudge leve de WIP + lista "precisa de atenção" + KPI de aging no StatsCards + flag ⏳ nas minhas etapas. **Ainda:** bloco de **throughput/CFD** (despriorizado; dados via `getTeamThroughput`).
