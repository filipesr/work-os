# Visão de pessoas — 3b: qualidade por pessoa + reclassificação — Design

**Fatia 3b de 3** do subsistema "Visão de pessoas". A 3a (carga/throughput/utilização
auto-referenciados) já entregue. Esta fatia introduz a **métrica de qualidade ligada
à pessoa** — a peça sensível.

**Fundamentação:** [biblioteca-de-conhecimento.md](../../biblioteca-de-conhecimento.md)
— **P1** (informacional), **P2** (variação é do sistema; ranquear por defeito é
inútil — Deming), **P5** (qualidade na fonte; interno≠cliente).

## ⚠️ Registro de exceção deliberada a P2

Isto cria uma **métrica de qualidade por pessoa** — uma **exceção informada e
deliberada a P2**, decidida pelo dono do produto com o aviso à vista. As
**salvaguardas são o design** e precisam ser mantidas em qualquer evolução. Um
componente desta fatia é **atualizar a biblioteca** registrando a exceção (§1/§5),
para que sessões futuras não a leiam como violação.

## Salvaguardas inegociáveis (o que torna isto defensável)

1. **Auto-referenciada, nunca comparativa:** nada ordena/rankeia/compara pessoas.
2. **Defeito-only via reclassificação humana:** um retorno não-classificado conta
   como defeito até revisado; reclassificar como "legítimo" (ex.: cliente mudou de
   direção) o remove da conta. Humano no controle → métrica mais honesta.
3. **Reclassificação só do gestor/admin** (evita gaming); a pessoa **vê** os motivos
   (auto-reflexão), mas não reclassifica.
4. **Motivos sempre à vista** — o `reason` de cada retorno é o material de coaching;
   o número nunca fica sozinho.
5. **Acesso fail-closed** (`requireSelfOrManager`); reclassificação
   `requireManagerOrAdmin`. Sem visibilidade entre pares.
6. **Zero uso motivacional:** sem pay-link, sem placar. O anti-feature da biblioteca
   segue valendo; esta é a exceção **registrada e cercada**.
7. **Atribuição é confundida por natureza** → sinal aparece como **tendência +
   contexto + motivos**, nunca nota isolada.

## Escopo 3b

Incluído:

1. Schema: `ReworkClass` + `ReworkEvent.reworkClass?` + `ReworkEvent.sourceAssigneeId?`.
2. `revertTaskStage` captura `sourceAssigneeId` (assignee da etapa-alvo, antes de limpar).
3. **Defeito-only** nos FTR: subsistema 2 (process) e a nova visão por pessoa contam
   só `reworkClass ≠ LEGITIMATE`.
4. Dados por pessoa: `getPersonQuality`, `getPersonReworkEvents`.
5. `classifyReworkEvent` (reclassificação, gestor/admin).
6. Superfícies: seção Qualidade em `/admin/users/[id]` (com toggle) + "Meu foco"
   (FTR próprio + retornos read-only).
7. Atualização da biblioteca (registro da exceção).

Explicitamente FORA / nunca:

- Comparar/ordenar/rankear pessoas por qualidade → **nunca**.
- Pessoa reclassificar os próprios retornos → não (gaming).
- Pay-link / score composto → **nunca**.

---

## Arquitetura

### Componente 1 — Schema (migração aditiva)

`prisma/schema.prisma`:

```prisma
enum ReworkClass {
  DEFECT     // falha de qualidade real (conta contra o FTR)
  LEGITIMATE // mudança legítima (ex.: cliente mudou direção) — NÃO conta
}
```

`model ReworkEvent` ganha:

```prisma
  // Classificação humana (gestor/admin). Nulo = não-classificado → conta como
  // defeito até revisado (pessimista). LEGITIMATE sai da conta do FTR.
  reworkClass ReworkClass?

  // Quem executou a etapa-origem (assignee capturado na reversão). Base do FTR
  // por pessoa (exceção deliberada a P2, ver spec). Nulo p/ eventos antigos ou
  // etapa sem assignee. NUNCA usado para ranking/comparação.
  sourceAssigneeId String?
  sourceAssignee   User?   @relation("ReworkSourceAssignee", fields: [sourceAssigneeId], references: [id], onDelete: SetNull)

  @@index([sourceAssigneeId, at])
```

`model User` ganha a relação inversa: `reworkEventsAsSource ReworkEvent[] @relation("ReworkSourceAssignee")`.

Migração `add_rework_class_and_source_assignee` (aditiva): `CREATE TYPE "ReworkClass"`;
`ALTER TABLE "ReworkEvent" ADD COLUMN "reworkClass"`, `ADD COLUMN "sourceAssigneeId"`;
FK `SetNull`; índice `(sourceAssigneeId, at)`. **Sem backfill.**

### Componente 2 — `revertTaskStage` captura `sourceAssigneeId`

`lib/actions/task.ts` `revertTaskStage`: **antes** do bloco 4c (que reativa a
etapa-alvo com `assigneeId: null`), ler o assignee atual da instância-alvo:

```ts
const targetInstance = await tx.taskActiveStage.findUnique({
  where: { taskId_stageId: { taskId, stageId: revertToStageId } },
  select: { assigneeId: true },
});
const sourceAssigneeId = targetInstance?.assigneeId ?? null;
```

