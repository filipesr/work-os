# Métricas de fluxo & previsibilidade (P0)

Doc de referência das quatro features de fluxo/entrega adicionadas ao workos na
fase P0 do roadmap. Fundamentação e priorização em
[pesquisa-gestao-fluxo-e-pessoas.md](./pesquisa-gestao-fluxo-e-pessoas.md);
cockpit admin em [admin-team-health-cockpit.md](./admin-team-health-cockpit.md).

> **Estado:** implementado e commitado. A eficiência de fluxo e o CFD futuro
> dependem do log `StageTransition`, que **só acumula a partir da migração
> `20260721130000`** — o histórico anterior não tem o split ativo/bloqueado
> (não foi fabricada espera retroativa, por honestidade dos dados).

---

## 1. Eficiência de fluxo por etapa — P0.1

**O que é.** De todo o tempo em que uma etapa esteve "alcançada", que fração foi
`ACTIVE` (trabalho tocado) vs. `BLOCKED` (esperando dependência). Baixa
eficiência = a etapa passa a maior parte da vida parada esperando, não sendo
trabalhada — diagnóstico oposto de "a etapa é lenta".

**Por que Ship B (log de transições) e não aproximação.** O `blockedAt` em
`TaskActiveStage` é um campo único sobrescrito — não retém durações por período
entre ciclos de block/unblock/revert. A solução exata é registrar **cada entrada
de status** e reconstruir durações pareando transições consecutivas.

**Modelo de dados.** `StageTransition` (append-only):

| campo   | descrição                                           |
| ------- | --------------------------------------------------- |
| status  | o `ActiveStageStatus` em que a etapa ENTROU em `at` |
| at      | instante da entrada                                 |
| taskId  | tarefa                                              |
| stageId | etapa (template)                                    |

Índice `(taskId, stageId, at)` — toda reconstrução escopa por instância e ordena
por `at`.

**Fórmula.** `lib/stage-transitions.ts` (puro, testado):

- `statusDurations(rows, now)` — ms em cada status; pareia linhas consecutivas; a
  última linha acumula até `now`, **exceto** `COMPLETED` (terminal, não acumula).
- `flowEfficiencyRatio(active, blocked)` = `active / (active + blocked)`;
  retorna `null` quando não houve tempo alcançado (denominador 0 — indefinido,
  não 0%). `INACTIVE` (não alcançada) e `COMPLETED` são excluídos por construção.

**Fiação (5 sítios de transição).** `recordStageTransition`/`recordStageTransitions`
são chamados APÓS cada escrita de status, no mesmo client/transação:

1. `stage-assignment-helpers.ts` `createTaskStages` — criação (ACTIVE/INACTIVE).
2. `task.ts` `activateNextStages` — marca `COMPLETED` da etapa concluída.
3. `task.ts` `activateNextStages` — cada transição para `ACTIVE`/`BLOCKED`.
4. `task.ts` revert — reset em lote para `INACTIVE` (busca os stageIds afetados).
5. `task.ts` revert — reativação da etapa-alvo para `ACTIVE`.

**Agregação e superfície.** `reporting.getFlowEfficiencyByStage(filters)` agrupa
por instância (task+stage), soma `active`/`blocked` por template
(throughput-weighted) e ordena pior (menor eficiência) primeiro. Janela: com
filtro de data, só instâncias concluídas no período; sem filtro, toda instância
alcançada (incluindo abertas, que acumulam até agora). Card **"Eficiência de
Fluxo por Etapa"** em `/reports/performance` (verde ≥70%, âmbar 40–70%, vermelho
<40%).

**Caveat.** O "espera" canônico do Lean inclui fila/queue além de `BLOCKED`;
como no workos `BLOCKED` = espera por dependência, o mapeamento é fiel mas não
captura o tempo em fila-de-prontos (ACTIVE antes de alguém pegar). Refinamento
futuro: subdividir `ACTIVE` por `assignedAt`.

---

## 2. Etapa-restrição do sistema (ToC) — P0.3

**O que é.** A única etapa-pré-requisito **pendente** que mais represa o fluxo
agora — a inversão do `waitingOn` da fila de bloqueados. Por Teoria das
Restrições (Goldratt), concluir trabalho na restrição é o caminho mais rápido
para aumentar o throughput do sistema.

