# Design — Versionamento de artefatos (Feature A)

**Data:** 2026-07-06
**Status:** design aprovado — pendente implementação
**Relaciona-se com:** `2026-07-06-unified-artifacts-ui-design.md` (o painel unificado é onde a UI entra).

## Context

Um artefato (ex.: briefing) de uma tarefa concluída pode sofrer alteração. Hoje não há
versionamento para links, e o card mostra só o tempo de criação (sem a palavra "Criado", implícita).
Precisamos: (1) uma ação explícita **"Nova versão"**; (2) o card mostrar **"Criado"/"Atualizado"** +
selo de versão e permitir ver versões antigas (**dropdown inline** no card).

## Decisões

- **Modelo (cadeia por raiz):** `TaskArtifact` ganha `rootId String?`, `version Int @default(1)`,
  `isCurrent Boolean @default(true)`. A v1 é raiz de si mesma (`rootId = null`). A "raiz efetiva" de
  qualquer linha é `rootId ?? id`. Migração aditiva; linhas existentes viram v1 atual.
- **Listagens mostram só a atual:** todas as queries de artefato filtram `isCurrent: true`.
- **"Nova versão" (link agora):** botão no card abre o form já no escopo; ao enviar, cria uma nova
  linha (`version = atual + 1`, mesma raiz, `isCurrent: true`) e marca a anterior `isCurrent: false`.
  A aba Upload NAS de nova versão fica desabilitada por ora (entra com o rollout do NAS).
- **Rótulo do card:** `version === 1` → **"Criado há X"**; `version > 1` → **"Atualizado há X"** +
  selo **`v{N}`** + expander **"ver versões"**.
- **Ver versões:** o expander chama `getArtifactVersions(id)` e lista as versões da cadeia (abrir
  link / baixar por versão, autor, data), ordenadas desc.
- **Permissão de nova versão:** igual à de adicionar (membro+ na tarefa; MANAGER+ em projeto/cliente).

## Modelo de dados

```prisma
model TaskArtifact {
  // ...campos existentes...
  rootId    String?  // raiz da cadeia de versões; null = a própria linha é a raiz
  version   Int      @default(1)
  isCurrent Boolean  @default(true)
  @@index([rootId])
}
```

Migração: `ADD COLUMN rootId TEXT`, `ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
`ADD COLUMN isCurrent BOOLEAN NOT NULL DEFAULT true`, `CREATE INDEX` em `rootId`. Existentes ficam
`version=1, isCurrent=true, rootId=null` (cada uma é sua própria raiz atual).

## Componentes e mudanças

- **`lib/actions/artifact.ts`:**
  - `addLinkArtifactVersion(artifactId, { title, url, type })`: carrega a linha atual (deve ser
    `isCurrent`), valida RBAC pelo escopo, cria a nova versão (mesma raiz/escopo/dono), marca a
    anterior `isCurrent:false`. Revalida os paths.
  - `getArtifactVersions(artifactId)`: `root = art.rootId ?? art.id`; retorna
    `where OR [{ id: root }, { rootId: root }]`, incluindo `user`, ordenado por `version desc`.
    Mapeia para linhas unificadas.
- **`lib/artifacts/unify.ts`:** `UnifiedArtifactRow` ganha `version: number`. `mapArtifactRow`
  preenche `version` (default 1).
- **Queries das telas:** adicionar `isCurrent: true` ao `where` dos artefatos em
  `tasks/[taskId]/page.tsx`, `admin/tasks/[taskId]/page.tsx`, `admin/projects/[projectId]/page.tsx`,
  `admin/clients/[clientId]/page.tsx` (task.artifacts, project.artifacts, client.artifacts,
  tasks.artifacts).
- **`components/artifacts/UnifiedArtifactsPanel.tsx`:**
  - Rótulo "Criado/Atualizado" por `version`; selo `v{N}` quando `version > 1`.
  - Botão **"Nova versão"** por linha (quando `canAdd`) que abre o form de link daquela linha e chama
    `addLinkArtifactVersion`.
  - Expander **"ver versões"** (quando `version > 1`) que carrega `getArtifactVersions` e lista as
    anteriores inline.

## Testes / verificação

- **Vitest:** `addLinkArtifactVersion` (cria v2, marca v1 não-atual, mesma raiz; RBAC por escopo);
  `getArtifactVersions` (agrupa por raiz, ordem desc); `mapArtifactRow` inclui `version`.
- **Smoke manual:** adicionar link → "Criado"; criar nova versão → card mostra "Atualizado" + `v2`;
  expandir → ver v1; lista principal mostra só a atual.

## Fora de escopo

- Nova versão via **Upload NAS** (entra com o rollout do NAS; a aba fica desabilitada até lá).
- Reverter para uma versão antiga (só visualização por ora).
