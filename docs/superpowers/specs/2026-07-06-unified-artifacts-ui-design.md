# Design — UI unificada de artefatos (Frente A)

**Data:** 2026-07-06
**Status:** design aprovado — pendente implementação
**Relaciona-se com:** `2026-07-06-scoped-artifacts-design.md` (escopo já implementado) e a
**Frente B** (rework do fluxo NAS — ver ao final).

## Context

Depois de adicionar artefatos com escopo (TASK/PROJECT/CLIENT), a UI ficou inconsistente: a tarefa
usa `ArtifactsList` (link + NAS com download), o projeto usa `ProjectArtifactsTable` (só link,
achatado das tarefas) + um `ScopedArtifactsManager` (link add/remove), e o cliente usa só o
`ScopedArtifactsManager`. O usuário quer **uma única tabela/lista de artefatos** em todas as telas,
com a **Origem** (Tarefa/Projeto/Cliente) visível, e o **mesmo formulário de adicionar** (link com
tipo, e a aba Upload NAS) replicado em projeto e cliente — inclusive em `/admin/tasks/{id}`.

## Decisões

- **Componente único** `UnifiedArtifactsPanel` substitui `ArtifactsList`, `ProjectArtifactsTable` e
  `ScopedArtifactsManager` nas telas de artefato.
- **Origem por linha:** chip **Tarefa / Projeto / Cliente** (derivado de `scope`).
- **Colunas:** Origem (chip) · Título (link externo, ou botão **Baixar** quando NAS) · Tipo · Tarefa
  (quando a linha vem de uma tarefa e a tela atual não é a daquela tarefa) · Ações (remover — só
  artefatos PROJECT/CLIENT, MANAGER+).
- **Tipo exibido:** link → `ArtifactType` (Documento/Imagem/Vídeo/Figma/Outro); NAS → `mediaType`
  (Fotos/Vídeos/Documentos/Logos/Social Media/Outros).
- **Add form (abas):** **Link** (com campo Tipo) ativo em todas as telas; **Upload NAS** ativo só na
  tarefa por ora — em projeto/cliente aparece desabilitado ("disponível com o rollout do NAS").
- **Card "Armazenamento no NAS"** (config de campanha) **permanece** por ora; sai na Frente B.

### Composição por tela (montada no servidor)

| Tela                                | Linhas incluídas                           |
| ----------------------------------- | ------------------------------------------ |
| `/tasks/{id}` e `/admin/tasks/{id}` | Tarefa + Projeto + Cliente                 |
| `/admin/projects/{id}`              | Projeto + artefatos das Tarefas do projeto |
| `/admin/clients/{id}`               | só Cliente                                 |

## Componentes e mudanças

- **`lib/artifacts/unify.ts` (novo, puro + testável):** `toUnifiedRows(input)` normaliza artefatos
  de qualquer escopo num tipo comum:
  ```ts
  type UnifiedArtifactRow = {
    id: string;
    origin: "TASK" | "PROJECT" | "CLIENT";
    title: string;
    url: string | null;
    storageKind: "LINK" | "NAS_UPLOAD";
    uploadStatus: string;
    type: string | null; // ArtifactType (link)
    mediaType: string | null; // ArtifactMediaType (NAS)
    fileName: string | null;
    createdAt: string;
    taskId: string | null;
    taskTitle: string | null;
    userName: string | null;
  };
  ```
- **`components/artifacts/UnifiedArtifactsPanel.tsx` (novo, client):** recebe
  `{ rows, context, canManageScoped, userId }` onde `context = { scope, taskId?, projectId?,
clientId?, currentTaskId? }`. Renderiza a tabela (chip Origem + Baixar/link + Tipo + Tarefa +
  remover) e o add form (abas Link/Upload NAS). `currentTaskId` esconde a coluna Tarefa para linhas
  da própria tarefa.
  - **Link add:** TASK → `addLinkArtifact`; PROJECT/CLIENT → `addScopedLinkArtifact`.
  - **Upload NAS:** reusa `UploadArtifactForm` (só quando `scope === TASK`).
  - **Remover:** PROJECT/CLIENT → `removeScopedArtifact` (MANAGER+); TASK sem remoção (como hoje).
- **Reuso:** botão de download NAS já existe (`components/tasks/DownloadArtifactButton.tsx`);
  o chip de status NAS e o mapeamento de rótulos de tipo vêm do que já existe em `ArtifactsList`.
- **Telas:** montar as linhas no servidor e passar para o painel:
  - `components/tasks/TaskDetailView.tsx` (troca os blocos que criei + `ArtifactsList` pelo painel).
  - `app/[locale]/(protected)/admin/tasks/[taskId]/page.tsx` (troca `ArtifactsList`; carregar
    project/client artifacts — hoje usa `getTaskById`, estender a query).
  - `app/[locale]/(protected)/admin/projects/[projectId]/page.tsx` (troca `ProjectArtifactsTable` +
    `ScopedArtifactsManager`; linhas = PROJECT + tarefas).
  - `app/[locale]/(protected)/admin/clients/[clientId]/page.tsx` (troca `ScopedArtifactsManager`;
    linhas = só CLIENT).
- **Aposentar:** `components/admin/ScopedArtifactsManager.tsx` e
  `components/admin/ProjectArtifactsTable.tsx` (remover após migrar usos).

## Testes / verificação

- **Vitest:** `toUnifiedRows` (mapeia cada escopo; deriva origin; achata artefatos de tarefa com
  `taskTitle`; tipo vs mediaType). Atualizar `__tests__/components/TaskDetailView.test.tsx`.
- **Smoke manual:** as 4 telas mostram a tabela única com chip Origem; adicionar link em cada
  escopo; Tipo aparece; Upload NAS ativo só na tarefa; remover artefato de projeto/cliente.

## Fora de escopo — Frente B (rework do fluxo NAS, design próprio depois)

Visão do usuário a detalhar na Frente B:

- **Simplificar o armazenamento:** artefato de **cliente** → `.../{cliente}/institucional`; artefato
  de **tarefa** → `.../{cliente}/{tarefa}/institucional`.
- **Derivar campanha dos dados existentes** (slug = título da tarefa; **mês/ano** a partir dos dados
  da tarefa — a **data de conclusão** da tarefa entra nos parâmetros de nomenclatura), **eliminando**
  o card de configuração de campanha e o gate `nasUploadEnabled` ("todo artefato pode ir pro NAS").
- Habilitar **Upload NAS** também em projeto/cliente (aba hoje desabilitada na Frente A).