**Fórmula.** `team-health.getSystemConstraint(teamIds?)`:

1. Busca etapas `BLOCKED` no escopo (mesmo escopo de `getBlockedStages`: pelo
   time dono da etapa bloqueada).
2. Para cada item bloqueado, atribui suas horas de espera (`now − blockedAt`) a
   **cada pré-requisito pendente** (não concluído para aquela tarefa).
3. A restrição = o pré-requisito com maior **espera acumulada** (desempate: mais
   tarefas distintas). Retorna `null` quando nada está bloqueado.

**Superfície.** `components/admin/SystemConstraint.tsx` — callout proeminente no
**topo** do `AdminHealthSection` (vs. o "top-3 por duração média" que já existia
enterrado em `/reports/performance`). Render `null` quando não há restrição.
i18n `admin.health.constraint.*` (pt+es).

**Por que melhor que o top-3 histórico.** Sinal causal (quem bloqueia quem, ao
vivo) em vez de proxy fraco (duração média retrospectiva); uma restrição em vez
de três difusas; no caminho da triagem diária em vez de num relatório ocasional.

---

## 3. Risco composto de dependências — P0.4

**O que é.** Badge de risco (baixo/médio/alto) por item na fila de bloqueados,
derivado do nº de pré-requisitos pendentes, fundamentado na heurística de que
cada dependência compõe a chance de atraso (Magennis, via DeGrandis).

**Fórmula.** `team-health-format.dependencyRiskLevel(pendingDeps)` (puro,
testado): `0–1 → low · 2 → medium · 3+ → high`. Qualitativo de propósito — sinal,
não estimativa de falsa precisão.

**Superfície.** Badge em `components/admin/BlockedQueue.tsx` + tooltip
explicando o efeito composto. i18n `admin.health.blocked.risk.*` (pt+es).

---

## 4. Percentis de cycle time + scatterplot — P0.2

**O que é.** Distribuição do tempo de **execução** das tarefas (`startedAt →
completedAt`, em dias) com p50/p85/p95. Base da previsibilidade probabilística:
comprometa-se com o **p85** (o prazo cumprido ~85% das vezes) em vez da média.

**Fórmula.** `lib/stats.percentile(values, p)` — interpolação linear
(PERCENTILE.INC), puro/testado. `reporting.getCycleTimePercentiles(filters)`
retorna `count`, `p50`, `p85`, `p95` (população cheia), `points` (scatter,
capado aos `CYCLE_SCATTER_CAP=300` mais recentes) e `excludedLegacy`
(ver §4-bis).

**Superfície.** Card **"Cycle Time (Percentis)"** em `/reports/performance`:
três números grandes (p85 destacado) + scatterplot **SVG server-side** (sem lib
de chart) com linhas de referência p50/p85/p95. i18n `reportsPerformance.cycleTime.*`.

---

## 4-bis. Separação lead / fila / cycle — `Task.startedAt`

**O problema.** Até a migração `20260812120000`, "Lead Time" e "Cycle Time"
eram exibidos como métricas distintas mas usavam a **mesma fórmula**
(`completedAt − createdAt`), porque o instante em que a tarefa saía da fila não
era persistido em lugar nenhum. O p85 que a ferramenta manda usar como
compromisso embutia o tempo parado — e não havia como distinguir "somos lentos
executando" de "a demanda espera muito antes de alguém pegar", diagnósticos com
ações opostas.

**As três métricas.**

```
lead time  = completedAt − createdAt   (demanda → entrega)   ← o que o cliente sente
cycle time = completedAt − startedAt   (início  → entrega)   ← o que a execução controla
queue time = startedAt   − createdAt   (espera na fila)      ← a diferença
```

**Como `startedAt` é carimbado.** `lib/task-start.markTaskStarted(client, taskId)`,
chamado nos **três** pontos de `lib/actions/task.ts` que promovem a tarefa para
`IN_PROGRESS`: criação com etapa inicial pré-atribuída (fila zero, correto — o
trabalho já nasceu com dono), `claimStage` (o caminho normal) e `completeStage`
(rede de segurança para o admin que conclui etapa nunca reivindicada).

