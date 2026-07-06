# Design — Conclusão automática de tarefa + status/% do projeto

**Data:** 2026-07-06
**Status:** spec aprovado em brainstorming — pendente plano de implementação
**Stack:** Next.js 15 · Prisma 6 · Vitest
**Depende de:** semântica de "etapa não incluída" de
`2026-07-06-optional-stages-design.md` (só linhas criadas contam para "restam etapas").

## Context

Duas lacunas conectadas:

1. **Conclusão de tarefa ambígua.** `Task.status === COMPLETED` só é setado **manualmente** por
   `completeTask` (`lib/actions/task.ts:604-671`). Quando a **última etapa** é concluída via
   `completeStageAndAdvance` (~781-954), o passo final (~924-937) só seta `IN_PROGRESS` se
   `remainingActive > 0` — **nunca** marca a tarefa como concluída. Resultado: uma tarefa com
   todas as etapas `COMPLETED` pode continuar `IN_PROGRESS`.
2. **Sem conceito de conclusão de projeto.** Não há `%`, nem filtro pendente/concluído. O enum
   `ProjectStatus {ACTIVE, INACTIVE}` é **arquival**, não de conclusão.

Decisão de produto (confirmada): **a tarefa conclui automaticamente ao fim das etapas.**

## Decisões

- **Auto-complete da tarefa.** Em `completeStageAndAdvance`, após `activateNextStages`, se **não
  restar nenhuma** `TaskActiveStage` em `ACTIVE`/`BLOCKED`/`INACTIVE` (só contam linhas criadas —
  etapas não incluídas não existem), setar `Task.status = COMPLETED` + `completedAt = now()`. A
  ação manual `completeTask` permanece como atalho/override.
- **% de conclusão do projeto** = `tarefas COMPLETED / total de tarefas não-CANCELLED`. Projeto
  sem tarefas não-canceladas → **"sem tarefas"** (não conta como concluído nem entra no cálculo).
- **Classificação do projeto:**
  - **Pendente:** tem ≥1 tarefa não-cancelada e não-concluída.
  - **Concluído:** tem ≥1 tarefa e **todas** as não-canceladas estão `COMPLETED`.
- **Filtro na lista de projetos do cliente:** chips **Pendentes / Concluídos** via `searchParams`
  (padrão de `components/tasks/TaskFilters.tsx`).
- **Card de progresso** na página de detalhe do projeto (grid de cards existente).

## Componentes e mudanças (arquivos)

**Auto-complete:**

- `lib/actions/task.ts` — `completeStageAndAdvance` (~924-937): adicionar branch que, quando
  `remainingActive === 0` **e** não há linhas `INACTIVE`/`BLOCKED` pendentes, atualiza a tarefa
  para `COMPLETED`+`completedAt`. Reusar a mesma transação. Registrar log/auditoria coerente com
  `completeTask`.

**Helper de conclusão (novo, reutilizável):**

- `computeProjectCompletion(tasks)` → `{ total, completed, cancelled, pct, state }` onde `state ∈
{"empty","pending","completed"}`. Colocar em `lib/` (ex.: `lib/project-status.ts`) e usar tanto
  na lista do cliente quanto no detalhe do projeto (fonte única da regra).

**Lista de projetos do cliente:**

- `app/[locale]/(protected)/admin/clients/[clientId]/page.tsx` — `getClient` (~20-31): estender o
  `include` de `projects` para agregar status das tarefas por projeto (ex.:
  `tasks: { select: { status: true } }` ou `_count` por status). Classificar cada projeto com
  `computeProjectCompletion`. Ler `searchParams` e filtrar (validar com um `pick()` allow-list,
  como em `admin/tasks/page.tsx`).
- Novo componente de filtro (chips pendente/concluído) espelhando `TaskFilters.tsx`
  (`useRouter`/`usePathname`/`useSearchParams`, `setParam`).

**Detalhe do projeto:**

- `app/[locale]/(protected)/admin/projects/[projectId]/page.tsx` — `statusCounts` já é computado
  (~143-149); adicionar um **card de % de conclusão** ao grid (~316-332), usando
  `computeProjectCompletion`.

## Interação com etapas opcionais

Como etapas não incluídas **não têm linha** (spec de etapas opcionais), o teste de "restam
etapas" (`ACTIVE`/`BLOCKED`/`INACTIVE`) as ignora naturalmente — nenhum tratamento especial de
`SKIPPED` é necessário.

## Testes / verificação

- **Auto-complete:** conclui ao fechar a última etapa; **não** conclui com etapas restantes;
  tarefa com etapas opcionais fora conclui ao fechar as incluídas; `completeTask` manual segue
  funcionando.
- **`computeProjectCompletion`:** 0 tarefas → `empty`; todas canceladas → `empty`; mix →
  `pending` com `pct` correto; todas concluídas → `completed` 100%.
- **Filtro do cliente:** projeto com tarefa aberta cai em Pendentes; projeto 100% concluído cai
  em Concluídos; `searchParams` inválido é ignorado.
- **Smoke manual:** concluir a última etapa de uma tarefa e ver a tarefa virar Concluída e o `%`
  do projeto subir; alternar os chips na lista do cliente.

## Fora de escopo

- Reabrir tarefa concluída automaticamente (revert já existe e re-transiciona etapas).
- Status de conclusão persistido no `Project` (derivado on-read via `computeProjectCompletion`;
  sem coluna nova).
