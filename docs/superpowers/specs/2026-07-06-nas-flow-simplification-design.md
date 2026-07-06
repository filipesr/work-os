# Design — Simplificação do fluxo NAS (Frente B)

**Data:** 2026-07-06
**Status:** design aprovado — pendente implementação
**Revisa:** `2026-07-02-nas-artifact-storage-design.md` (esquema de pastas/nomes e o gate de campanha).
**Relaciona-se com:** `2026-07-06-scoped-artifacts-design.md` e `2026-07-06-unified-artifacts-ui-design.md`
(escopo + painel) e `2026-07-06-artifact-versioning-design.md` (cadeia de versões).

## Context

O esquema NAS atual (spec 2026-07-02) exige **metadados de campanha manuais** (slug/ano/mês) e um
**gate `nasUploadEnabled`** por projeto, configurados num card "Armazenamento no NAS". Isso é
redundante: o **título da tarefa** já é o nome/slug da demanda e a **data** vem dos dados existentes.
O usuário quer simplificar para que **todo artefato possa ir ao NAS** sem config extra, com pastas
`institucional` por escopo.

## Decisões

### Novo esquema de pastas (tudo em `institucional`, sem `Campanhas`)

| Escopo  | Pasta                                            |
| ------- | ------------------------------------------------ |
| CLIENT  | `{cliente}/institucional/{tipoMidia}/`           |
| PROJECT | `{cliente}/{projeto}/institucional/{tipoMidia}/` |
| TASK    | `{cliente}/{tarefa}/institucional/{tipoMidia}/`  |

Cliente/projeto/tarefa são **irmãos** sob o cliente (tarefa **não** aninha sob o projeto). As pastas
de projeto/tarefa recebem um **sufixo curto de id** (`Nome ~ab12cd`, 6 hex do id) para nunca colidir
entre nomes iguais.

### Nomenclatura (`AAAA_MM` = data do **envio**)

- **TASK:** `{AAAA_MM}_{Proposito}_{Demanda}_v{NN}.{ext}` (Demanda = título da tarefa).
- **PROJECT:** `{AAAA_MM}_{Proposito}_{Projeto}_v{NN}.{ext}`.
- **CLIENT:** `{Cliente}_{Proposito}_v{NN}.{ext}` (referência institucional, sem data).

`{tipoMidia}` (pasta-folha via `MEDIA_TYPE_FOLDER`), `Propósito` (`DeliverablePurpose`) e `v{NN}`
continuam. Limites de comprimento e truncamento determinístico (hash) mantidos.

### Versão

O `v{NN}` do nome usa a **versão da cadeia** (Feature A: `TaskArtifact.version`), unificando a noção
de versão. A `@@unique` de versão passa a cobrir os três escopos (ver Modelo de dados).

### Gate/config removidos

- Remover de `Project`: `campaignSlug`, `campaignYear`, `campaignMonth`, `nasUploadEnabled`,
  `nasMetadataReviewedAt`, `nasMetadataReviewedById` (+ relação `nasMetadataReviewedBy`). Migração
  destrutiva (colunas sem uso após esta frente).
- Manter `Client.folderName` (auto-derivado do nome; raiz do cliente no NAS). Único pré-requisito de
  upload: cliente com `folderName`.

## Modelo de dados

- `Project`: remover os 6 campos de campanha/gate acima.
- `TaskArtifact`: a `@@unique([taskId, purposeId, mediaType, version])` é substituída para cobrir
  projeto/cliente. Como Postgres trata `NULL` como distinto, uma única constraint com os três donos
  não garante unicidade por escopo; usar **índices únicos parciais** por escopo:
  - `@@unique` (parcial) por `(taskId, purposeId, mediaType, version)` onde `scope = TASK`;
  - idem para `(projectId, …)` e `(clientId, …)`. (Implementado como índices únicos parciais no SQL
    da migração, já que o Prisma não expressa `WHERE` em `@@unique`.)

## Componentes e mudanças

- **`lib/nas/path.ts`:** reescrever `buildNasPath` para receber `scope` + `owner` (cliente + nome do
  projeto/tarefa + id p/ sufixo) + `uploadDate`, sem campos de campanha. Remover `ArtifactTarget`/
  ramo `CAMPANHA`. Novos helpers de pasta por escopo. Reescrever `__tests__/lib/nas/path.test.ts`.
- **`lib/actions/artifact.ts`:**
  - `prepareArtifactUpload` reescrito: entrada aceita `scope` + `taskId?/projectId?/clientId?`;
    RBAC por escopo (TASK=membro+, PROJECT/CLIENT=MANAGER+); resolve `folderName` do cliente
    (via task→project→client, project→client, ou client direto); monta path pelo escopo; sem
    `nasUploadEnabled`/campanha. `prepareArtifactUploadSchema` atualizado.
    - Reusa a data do envio (`new Date()` passado como parâmetro — o script de path é puro).
  - `createArtifactWithVersion`: alocar versão por escopo (não só taskId).
- **`lib/validations.ts`:** `prepareArtifactUploadSchema` ganha `scope` + owners; remove exigência de
  `taskId` fixo.
- **Schema/migração:** dropar as colunas do `Project`; criar os índices únicos parciais.
- **UI:**
  - `app/[locale]/(protected)/admin/projects/[projectId]/page.tsx`: remover o card "Armazenamento no
    NAS", a action `saveNasMetadata` e o helper `isProjectNasLocked`.
  - `components/tasks/UploadArtifactForm.tsx`: aceitar `scope` + ownerId (hoje só `taskId`).
  - `components/artifacts/UnifiedArtifactsPanel.tsx`: habilitar a aba **Upload NAS** para
    PROJECT/CLIENT (hoje desabilitada), passando o escopo/owner ao `UploadArtifactForm`.
  - `getArtifactUploadOptions(taskId)` → generalizar para escopo (retorna propósitos + defaults).

## Testes / verificação

- **Vitest:** `buildNasPath` para os 3 escopos (pasta correta, sufixo de id, nome com `AAAA_MM` do
  envio, cliente sem data, truncamento, allowlist/extensão preservadas); `prepareArtifactUpload`
  (RBAC por escopo, exige folderName, sem gate) com prisma mockado; alocação de versão por escopo.
- **Contrato/agente:** os testes de `agent-contract` seguem válidos (o token/HMAC não mudam); só o
  `nasPath` muda de forma.
- **Smoke (quando o agente subir):** upload em cliente/projeto/tarefa cai nas pastas `institucional`
  corretas com o nome esperado.

## Fora de escopo

- Migrar artefatos NAS já existentes para o novo esquema (não há produção NAS ainda).
- Reintroduzir `Campanhas/` (descartado); antivírus; share/sensibilidade (inalterados).