É **write-once**, implementado como `updateMany` com `startedAt: null` no
`where` — compare-and-set atômico: sem read-then-write, seguro sob claims
simultâneos, idempotente. Um `update` simples reiniciaria a contagem a cada
re-promoção, inclusive após uma **reversão**; retrabalho deve _alongar_ o cycle
time, não zerá-lo.

**Caveat de dados — sem backfill (deliberado).** Tarefas anteriores à migração
ficam com `startedAt = null` e **saem da base de cycle time**, contadas em
`excludedLegacy` e declaradas na UI (`cycleTime.legacyExcluded` /
`cycleTime.noDataLegacy`). Os dois proxies possíveis foram rejeitados:
`min(TaskActiveStage.assignedAt)` é sobrescrito a cada reatribuição (só daria um
limite inferior), e `createdAt` fabricaria "fila zero" — exatamente o erro sendo
corrigido. Mesma postura já adotada para o CFD e a eficiência de fluxo. O card
enche conforme as tarefas novas forem entregues.

**Por que `getTypeForecast` NÃO mudou.** O check de viabilidade em
`/admin/tasks/new` continua em **lead time**, de propósito: quem cria a demanda
pergunta "de hoje (a criação) até o `dueDate`, dá?" — e a tarefa ainda vai passar
pela fila. Medir a partir de `startedAt` subestimaria o prazo justamente pelo
tempo de espera. Cycle time diagnostica execução; lead time promete data. Há
teste de regressão sobre isso em `__tests__/lib/actions/type-forecast.test.ts`.

**Superfície.** Quarto tile no bloco de lead time em `/reports/performance`
("Fila (mediana)", `getLeadTimeMetrics.medianQueueTimeDays`) — `null`, não zero,
quando nenhuma concluída no escopo tem carimbo (ausência ≠ "não houve espera").
`prisma/demo-seed.ts` sorteia fila de 0,5–6 dias e ancora a entrega no início,
senão cycle ≈ lead e a separação fica invisível no demo.

---

---

# Séries temporais & forecasting (P1)

Grande decisão de arquitetura do P1: **nenhum schema novo, nenhum cron.** O
`StageTransition` (P0.1) já é o event stream necessário — throughput e CFD
reconstroem dele; o Monte Carlo usa o histórico de `completedAt`. Tudo só
reflete dados **a partir da migração `20260721130000`**.

## 5. Forecasting Monte Carlo — P1.6

**O que é.** Em vez de estimativa determinística, simula milhares de cenários
amostrando o throughput histórico → distribuição de resultados. Comprometa-se
com o **p85** (§1.3 da pesquisa).

**Núcleo puro.** `lib/monte-carlo.ts` (testado, RNG seedável):

- `mulberry32(seed)` — PRNG determinístico (forecasts reproduzíveis em teste).
- `forecastWhen(samples, backlog, {trials, rng})` → p50/p85/p95 de **dias** para
  escoar o backlog (amostra 1 dia de throughput por iteração até drenar);
  `null` quando o histórico nunca conclui (todo sample 0). Percentil maior =
  data mais tarde (pessimista).
- `forecastHowMany(samples, horizonDias, opts)` → p50/p85/p95 de **quantos**
  itens saem no horizonte (soma `horizonDias` sorteios). Percentil maior = mais
  itens (otimista).

**Dados & superfície.** `reporting.getDeliveryForecast(filters)` amostra as
últimas ~12 semanas de throughput diário (`task.completedAt`, incluindo dias
zero) + conta o backlog aberto (`BACKLOG/IN_PROGRESS/PAUSED`) e roda a simulação
**server-side**. Card **"Previsão de Entrega (Monte Carlo)"** em
`/reports/performance`: backlog, "concluir backlog (p85)" e "entregas em 30 dias".

## 6. Throughput no tempo + CFD por status — P1.5

**O que é.** Série temporal de conclusões (tendência) + **Cumulative Flow
Diagram por status** (§1.5): quantas etapas em cada status por dia.

