# Qualidade & retrabalho (defeito-na-origem) — Design

**Subsistema 2 de 3** do tema "Previsibilidade e qualidade em trabalho criativo".
(Subsistema 1 "Previsão por classe" já entregue; subsistema 3 "Visão de pessoas" virá.)

**Fundamentação:** [biblioteca-de-conhecimento.md](../../biblioteca-de-conhecimento.md)
princípios **P5** (qualidade na fonte; interno≠externo — Jidoka/COPQ), **P2**
(variação é do sistema, não da pessoa — Deming), **P1** (informacional, nunca
motivacional — Austin). Research: [qualidade & retrabalho](../../pesquisa-qualidade-e-retrabalho.md).

## Objetivo

Medir qualidade de entrega e retrabalho **process-first e informacional**:
distinguir retrabalho **interno** (pego dentro do processo — o gate funcionando,
desejável) de **rejeição do cliente** (escapou — custosa), e atribuir o retorno à
**etapa-origem**. Nunca por pessoa.

## Princípios inegociáveis (bind este design)

- **Process-first, nunca individual (P2):** todas as métricas são por
  etapa/tipo/processo. NÃO existe atribuição de qualidade/retrabalho a pessoa —
  ranquear por defeito é informacionalmente inútil (Red Bead).
- **Interno ≠ cliente (P5):** o modelo distingue os dois; contá-los juntos (o
  `revert` genérico de hoje) apaga a distinção que mais importa.
- **Informacional (P1):** os números servem para conversa de melhoria de
  processo; não bloqueiam nada, não viram score/ranking/pay.
- **Honestidade do dado:** como o interno/cliente é **escolhido manualmente** ao
  reverter, depende de disciplina — reforça por que é sinal de processo, não de
  cobrança individual.

## Escopo v1

Incluído:

1. Modelo `ReworkEvent` (+ enum `ReworkKind`).
2. `revertTaskStage` grava o evento (origem = etapa-alvo; kind escolhido).
3. UI de reversão ganha o seletor obrigatório interno/cliente.
4. Reporting process-level: first-time-right por etapa/tipo; retrabalho por
   etapa-origem com split interno/cliente.
5. Dois cards em `/reports/performance`.

Explicitamente FORA (nunca / deferido):

- Atribuição individual de qualidade/retrabalho → **nunca** (P2).
- Config de "gate-type" no template para inferir interno/cliente → refinamento
  futuro (escolhemos o pick manual).
- Callout no cockpit para etapa-fonte recorrente → deferido.
- Terceiro tipo de retorno (scope-change) → v1 fica em interno/cliente.

---

## Arquitetura

### Decisão: modelo `ReworkEvent` dedicado (append-only)

O retorno é um evento com **origem única** (a etapa culpada). O `TaskStageLog`
REVERTED fica na etapa **saída** (podem ser várias por reversão) e não modela bem
"um retorno → uma etapa-origem". Um registro dedicado — coerente com o
`StageTransition` do subsistema 1 — dá agregação limpa por etapa-origem e por kind.

Alternativa (enriquecer `TaskStageLog`): rejeitada — semântica errada
(log-por-entrada vs evento-de-retorno) e atribuição espalhada.

### Componente 1 — Schema

`prisma/schema.prisma`:

```prisma
enum ReworkKind {
  INTERNAL // retrabalho pego dentro do processo (gate interno) — desejável
  CLIENT   // rejeição do cliente (escapou) — custosa
}

// ReworkEvent: um registro por reversão de tarefa. Atribui o retorno à
// etapa-ORIGEM (a etapa para a qual se reverteu = a que deve refazer, tipicamente
// onde o defeito nasceu) e classifica interno vs cliente. Sinal de PROCESSO
// (P2/P5), nunca individual. Append-only.
model ReworkEvent {
  id     String     @id @default(cuid())
  at     DateTime   @default(now())
  kind   ReworkKind
  reason String     @db.Text

  taskId String
  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)

  // Etapa-origem = a etapa-alvo da reversão (revertToStageId): a que deve refazer.
  sourceStageId String
  sourceStage   TemplateStage @relation("ReworkSource", fields: [sourceStageId], references: [id], onDelete: Cascade)

  // Quem executou a reversão (contexto/auditoria — NÃO usado para métrica individual).
  byUserId String
  byUser   User   @relation("ReworkBy", fields: [byUserId], references: [id], onDelete: Cascade)

  @@index([sourceStageId, at])
  @@index([taskId])
}
```

Relações inversas: `Task.reworkEvents ReworkEvent[]`, `TemplateStage.reworkEvents ReworkEvent[] @relation("ReworkSource")`, `User.reworkEventsBy ReworkEvent[] @relation("ReworkBy")`.

**Migração** `add_rework_event` (aditiva): `CREATE TYPE "ReworkKind"`; `CREATE TABLE
"ReworkEvent"` + FKs (`ON DELETE CASCADE`) + índices. **Sem backfill** — reversões
passadas não têm kind/origem registrados (honesto; acumula a partir daqui, como
`StageTransition`).

