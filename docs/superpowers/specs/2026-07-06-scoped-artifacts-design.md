# Design — Artefatos com escopo (tarefa / projeto / cliente)

**Data:** 2026-07-06
**Status:** spec aprovado em brainstorming — pendente plano de implementação
**Stack:** Next.js 15 · Prisma 6 · Vitest
**Relaciona-se com:** `2026-07-02-nas-artifact-storage-design.md` (mesmo fluxo de envio;
upload NAS de projeto/cliente entra no rollout do NAS).

## Context

Hoje artefatos são **só de tarefa** (`TaskArtifact.taskId` obrigatório; sem FK de projeto/
cliente). O usuário quer:

- **Artefatos de projeto** visíveis/destacados nas demandas do projeto; e a **descrição do
  projeto** em destaque no card descritivo da tarefa.
- **Artefatos de cliente** visíveis nas demandas relacionadas ao cliente.
- Ao **atuar numa etapa**, enxergar artefatos do **cliente e do projeto**, além dos da tarefa.

Insight do usuário (adotado): como o **fluxo de envio será o mesmo** dos artefatos de tarefa,
diferenciar por um campo de **escopo** (`TASK`/`PROJECT`/`CLIENT`) é mais limpo que tabelas
separadas. No NAS, artefatos de projeto e de cliente caem na pasta **Institucional** do cliente;
a diferenciação projeto vs cliente fica no **banco** (`scope` + `projectId`), não no diretório.

## Decisões de escopo (v1)

- **v1 entrega por link** (destrava agora, sem depender do NAS/NS). O **upload NAS** de projeto/
  cliente entra junto com o rollout do NAS — é o **mesmo** `AddArtifactForm` (já tem modo link e
  modo upload).
- **Modelo unificado com escopo**, não tabelas separadas.
- **Pasta NAS (v2):** projeto e cliente → `{raiz}/{Cliente}/Institucional/{tipoMidia}/`.

## Modelo de dados

```prisma
enum ArtifactScope { TASK PROJECT CLIENT }

model TaskArtifact {
  // ...campos existentes...
  scope     ArtifactScope @default(TASK)
  taskId    String?       // agora NULÁVEL (era obrigatório)
  projectId String?
  clientId  String?
  task      Task?         @relation(...)
  project   Project?      @relation(...)
  client    Client?       @relation(...)
}
```

- **Invariante (validada em código):** exatamente **um** dono por `scope` — `TASK`⇒`taskId`,
  `PROJECT`⇒`projectId`, `CLIENT`⇒`clientId`; os outros dois nulos.
- `Project.artifacts TaskArtifact[]` e `Client.artifacts TaskArtifact[]` (relações inversas).
- **Nome do modelo:** manter `TaskArtifact` na v1 para evitar churn massivo (muitas referências,
  trabalho NAS em andamento); documentar como "artefato com escopo". Renomear para `Artifact`
  fica como limpeza futura.
- **Constraint existente** `@@unique([taskId, purposeId, mediaType, version])`: segue válida
  (com `taskId` nulo os campos NAS ficam nulos para link de projeto/cliente).
- Migração aditiva: `scope` default `TASK`, `taskId` passa a nulável; artefatos existentes já são
  `TASK`.

## Componentes e mudanças (arquivos)

**Ações:**

- `lib/actions/task.ts` — `addLinkArtifact` (~1694-1743): estender para aceitar
  `scope` + `projectId`/`clientId` (ou novo `lib/actions/artifact.ts` `addScopedLinkArtifact`).
  RBAC coerente: projeto/cliente exigem MANAGER+ (mesmos donos das telas de edição). Novo
  `removeArtifact(id)` para projeto/cliente. Revalidar as páginas afetadas.
- `lib/validations.ts` — schema do link com `refine` garantindo a invariante de escopo.

**Gestão (mesmas telas onde já se edita nome/descrição):**

- `.../admin/projects/[projectId]/` **edit-project-header.tsx** (`EditProjectHeader`): lista +
  add/remove de artefatos de projeto (link). Ação inline ou de `lib/actions`.
- `.../admin/clients/[clientId]/` **edit-client-header.tsx** (`EditClientHeader`): idem para
  cliente.

**Surface na tarefa/etapa:**

- `app/[locale]/(protected)/tasks/[taskId]/page.tsx` (e o gêmeo `admin/tasks/[taskId]/page.tsx`):
  estender a query para carregar `project.artifacts` (scope PROJECT) e `project.client.artifacts`
  (scope CLIENT), além dos artefatos da tarefa.
- `components/tasks/TaskDetailView.tsx`:
  - **Descrição do projeto em destaque** no card descritivo (~138-257) — `task.project` já está
    disponível; hoje só a descrição da tarefa é mostrada (~244-255).
  - **Blocos destacados** "Do projeto" e "Do cliente" **acima** dos artefatos da tarefa na seção
    de artefatos (~312-355). Componente reutilizável simples (link + título), separado do
    `ArtifactsList` (que trata tipos/estados NAS de tarefa).

## Testes / verificação

- **Invariante de escopo:** rejeita artefato com 0 ou >1 donos; aceita exatamente um.
- **CRUD link projeto/cliente:** criar/remover; RBAC (MANAGER+); revalidação.
- **Surface:** a página da tarefa traz artefatos de projeto e de cliente; descrição do projeto
  aparece destacada; artefatos de tarefa seguem intactos.
- **Regressão:** artefatos existentes continuam `TASK` e funcionam (link e NAS).
- **Smoke manual:** adicionar link no projeto e no cliente; abrir uma demanda desse projeto/
  cliente e ver os três grupos (cliente, projeto, tarefa) + a descrição do projeto.

## Fora de escopo (v2 — com o rollout do NAS)

- **Upload NAS** de projeto/cliente (pasta Institucional) via `buildNasPath` adaptado ao escopo.
- Renomear `TaskArtifact` → `Artifact`.
- Sensibilidade/share/versionamento para artefatos de projeto/cliente (v1 é link de referência).