**Reconstrução sem snapshot.** `stage-transitions.statusAt(rows, t)` (puro,
testado) devolve o status de uma instância no instante `t` (última transição ≤
t). `getFlowCfdSeries(filters)` agrupa transições por instância e, para cada dia
da janela (~8 semanas), conta instâncias por status via `statusAt` — replay do
log, sem tabela de snapshot nem cron. `getThroughputSeries(filters)` bucketa
conclusões por semana.

**Superfície.** `components/reports/FlowCharts.tsx` — `ThroughputLine` (polyline
SVG) e `StatusCfd` (áreas empilhadas SVG, bottom→top: Concluída/Ativa/Bloqueada/
Não iniciada, com legenda). Banda de bloqueadas alargando = trabalho represando.
i18n `reportsPerformance.{forecast,throughput,cfd}` (pt+es).

**Custo.** O replay do CFD percorre transições × dias; janela capada em
`CFD_WINDOW_DAYS=56` e escopo por filtro. Se crescer, materializar numa tabela
de snapshot depois — mas hoje roda sem.

---

# WIP limits & capacidade/utilização (P2)

Fecha o loop "medir → **limitar** → gerir" (§1.2) e dá o denominador que faltava
para utilização. Dois campos aditivos/nullable (migração `20260721140000`).

## 7. WIP limits configuráveis + enforcement — P2.7

**O que é.** Teto de WIP por etapa (`TemplateStage.wipLimit`) — o limite da
"coluna" Kanban. Configurável no editor de etapa (admin).

**Semântica (definida no build).** WIP = instâncias `ACTIVE` **atribuídas** (em
progresso) da etapa. Enforcement como **restrição de pull**:

- `claimActiveStage` **bloqueia** reivindicar quando `emProgresso ≥ wipLimit`
  (erro claro). WIP=1 funciona (0 atribuídas → permite → 1 → próxima bloqueia).
- A **ativação automática por dependência nunca bloqueia** (só cria linhas
  `ACTIVE` não-atribuídas, que não contam como WIP em progresso) — o motor de
  workflow nunca trava.
- **Violação** (`over`) só surge de atribuição direta por admin ou de baixar o
  limite; `full` = exatamente no limite.

**Visibilidade.** `team-health.getWipStatus` retorna etapas `full`/`over` (via
`groupBy` de ACTIVE+atribuídas); componente `WipLimits` no cockpit admin
(render `null` se tudo dentro do limite). i18n `admin.health.wip.*` +
`template.stagesList.wip*`.

**Nota de erro i18n.** A mensagem de bloqueio no `claimActiveStage` é literal
pt-BR, seguindo a convenção das demais mensagens de erro do arquivo
`lib/actions/task.ts` (i18n de erros de server action é um resíduo pré-existente).

## 8. Capacidade & utilização em horas — P2.8

**O que é.** `User.weeklyCapacityHours` (meta h/semana) → **utilização** = horas
apontadas (`TimeLog`) ÷ capacidade prorrateada ao período selecionado.

**Cálculo.** `reporting.getHoursByUser` calcula `utilization` quando há meta E
janela de datas (`periodWeeks = (fim − início)/7d`); `null` sem denominador.
Coluna **"Utilização"** no relatório de produtividade, colorida por faixa
**indicativa** (>90% vermelho, 60–90% verde, <60% âmbar). Config no edit de
usuário. i18n `admin.users.edit.capacity*` + `reportsProductivity.hoursByUser.utilizationHeader`.

**Caveat (registrado).** Os benchmarks de utilização de agência (60–80%
saudável, 85%+ risco) **não passaram na verificação adversarial** da pesquisa —
por isso é faixa indicativa, sem alarme, e a meta é por-pessoa (não global).

---

# Gestão de pessoas: burnout, revisão semanal & 1:1 (P3)

Fecha o eixo de pessoas (§1.8, Gallup). P3.9 e P3.10 reusam dados existentes;
P3.11 adiciona o modelo `OneOnOneLog` (migração `20260721150000`).

## 9. Sinais de sobrecarga/burnout — P3.9

