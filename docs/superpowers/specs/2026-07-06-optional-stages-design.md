# Design — Etapas opcionais por tarefa

**Data:** 2026-07-06
**Status:** spec aprovado em brainstorming — pendente plano de implementação
**Stack:** Next.js 15 · Prisma 6 · Vitest

## Context

Hoje **todas** as `TemplateStage` de um template viram linhas `TaskActiveStage` na criação da
tarefa (arquitetura de pré-criação já mergeada — ver
`docs/superpowers/plans/2026-06-26-stage-precreation-and-assignment.md`). O usuário quer poder
**deixar etapas de fora de uma demanda específica** sem afetar o template compartilhado nem
outras tarefas.

Requisitos, nas palavras do usuário:

1. Etapas marcadas como **opcionais** aparecem **desmarcadas** na criação da tarefa; o criador
   marca só as que couberem na demanda.
2. Etapas **normais** aparecem marcadas, mas podem ser **desmarcadas** conforme a demanda.
3. Uma etapa **não incluída não pode existir** para aquela tarefa — nem o "esqueleto". Ela não
   pode vazar no fluxo, no **seguimento/retorno** de etapa, nem no histórico. (Foi a razão de
   descartar um status `SKIPPED` oculto: uma linha existente poderia reaparecer como opção.)
4. **Isolamento total:** nada disso toca `TemplateStage`/`StageDependency` nem outras tarefas.

## Decisões

- **Flag no template:** `TemplateStage.optional Boolean @default(false)`. O admin define quais
  etapas são opcionais na tela de edição do template.
- **Form de criação:** cada etapa do preview ganha um checkbox. Opcional → **desmarcada** por
  padrão; normal → **marcada** por padrão; **todas** alternáveis.
- **Instanciação seletiva:** só etapas **selecionadas** viram `TaskActiveStage`. Não
  selecionada = **nenhuma linha** (nem esqueleto).
- **Regras:** exige **≥1 etapa selecionada**; a etapa de entrada (`ACTIVE`) é a de **menor
  `order` entre as selecionadas**.
- **Motor de workflow (duas correções internas):**
  - **Nunca ressuscitar:** remover o branch de _criação_ do `upsert` em `activateNextStages` —
    ele passa a **só transicionar linhas que existem**. Etapa sem linha nunca é recriada.
  - **Dependência para etapa ausente = satisfeita:** um `StageDependency` cujo pré-requisito
    **não tem linha nesta tarefa** é tratado como já cumprido, para que o que vem depois de uma
    opcional não incluída ative normalmente.

## Modelo de dados

```prisma
model TemplateStage {
  // ...campos existentes...
  optional Boolean @default(false)
}
```

Migração aditiva (default `false` → tarefas e templates existentes inalterados).

### Semântica de "incluída" e tarefas legadas

Após esta mudança, **"etapa do template sem linha `TaskActiveStage` nesta tarefa" passa a
significar "não incluída"**. O branch de criação do `upsert` existia justamente para tarefas
**legadas** sem linhas pré-criadas; removê-lo exige garantir que toda tarefa ativa tenha suas
linhas. **Verificar** se o backfill da pré-criação já cobriu todas as tarefas existentes; se
houver tarefas legadas com linhas faltando, incluir um **backfill** que crie as linhas ausentes
(para todas as etapas do template) antes de remover o fallback — senão elas seriam tratadas
como "não incluídas" por engano.

## Componentes e mudanças (arquivos)

Espelhar o padrão do campo `defaultMediaType` (trabalho recente), com uma correção: o form de
**edição** em `StagesList.tsx` não renderiza `defaultMediaType` e o reseta ao salvar — adicionar
`optional` **nos dois** forms (criar e editar) para não repetir o bug.

**Template (admin):**

- `prisma/schema.prisma` — `TemplateStage.optional` + migração.
- `lib/validations.ts` — `templateStageSchema` (linhas ~112-129): parsear checkbox
  (`formData.get("optional") === "on"`).
- `lib/actions/stage.ts` — `createTemplateStage` (~9-57) e `updateTemplateStage` (~59-111): ler
  e gravar `optional` no `create.data` e `update.data`.
- `components/admin/CreateStageForm.tsx` (~140-160) e `components/admin/StagesList.tsx`
  (grid de edição ~106-178, + a interface `Stage` ~9-30): checkbox `name="optional"`.
- `lib/actions/template.ts` — `getWorkflowTemplate`: incluir `optional` no `select` de `stages`.

**Criação da tarefa:**

- `app/actions/templateActions.ts` — `getTemplateStagePreview` (~26-45): retornar `optional`.
- `components/tasks/CreateTaskForm.tsx` — no preview (~218-243), checkbox por etapa
  `name={"stage:" + stage.id}`, `defaultChecked={!stage.optional}`.
- `lib/stage-assignment-helpers.ts` — novo `parseSelectedStages(formData)` (lê chaves
  `stage:<id>`, simétrico a `parseStageAssignments` ~39-48); `createTaskStages` (~58-101) passa a
  receber `selectedStageIds` e cria **só** essas linhas; valida ≥1; entrada = menor `order` entre
  as selecionadas.
- `lib/actions/task.ts` — `createTask` (~50-106): parsear selecionadas e passar a
  `createTaskStages`. `createTasksBatch` (~113-162, sem UI por etapa): incluir por padrão só as
  **não-opcionais**.

**Motor:**

- `lib/actions/task.ts` — `activateNextStages` (~677-776): remover o branch de criação do
  `upsert` (só `update`); ao computar prontidão, tratar pré-requisito **sem linha nesta tarefa**
  como satisfeito. Carregar o conjunto de `stageId` com linha para a tarefa; um pré-requisito é
  satisfeito se `completo` **ou** `∉ conjunto de incluídas`.
- `lib/stage-assignment-helpers.ts` — `areAllPrerequisitesComplete` (~30-35): estender para
  receber o conjunto de incluídas (ou tratar a lógica inline em `activateNextStages`).
- `revertTaskStage` (~1514) e demais leituras (`getAvailableNextStages`, `previewNextStages`):
  como derivam de linhas existentes, etapas não incluídas já não aparecem — **confirmar** por
  teste que nenhuma surge no seguimento/retorno.

## Testes / verificação

- **Helpers:** `parseSelectedStages`; `createTaskStages` cria só as selecionadas, exige ≥1,
  entrada = menor `order` selecionada; batch inclui só não-opcionais.
- **Motor:** dependente de um pré-requisito **não incluído** ativa normalmente; etapa não
  incluída **nunca** é criada/ressuscitada ao concluir sua vizinha; seguimento e **retorno** não
  ofertam etapas não incluídas.
- **Regressão:** atualizar `__tests__/lib/actions/activate-next-stages.test.ts` e
  `__tests__/lib/actions/task-precreation.test.ts`.
- **Smoke manual:** template com 1 etapa opcional + 1 normal; criar tarefa desmarcando a normal e
  marcando a opcional; concluir o fluxo; conferir que a etapa de fora não aparece em lugar
  nenhum.

## Fora de escopo

- Tornar etapas opcionais **após** a criação (adicionar/remover etapa de uma tarefa em
  andamento) — v1 é só no momento da criação.
- Status `SKIPPED` visível/auditável (descartado a favor de não criar a linha).
