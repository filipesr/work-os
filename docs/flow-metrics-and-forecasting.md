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

**O que é.** Distribuição do tempo de conclusão das tarefas (`createdAt →
completedAt`, em dias) com p50/p85/p95. Base da previsibilidade probabilística:
comprometa-se com o **p85** (o prazo cumprido ~85% das vezes) em vez da média.

**Fórmula.** `lib/stats.percentile(values, p)` — interpolação linear
(PERCENTILE.INC), puro/testado. `reporting.getCycleTimePercentiles(filters)`
retorna `count`, `p50`, `p85`, `p95` (população cheia) e `points` (scatter,
capado aos `CYCLE_SCATTER_CAP=300` mais recentes).

**Superfície.** Card **"Cycle Time (Percentis)"** em `/reports/performance`:
três números grandes (p85 destacado) + scatterplot **SVG server-side** (sem lib
de chart) com linhas de referência p50/p85/p95. i18n `reportsPerformance.cycleTime.*`.

---

## Verificação

- `tsc --noEmit` 0 erros · `vitest` 330/330 · `next build` limpo · paridade i18n 45/45.
- Testes puros novos: `statusDurations`, `flowEfficiencyRatio`, `getSystemConstraint`
  (3 casos), `dependencyRiskLevel`, `percentile`.
- Mocks de transação atualizados para `stageTransition` (create/createMany).

## Pendências / próximos passos

- **Aplicar `prisma migrate deploy`** em produção (tabela `StageTransition`) — feito.
- **Validação com dados reais:** `/reports/performance` fica vazio até haver
  tarefas concluídas e transições acumuladas; validar quando o fluxo rodar.
- **P1 (próximo):** throughput ao longo do tempo + CFD (precisa de snapshots
  diários por etapa) e forecasting Monte Carlo sobre o histórico de cycle time.
- **Refinamentos:** subdividir `ACTIVE` por `assignedAt` (fila-de-prontos vs.
  trabalho); backfill exato do split ativo/bloqueado é impossível para o
  histórico pré-migração (assumido).
