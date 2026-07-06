# Design — Tarefa obsoleta + duplicação (Feature B)

**Data:** 2026-07-06
**Status:** design aprovado — pendente implementação

## Context

Quando novos requisitos chegam, uma demanda pode ficar **obsoleta**, e muitas vezes precisamos
recomeçá-la limpa. Precisamos: (1) marcar uma tarefa como **obsoleta** (sai do fluxo ativo, dos
pendentes e do % do projeto); (2) **duplicar** uma tarefa criando uma nova com as etapas do template
frescas, sem comentários, sem artefatos e sem status de conclusão, aberta para edição.

## Decisões

- **Status OBSOLETE:** novo valor no enum `TaskStatus` (migração Postgres `ALTER TYPE ... ADD VALUE`).
  Tratado como terminal/arquival, análogo a `CANCELLED`.
- **Efeitos do OBSOLETE:**
  - `computeProjectCompletion` (lib/project-status.ts) exclui OBSOLETE do denominador (como
    CANCELLED). Atualizar o teste.
  - Filtros/consultas que listam tarefas ativas (ex.: `getTasks` quick "pending" já é
    BACKLOG/IN_PROGRESS/PAUSED — OBSOLETE fica de fora naturalmente); conferir dashboards/backlog.
  - Badge OBSOLETE no detalhe e nas listas.
- **Duplicar copia só metadados:** título + `" (cópia)"`, descrição, `projectId`, prioridade e o
  **mesmo template**; recria as etapas do template **frescas** copiando **quais etapas estavam
  incluídas** na original (mesma forma de workflow), com status zerado (entrada ACTIVE, resto
  INACTIVE); **sem** comentários, **sem** artefatos, **sem** status de conclusão; redireciona para a
  nova tarefa aberta para edição.
- **Permissão:** marcar obsoleta e duplicar = MANAGER+ (usar `requireManagerOrAdmin`).

## Componentes e mudanças

- **`prisma/schema.prisma`:** `enum TaskStatus { ... OBSOLETE }` + migração
  (`ALTER TYPE "TaskStatus" ADD VALUE 'OBSOLETE'`).
- **`lib/project-status.ts`:** contar OBSOLETE junto de CANCELLED (fora do denominador e nunca
  "completed"). Atualizar `__tests__/lib/project-status.test.ts`.
- **`lib/actions/task.ts`:**
  - `markTaskObsolete(taskId)`: `requireManagerOrAdmin`; `Task.status = OBSOLETE`; comentário de
    auditoria; revalida paths.
  - `duplicateTask(taskId)`: `requireManagerOrAdmin`; em transação: deriva `templateId` das
    `TaskActiveStage` da original (via `stage.templateId`); coleta o conjunto de `stageId` incluídos
    (as linhas existentes); cria a nova `Task` (título+" (cópia)", descrição, projectId, prioridade,
    status BACKLOG); chama `createTaskStages(tx, { taskId, templateId, userId, selectedStageIds })`
    com o conjunto copiado. Retorna o id novo; a action revalida e o chamador redireciona.
    **Reusa** `createTaskStages` (lib/stage-assignment-helpers.ts) — já cria entrada ACTIVE + resto
    INACTIVE, sem comentários/artefatos.
- **UI:**
  - Botões **"Marcar obsoleta"** e **"Duplicar"** no menu de ações da tarefa
    (`components/tasks/TaskActionsMenu.tsx`) e/ou no `/admin/tasks/{id}`. "Duplicar" redireciona para
    `/admin/tasks/{novoId}`.
  - Badge OBSOLETE onde o status é exibido (detalhe + listas de tarefas).

## Testes / verificação

- **Vitest:** `duplicateTask` (deriva templateId; recria etapas com o conjunto incluído; não copia
  comentários/artefatos; título com "(cópia)"); `markTaskObsolete` (seta status, RBAC);
  `computeProjectCompletion` exclui OBSOLETE.
- **Smoke manual:** marcar uma tarefa obsoleta → some dos pendentes, % do projeto sobe; duplicar uma
  tarefa → nova tarefa com etapas frescas, sem comentários/artefatos, aberta para edição.

## Fora de escopo

- Reverter obsolescência em massa; "duplicar para outro projeto"; copiar artefatos na duplicação.