### Componente 2 — `revertTaskStage` grava o evento

`lib/actions/task.ts` `revertTaskStage(taskId, revertToStageId, comment)` ganha um
4º parâmetro `kind: ReworkKind`. Dentro da transação de reversão já existente,
após reativar a etapa-alvo, grava:

```ts
await tx.reworkEvent.create({
  data: {
    taskId,
    sourceStageId: revertToStageId,
    kind,
    reason: comment.trim(),
    byUserId: currentUserId,
  },
});
```

Comportamento de reversão **inalterado**; só acrescenta o registro. Validar `kind`
∈ {INTERNAL, CLIENT} (early-return em valor inválido, no padrão das outras validações).

### Componente 3 — UI de reversão

`components/tasks/RevertStageButton.tsx` (client): adicionar estado `kind` e um
seletor **obrigatório** origem: `( ) interno ( ) cliente` ao lado do campo de
motivo. O submit passa a chamar `run(taskId, selectedStageId, comment, kind)` e o
botão fica desabilitado até `kind` estar escolhido (junto das validações atuais de
`selectedStageId` + `comment`). i18n para os rótulos.

### Componente 4 — Reporting (process-level, segmentável por tipo)

`lib/actions/reporting.ts` — novas funções, reusando `PerformanceFilters`
(inclui `templateId` → `workflowTemplateId`, do subsistema 1) e o padrão de janela:

- **`getReworkBySourceStage(filters)`** → por `sourceStageId`: `{ stageId,
stageName, templateName, internal, client, total }`, ordenado por `total` desc.
  Agrupa `ReworkEvent` na janela (por `at`), filtra por template via
  `task.workflowTemplateId` e project/client via `task`. Responde "qual etapa mais
  injeta defeito a jusante, e está sendo pego dentro (bom) ou escapando pro
  cliente (custoso)".

- **`getFirstTimeRightByStage(filters)`** → por etapa: `{ stageId, stageName,
templateName, completed, reworkedTo, firstTimeRight }` onde
  `firstTimeRight = clamp(1 − reworkedTo/completed, 0, 1)`. `completed` = nº de
  `TaskStageLog` COMPLETED da etapa na janela (via `buildStageLogWhere`);
  `reworkedTo` = nº de `ReworkEvent` com `sourceStageId = S` na janela.
  Aproximação process-level (razão de janela, não pareamento 1:1 completo↔retorno)
  — documentar. Ordenar por `firstTimeRight` asc (pior primeiro).

Opcional: o `getReworkRateByStage` genérico atual pode passar a expor o split
interno/cliente, ou permanecer como está (decidir na implementação; não bloqueia).

### Componente 5 — Superfície

`/reports/performance`: dois cards novos (Suspense, no padrão dos existentes),
herdando o `filters` (logo o seletor de tipo do subsistema 1 já os segmenta):

- **"First-time-right por etapa"** — % por etapa (verde alto / âmbar / vermelho
  baixo), com `completed`/`reworkedTo`.
- **"Retrabalho por etapa-origem"** — por etapa: barra/split **interno vs
  cliente** + total. Legenda explicando que interno = gate funcionando (bom) e
  cliente = escapou (custoso).

Ambos com nota de que é **sinal de processo** (P2), e aviso de baixa base quando
os números forem pequenos (coerente com o cold-start do subsistema 1).

---

## i18n

Namespaces `reportsPerformance` (cards + legendas + `firstTimeRight.*`,
`reworkBySource.*`, `reworkKind.internal|client`) e `tasks` (rótulos do seletor
de origem na reversão). pt-BR + es-ES em paridade; es-ES real.

## Testes

Puros/lógica (mock Prisma):

- `getReworkBySourceStage` — agrupamento por etapa-origem, split interno/cliente,
  filtro por template.
- `getFirstTimeRightByStage` — razão e clamp [0,1]; etapa sem retorno → FTR 1.
- `revertTaskStage` — grava `ReworkEvent` com `sourceStageId = revertToStageId`,
  `kind` e `byUserId` corretos; reversão continua funcionando (mocks de tx
  atualizados p/ `reworkEvent`).

## Verificação

`tsc --noEmit` 0 · `vitest` (novos + regressão) · `next build` limpo · paridade
i18n · migração aditiva aplicável. Sem mudança de comportamento existente da
reversão além do registro do evento.

## Pendências / próximos

- **Aplicar `prisma migrate deploy`** (`add_rework_event`) no ambiente do usuário.
- Dado acumula a partir da migração (reversões antigas não entram).
- Refinamentos futuros: inferir interno/cliente por gate-type de etapa; callout no
  cockpit para etapa-fonte recorrente; subsistema 3 (visão de pessoas) usa estes
  sinais de qualidade como uma das 4 lentes — **process-level, nunca ranking**.