**O que é.** Por pessoa, o **padrão sustentado** de sobrecarga que a literatura
liga a burnout — não o pico pontual. `team-health.getBurnoutSignals` cruza,
nas últimas `BURNOUT_WINDOW_WEEKS=4` semanas: utilização média (TimeLog ÷
capacidade), semanas com horas acima da meta (overtime) e WIP atual.

**Risco.** `high` se util média > `BURNOUT_UTIL_HIGH=0.9` **ou** overtime ≥
`BURNOUT_OVERTIME_WEEKS_HIGH=2`; `medium` se util > `BURNOUT_UTIL_MED=0.75`
**ou** WIP ≥ `OVERLOAD_CEILING`. Só retorna medium/high, high primeiro.
Componente `BurnoutSignals` no cockpit (render `null` se ninguém em risco).

**Caveat.** Limiares indicativos (Gallup dá o agregado, não o gatilho
individual) — sinal, não diagnóstico. Depende da capacidade (P2.8) estar setada.

## 10. Revisão semanal guiada — P3.10

**O que é.** `components/admin/WeeklyReview` — checklist colapsável no topo do
cockpit que percorre os sinais (restrição → aging → bloqueados → WIP → carga →
burnout → 1:1). Estado local (client), sem query extra — os números vivem em
cada bloco. Transforma o painel em **rotina** ("medir → gerir → ajustar", §1.7).

## 11. Cadência de 1:1 — P3.11

**O que é.** Modelo `OneOnOneLog` (manager↔membro, `occurredAt`, `notes?`).
`getOneOnOneCadence` retorna, por membro, o último 1:1 + dias desde +
`overdue` (> `ONE_ON_ONE_OVERDUE_DAYS=30` ou nunca). Componente
`OneOnOneCadence` no cockpit (atrasados primeiro) com botão **"Registrar 1:1"**
(`logOneOnOne`, um clique = hoje; notes ficam para depois). Materializa a
alavanca #1 da Gallup.

**Deferido:** health-check survey (pesquisa periódica de clima) — feature própria
com modelo + UI de survey; fora do escopo desta entrega.

## Verificação (P0 + P1 + P2 + P3)

- `tsc --noEmit` 0 erros · `vitest` 344/344 · `next build` limpo · paridade i18n 45/45.
- Testes puros/lógica novos: `statusDurations`, `flowEfficiencyRatio`, `statusAt`,
  `getSystemConstraint` (3), `dependencyRiskLevel`, `percentile`, `mulberry32`,
  `forecastWhen`, `forecastHowMany`, `getWipStatus`, `getBurnoutSignals`,
  `getOneOnOneCadence`.
- Mocks atualizados: `stageTransition`, `taskActiveStage.groupBy`, `timeLog`.

## Pendências / próximos passos

- **Migrações a aplicar em produção** (`prisma migrate deploy`):
  `StageTransition` (P0.1, aplicada), `20260721140000` (wipLimit + capacity),
  `20260721150000` (OneOnOneLog), `20260812120000` (`Task.startedAt`, §4-bis).
- **Cycle time começa vazio em produção** (§4-bis, sem backfill): o card enche
  conforme as tarefas iniciadas após a migração forem entregues. Até lá, o lead
  time cobre a leitura de prazo. Nada a configurar — é só tempo.
- **Configurar dados:** WIP limits por etapa, capacidade por pessoa começam
  nulos; sinais de burnout precisam da capacidade setada; 1:1 enche ao registrar.
- **Validação com dados reais:** cards de fluxo/forecast/pessoas enchem conforme
  o fluxo roda.
- **Roadmap concluído (P0–P3).** Follow-ups: health-check survey (clima),
  subdividir `ACTIVE` por `assignedAt`, materializar o CFD se o replay pesar,
  notas no 1:1, benchmarks de utilização com fonte primária (2ª rodada de research).
- **Log de status da tarefa (`TaskStatusTransition`)** — considerado e adiado em
  favor do campo `startedAt` (§4-bis). Só vale a pena se surgir a necessidade de
  tempo-em-status **da tarefa**: cycle time descontando `PAUSED`, ou um CFD no
  nível de tarefa (hoje o CFD é por instância de etapa). O padrão a seguir seria
  o de `StageTransition` (append-only + replay puro em `lib/`).