e incluir `sourceAssigneeId` no `tx.reworkEvent.create` já existente (4c-bis).
`reworkClass` fica nulo na criação (classificado depois). Comportamento de reversão
inalterado.

### Componente 3 — Defeito-only nos FTR (process + pessoa)

`lib/actions/reporting.ts` — em `buildReworkWhere` (usado por
`getReworkBySourceStage` e o lado de retrabalho de `getFirstTimeRightByStage`),
adicionar o filtro defeito-only:

```ts
where.reworkClass = { not: "LEGITIMATE" }; // não-classificado (null) + DEFECT contam
```

Isso torna **ambos** os FTR do subsistema 2 defeito-only. Nota: `not: "LEGITIMATE"`
inclui `null` no Postgres/Prisma? **Verificar** — em Prisma, `{ not: X }` sobre
campo nullable NÃO inclui null por padrão. Usar explicitamente:
`{ OR: [{ reworkClass: null }, { reworkClass: "DEFECT" }] }` para garantir que
não-classificados contam. Aplicar o mesmo predicado nas queries por pessoa.

### Componente 4 — Dados por pessoa

`lib/actions/person-metrics.ts` (server-only, `requireSelfOrManager`):

```ts
export interface PersonQuality {
  completed: number; // etapas concluídas pela pessoa na janela
  defectReturns: number; // retornos-defeito atribuídos a ela
  firstTimeRight: number | null; // 1 − defect/completed (clamp); null se completed=0
  internal: number; // dos defeitos, quantos interno
  client: number; // dos defeitos, quantos cliente
}
export async function getPersonQuality(
  userId: string,
  range: { from: Date; to: Date }
): Promise<PersonQuality>;

export interface PersonReworkItem {
  id: string;
  at: string;
  taskTitle: string;
  sourceStageName: string;
  kind: "INTERNAL" | "CLIENT";
  reason: string;
  reworkClass: "DEFECT" | "LEGITIMATE" | null;
}
export async function getPersonReworkEvents(
  userId: string,
  limit?: number
): Promise<PersonReworkItem[]>;
```

- `getPersonQuality`: `completed` = TaskActiveStage COMPLETED, assigneeId=userId, completedAt na janela; `defectReturns`/internal/client = ReworkEvent sourceAssigneeId=userId, defeito-only, `at` na janela.
- `getPersonReworkEvents`: ReworkEvent sourceAssigneeId=userId (todos, inclusive LEGITIMATE, para o gestor poder reclassificar), newest first, com task/sourceStage/reason/kind/class.

### Componente 5 — Reclassificação

`lib/actions/rework-classify.ts` (`"use server"`):

```ts
export async function classifyReworkEvent(
  reworkEventId: string,
  reworkClass: "DEFECT" | "LEGITIMATE"
): Promise<{ error?: string } | void>;
```

`requireManagerOrAdmin`; valida o enum; `update`; `revalidatePath("/admin/users")`

- `revalidatePath("/dashboard")`.

### Componente 6 — Superfícies

**`/admin/users/[id]`** (gestor) — seção **Qualidade**:

- FTR da janela (headline) + split interno/cliente + **nota de confusão** ("boa parte
  da variação é do sistema; use com os motivos, não como nota").
- Lista de retornos (`getPersonReworkEvents`) com data/tarefa/etapa/motivo + um
  **toggle client `ReworkClassifyToggle`** (defeito/legítimo) → `classifyReworkEvent`.

**`/dashboard` "Meu foco"** (a pessoa) — read-only:

- Seu FTR da janela + sua lista de retornos com motivos (sem toggle).

### Componente 7 — Atualização da biblioteca

`docs/biblioteca-de-conhecimento.md`: em **P2** e em **§5 (anti-features)**, registrar
a exceção: "métrica de qualidade por pessoa existe (3b) como exceção deliberada,
cercada pelas salvaguardas [lista]; nunca comparativa, nunca pay/rank."

---

## i18n

Namespaces `admin.users` (seção Qualidade + toggle) e `dashboard` (Meu foco qualidade).
Chaves: FTR, "sinal de processo/confusão", defeito/legítimo, interno/cliente, "não
classificado", "sem base". pt-BR + es-ES paridade; es real.

## Testes

- `getPersonQuality` — FTR defeito-only (LEGITIMATE excluído; null conta); split; null se completed=0.
- `getPersonReworkEvents` — filtro por sourceAssigneeId; ordem; inclui todas as classes.
- `classifyReworkEvent` — guard manager/admin; grava a classe.
- `revertTaskStage` (append ao teste existente) — grava `sourceAssigneeId` do assignee da etapa-alvo.
- `buildReworkWhere`/FTR process — LEGITIMATE deixa de contar; null ainda conta.

## Verificação

`tsc` 0 · `vitest` (novos + regressão) · `next build` · paridade i18n · migração
aditiva. Sem mudança de comportamento além do registro/filtro.

## Pendências / próximos

- **Aplicar `prisma migrate deploy`** (`add_rework_class_and_source_assignee`).
- FTR por pessoa vale só a partir da migração (eventos antigos sem `sourceAssigneeId`).
- v2 do subsistema 1 (experiência como largura de banda) → spec próprio.
