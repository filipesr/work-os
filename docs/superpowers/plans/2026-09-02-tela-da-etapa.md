# A tela da etapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada etapa da demanda ganha endereço e tela próprios; `/tasks/{id}` vira leitura, `/admin/tasks/{id}` concentra as decisões da demanda, e a instrução da etapa passa a chegar a quem executa no momento em que a etapa é liberada.

**Architecture:** a rota nova `/tasks/[taskId]/stages/[activeStageId]` é chaveada pela INSTÂNCIA da etapa (`TaskActiveStage.id`), não pela etapa do template — é o que faz esta tela atravessar a migração de instâncias sem reescrita. O comentário ganha duas colunas (`activeStageId`, `kind`) e a demanda ganha `createdById`; nenhuma obrigatória, nenhum backfill. As peças de leitura que hoje vivem dentro de `TaskDetailView` são extraídas para que as duas telas mostrem a mesma conversa sem duplicá-la.

**Tech Stack:** Next.js 15 (App Router, Server Components e Server Actions), Prisma/PostgreSQL, next-intl v4, Tailwind, vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-tela-da-etapa-design.md`

## Global Constraints

- **Migrações são arquivos SQL versionados** em `prisma/migrations/YYYYMMDDHHMMSS_nome/migration.sql`, com comentário no topo explicando POR QUE a mudança existe — ver `20260901120000_add_stage_completion_note` como modelo. Não use `db push`.
- **Nenhum backfill.** Comentário antigo fica sem etapa; demanda antiga fica sem criador. Inventar o vínculo pelo autor é o defeito que esta entrega remove.
- **Toda string de tela passa por `t()`** e entra em `locales/pt-BR/*.json` **e** `locales/es-ES/*.json` na mesma tarefa (o teste de paridade falha se um locale ficar para trás; o es-ES precisa ser espanhol de verdade). Isso vale também para texto gerado por Server Action — o comentário de reversão de hoje é o contra-exemplo que esta entrega conserta.
- **A tela explica, o servidor garante.** Nenhuma regra validada só na interface.
- **Comentários documentam POR QUE, não o quê.** Um comentário que repete o código é defeito aqui.
- **Nunca enfraquecer um teste para ele passar**, e nunca degradar marcação de produção para satisfazer um matcher — afrouxe o matcher.
- **`lib/actions/*.ts` marcados `"use server"` só exportam função assíncrona** (`export type` é apagado na compilação e pode).
- **Verificar antes de cada commit:** `npx vitest run <arquivo>`; antes do último de cada tarefa, `npx tsc --noEmit`.

### Precisão que a spec deixou ambígua

A spec chama a coluna de `TaskComment.stageId`. O plano usa **`activeStageId`, apontando para `TaskActiveStage`** (a instância), não para `TemplateStage`. É a mesma escolha que a spec defende para a rota, e pelo mesmo motivo: quando a demanda puder ter duas "Gravação", um vínculo pela etapa do template não saberia de qual das duas o comentário é. `ON DELETE SET NULL` — a janela de correção apaga linhas de etapa opcional, e um comentário não pode sumir junto.

---

### Task 1: As três colunas

**Files:**

- Create: `prisma/migrations/20260902120000_add_stage_comments/migration.sql`
- Modify: `prisma/schema.prisma`
- Test: `__tests__/lib/comment-kind.test.ts`

**Interfaces:**

- Produces: `TaskComment.activeStageId String?`, `TaskComment.kind CommentKind @default(USER)`, `Task.createdById String?`, enum `CommentKind { USER STAGE_INSTRUCTION }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** O schema é a fonte da verdade destas três colunas, e elas são o alicerce de todo o resto do
 *  plano. Um teste que lê o schema parece rodeio, mas é a única forma de falhar CEDO se alguém
 *  aplicar a migração sem atualizar o modelo (ou o contrário) — o Prisma Client só reclamaria em
 *  runtime, na primeira demanda com instrução. */
describe("modelo do comentário de etapa", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  it("o comentário aponta para a INSTÂNCIA da etapa, e o vínculo é opcional", () => {
    // Instância, não etapa do template: quando a demanda puder ter duas "Gravação", o template não
    // saberia de qual delas é o comentário. Opcional porque nem toda conversa é de etapa.
    expect(schema).toMatch(/activeStageId\s+String\?/);
    expect(schema).toMatch(/activeStage\s+TaskActiveStage\?/);
  });

  it("o tipo do comentário distingue conversa de instrução", () => {
    expect(schema).toMatch(/enum CommentKind \{[^}]*USER[^}]*STAGE_INSTRUCTION[^}]*\}/s);
    expect(schema).toMatch(/kind\s+CommentKind\s+@default\(USER\)/);
  });

  it("a demanda passa a guardar quem a criou", () => {
    // O sistema não guardava isto: `Task` tinha título, prazo, projeto e template, e nenhum autor.
    expect(schema).toMatch(/createdById\s+String\?/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/comment-kind.test.ts`
Expected: FAIL nos três — nenhuma das colunas existe.

- [ ] **Step 3: Write the migration and the schema**

`prisma/migrations/20260902120000_add_stage_comments/migration.sql`:

```sql
-- A etapa entra no comentário, e a demanda passa a saber quem a criou.
--
-- Três colunas anuláveis e nenhum backfill: comentário antigo fica sem etapa e demanda antiga sem
-- criador. Inventar esses vínculos pelo autor é exatamente o defeito que esta entrega remove do
-- WorkflowHistoryModal — gravá-lo promoveria o chute a dado.
--
-- `activeStageId` aponta para a INSTÂNCIA (TaskActiveStage), não para a etapa do template: quando a
-- demanda puder ter duas "Gravação" (spec das instâncias), o template não diria de qual delas é o
-- comentário. SET NULL porque a janela de correção apaga linhas de etapa opcional, e um comentário
-- não pode sumir junto com o recorte do fluxo.
CREATE TYPE "CommentKind" AS ENUM ('USER', 'STAGE_INSTRUCTION');

ALTER TABLE "TaskComment" ADD COLUMN "kind" "CommentKind" NOT NULL DEFAULT 'USER';
ALTER TABLE "TaskComment" ADD COLUMN "activeStageId" TEXT;
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_activeStageId_fkey"
  FOREIGN KEY ("activeStageId") REFERENCES "TaskActiveStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A leitura que interessa é "os comentários desta etapa", montada a cada abertura da tela da etapa.
CREATE INDEX "TaskComment_activeStageId_idx" ON "TaskComment"("activeStageId");
```

Em `prisma/schema.prisma`, no `model TaskComment`:

```prisma
  // A etapa em que o comentário nasceu. Aponta para a INSTÂNCIA porque a mesma etapa do template
  // poderá ser executada duas vezes na mesma demanda (retrabalho). Nulo = conversa da demanda,
  // escrita em /admin, e o caso de todo comentário anterior a esta coluna.
  activeStageId String?
  activeStage   TaskActiveStage? @relation(fields: [activeStageId], references: [id], onDelete: SetNull)

  // `STAGE_INSTRUCTION` é direcionamento do gestor entregue no momento da liberação — tem título
  // próprio na tela e ninguém o edita. `USER` é conversa.
  kind CommentKind @default(USER)
```

No `model Task`: `createdById String?` + `createdBy User? @relation("TaskCreator", fields: [createdById], references: [id], onDelete: SetNull)`; no `model User`, o lado inverso `createdTasks Task[] @relation("TaskCreator")`; no `model TaskActiveStage`, o inverso `comments TaskComment[]`; e o enum novo:

```prisma
enum CommentKind {
  USER
  STAGE_INSTRUCTION
}
```

- [ ] **Step 4: Apply and verify**

Run: `npx prisma migrate dev --name add_stage_comments` e depois `npx vitest run __tests__/lib/comment-kind.test.ts && npx tsc --noEmit`
Expected: PASS (3 testes) e tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add prisma __tests__/lib/comment-kind.test.ts
git commit -m "feat(etapa): a etapa entra no comentário, e a demanda ganha criador"
```

---

### Task 2: A demanda registra quem a criou

**Files:**

- Modify: `lib/actions/task.ts:64` (`createTask`)
- Test: `__tests__/lib/actions/create-task-creator.test.ts`

**Interfaces:**

- Consumes: `Task.createdById` (Task 1).
- Produces: toda demanda nova nasce com `createdById`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
  requireManagerOrAdmin: vi.fn(),
  getSessionUser: vi.fn(),
}));

const { createTaskStages } = vi.hoisted(() => ({ createTaskStages: vi.fn() }));
vi.mock("@/lib/stage-assignment-helpers", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createTaskStages,
}));

const tx = { task: { create: vi.fn().mockResolvedValue({ id: "t1" }) } };
vi.mock("@/lib/prisma", () => ({
  default: {
    workflowTemplate: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import { createTask } from "@/lib/actions/task";

function formulario() {
  const fd = new FormData();
  fd.set("title", "Reels institucional");
  fd.set("projectId", "p1");
  fd.set("templateId", "wt1");
  fd.set("priority", "MEDIUM");
  fd.set("dueDate", "2026-12-01");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.task.create.mockResolvedValue({ id: "t1" });
});

describe("createTask", () => {
  it("grava quem criou a demanda", async () => {
    // Sem isto a instrução da etapa não teria autor: ela é assinada por quem GEROU a demanda,
    // independente de quem venha a executar a etapa. E o sistema não guardava esse dado.
    await createTask(formulario());
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({ createdById: "gestor1" });
  });
});
```

> Este preparo é o de `__tests__/lib/actions/duplicate-task.test.ts`, adaptado. LEIA aquele arquivo antes: se `createTask` exigir algum modelo a mais no mock de prisma, é de lá que sai o formato.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/create-task-creator.test.ts`
Expected: FAIL — o `data` da criação não tem `createdById`.

- [ ] **Step 3: Write minimal implementation**

Em `createTask`, no `data` do `prisma.task.create`, acrescentar:

```ts
        // Quem gerou a demanda assina a instrução das etapas dela — inclusive as que outra pessoa
        // vai executar. É por isso que este campo existe.
        createdById: userId,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/create-task-creator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/task.ts __tests__/lib/actions/create-task-creator.test.ts
git commit -m "feat(etapa): a demanda passa a registrar quem a criou"
```

---

### Task 3: `addComment` aceita a etapa

**Files:**

- Modify: `lib/actions/task.ts:1982` (`addComment`)
- Modify: `components/tasks/AddCommentForm.tsx:16`
- Test: `__tests__/lib/actions/add-comment-stage.test.ts`

**Interfaces:**

- Consumes: `TaskComment.activeStageId` (Task 1).
- Produces: `addComment(taskId: string, content: string, activeStageId?: string | null)`; `<AddCommentForm taskId userId activeStageId={string | null} />`.

- [ ] **Step 1: Write the failing test**

```ts
describe("addComment", () => {
  it("guarda a etapa quando ela é informada", async () => {
    // É o que substitui TODA a regra de desempate: quem escreve na tela da etapa está dizendo de
    // qual etapa fala, e o servidor só registra o que a tela já sabe.
    await addComment("t1", "faltou o off", "as9");
    expect(db.taskComment.create.mock.calls[0][0].data).toMatchObject({
      taskId: "t1",
      activeStageId: "as9",
      kind: "USER",
    });
  });

  it("sem etapa informada, grava nulo — é conversa da demanda", async () => {
    // "O cliente adiou tudo" não é de etapa nenhuma. Forçar uma escolha aqui seria o mesmo chute
    // que esta entrega remove, feito pela pessoa em vez do código.
    await addComment("t1", "cliente adiou tudo");
    expect(db.taskComment.create.mock.calls[0][0].data.activeStageId).toBeNull();
  });

  it("comentário de gente é sempre USER — o tipo não vem de fora", async () => {
    // `kind` decide o que é editável e o que tem título de instrução. Aceitá-lo por parâmetro
    // deixaria a tela forjar uma instrução assinada por quem ela quisesse.
    await addComment("t1", "oi", "as9");
    expect(db.taskComment.create.mock.calls[0][0].data.kind).toBe("USER");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/add-comment-stage.test.ts`
Expected: FAIL — `addComment` só aceita dois parâmetros e não grava `activeStageId` nem `kind`.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function addComment(
  taskId: string,
  content: string,
  /** A etapa em que a conversa acontece. Nulo é conversa da DEMANDA (escrita em /admin): nem toda
   *  conversa é de etapa, e forçar uma escolha seria o chute que esta feature existe para remover. */
  activeStageId?: string | null
) {
```

e no `data` do `create`: `activeStageId: activeStageId ?? null,` e `kind: "USER",` — este último cravado, nunca por parâmetro: `kind` decide o que é editável e o que ganha título de instrução, e aceitá-lo de fora deixaria a tela forjar uma instrução.

Em `AddCommentForm`, acrescentar a prop `activeStageId: string | null` e repassá-la na chamada.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/add-comment-stage.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/task.ts components/tasks/AddCommentForm.tsx __tests__/lib/actions/add-comment-stage.test.ts
git commit -m "feat(etapa): o comentário sabe de que etapa ele é"
```

---

### Task 4: A instrução chega quando a etapa é liberada

**Files:**

- Create: `lib/stage-instruction.ts`
- Modify: `lib/actions/task.ts:671` (`activateNextStages`)
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`
- Test: `__tests__/lib/stage-instruction.test.ts`, `__tests__/lib/actions/activate-instruction.test.ts`

**Interfaces:**

- Consumes: `TaskComment.kind`, `Task.createdById` (Task 1).
- Produces: `buildInstructionComments(input): { taskId, userId, activeStageId, kind, content }[]` — puro.

- [ ] **Step 1: Write the failing test (a função pura)**

```ts
import { describe, it, expect } from "vitest";
import { buildInstructionComments } from "@/lib/stage-instruction";

const BASE = {
  taskId: "t1",
  createdById: "gestor1",
  ativadas: [
    { activeStageId: "as2", instructions: "Gravar no estúdio B" },
    { activeStageId: "as3", instructions: null },
  ],
};

describe("buildInstructionComments", () => {
  it("uma instrução vira um comentário assinado por quem criou a demanda", () => {
    // Independente de quem executa a etapa: quem escreveu o direcionamento foi o gestor da criação.
    expect(buildInstructionComments(BASE)).toEqual([
      {
        taskId: "t1",
        userId: "gestor1",
        activeStageId: "as2",
        kind: "STAGE_INSTRUCTION",
        content: "Gravar no estúdio B",
      },
    ]);
  });

  it("etapa sem instrução não gera comentário", () => {
    // Não há texto a entregar, e um marco vazio precisaria de um autor que ninguém escreveu.
    expect(buildInstructionComments({ ...BASE, ativadas: [BASE.ativadas[1]] })).toEqual([]);
  });

  it("demanda sem criador registrado não gera nada", () => {
    // Demanda anterior a esta entrega. Sem autor conhecido, assinar em nome de alguém seria
    // inventar — e a instrução continua aparecendo nos três lugares onde já aparecia.
    expect(buildInstructionComments({ ...BASE, createdById: null })).toEqual([]);
  });

  it("instrução só de espaços conta como ausente", () => {
    expect(
      buildInstructionComments({
        ...BASE,
        ativadas: [{ activeStageId: "as2", instructions: "   " }],
      })
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/stage-instruction.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/stage-instruction"`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * A instrução da etapa, entregue no momento em que a etapa é liberada.
 *
 * `TaskActiveStage.instructions` é escrita na criação da demanda e aparece em três telas — mas
 * nunca no instante em que alguém vai executar. Instrução que ninguém lê na hora certa é instrução
 * perdida, e é isso que este comentário conserta.
 *
 * Puro e separado da action porque a decisão ("gera ou não gera, assinada por quem") é regra, e a
 * action é transação: misturá-las esconde a regra dentro de um `for` no meio de um `$transaction`.
 */
export function buildInstructionComments(input: {
  taskId: string;
  /** Quem gerou a demanda. Nulo nas anteriores a esta entrega — e aí nada é gerado, porque assinar
   *  em nome de alguém seria inventar autoria. */
  createdById: string | null;
  ativadas: { activeStageId: string; instructions: string | null }[];
}) {
  if (!input.createdById) return [];
  return input.ativadas
    .filter((a) => (a.instructions ?? "").trim().length > 0)
    .map((a) => ({
      taskId: input.taskId,
      userId: input.createdById as string,
      activeStageId: a.activeStageId,
      kind: "STAGE_INSTRUCTION" as const,
      content: (a.instructions as string).trim(),
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/stage-instruction.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Write the failing test (a action)**

Em `__tests__/lib/actions/activate-instruction.test.ts`, mockando prisma no molde de `__tests__/lib/actions/activate-next-stages.test.ts` (que já existe e cobre esta action — LEIA-O primeiro e reaproveite o preparo):

```ts
it("liberar uma etapa com instrução cria o comentário assinado pelo criador", async () => {
  // O fio inteiro: activateNextStages descobre o que virou ACTIVE, e é ali que a instrução vira
  // conversa. Fora dali, ela continuaria escrita e não lida.
  await activateNextStages("t1", "s1");

  expect(db.taskComment.createMany).toHaveBeenCalledWith({
    data: [
      {
        taskId: "t1",
        userId: "gestor1",
        activeStageId: "as2",
        kind: "STAGE_INSTRUCTION",
        content: "Gravar no estúdio B",
      },
    ],
  });
});

it("nenhuma ativada com instrução: não chama o banco à toa", async () => {
  await activateNextStages("t1", "s1");
  expect(db.taskComment.createMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/activate-instruction.test.ts`
Expected: FAIL — `createMany` nunca é chamado.

- [ ] **Step 7: Write minimal implementation**

Em `activateNextStages`, depois do laço que aplica as transições (onde `activated` já está preenchido), buscar as linhas ativadas e o criador, e gravar:

```ts
// A instrução vira conversa AQUI, e não na criação da demanda: é neste instante que alguém
// passa a poder executar a etapa, e é para essa pessoa que o direcionamento foi escrito.
if (activated.length > 0) {
  const [task, linhas] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId }, select: { createdById: true } }),
    prisma.taskActiveStage.findMany({
      where: { taskId, stageId: { in: activated.map((s) => s.id) } },
      select: { id: true, instructions: true },
    }),
  ]);
  const comentarios = buildInstructionComments({
    taskId,
    createdById: task?.createdById ?? null,
    ativadas: linhas.map((l) => ({ activeStageId: l.id, instructions: l.instructions })),
  });
  if (comentarios.length > 0) await prisma.taskComment.createMany({ data: comentarios });
}
```

- [ ] **Step 8: Run tests and commit**

Run: `npx vitest run __tests__/lib/stage-instruction.test.ts __tests__/lib/actions && npx tsc --noEmit`

```bash
git add lib/stage-instruction.ts lib/actions/task.ts __tests__/lib/stage-instruction.test.ts __tests__/lib/actions/activate-instruction.test.ts
git commit -m "feat(etapa): a instrução chega a quem executa, quando a etapa é liberada"
```

---

### Task 5: O comentário de reversão para de ser português cravado no código

**Files:**

- Modify: `lib/actions/task.ts:~1947` (dentro de `revertTaskStage`)
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`
- Test: `__tests__/lib/actions/revert-comment.test.ts`

**Interfaces:**

- Consumes: `TaskComment.kind`, `activeStageId` (Task 1).
- Produces: nenhuma API nova.

**O que existe hoje**, e é o defeito: a action monta o corpo à mão, em português, com `new Date().toLocaleString("pt-BR")` — texto de produto dentro do código, invisível para o guarda de paridade porque não está em locale nenhum, e um comentário de sistema fingindo ser de usuário.

- [ ] **Step 1: Write the failing test**

```ts
it("o comentário da reversão é INSTRUÇÃO da etapa que volta, assinada por quem reverteu", async () => {
  // Simetria com a etapa coringa: coringa → instrução de quem criou a demanda; retrabalho →
  // instrução de quem reverteu. Quem vai refazer precisa do motivo no lugar onde vai trabalhar.
  await revertTaskStage("t1", "s2", "faltou o off do final", "INTERNAL");

  const criado = db.taskComment.create.mock.calls[0][0].data;
  expect(criado).toMatchObject({
    taskId: "t1",
    userId: "ana",
    activeStageId: "as2",
    kind: "STAGE_INSTRUCTION",
  });
  expect(criado.content).toContain("faltou o off do final");
});

it("NENHUMA palavra do corpo vem do código", async () => {
  // O corpo de hoje traz "**TAREFA REVERTIDA** por", "De:", "Para:", "**Motivo:**" e "Data:"
  // cravados na action, mais uma data formatada em pt-BR para quem lê em espanhol. Este teste é o
  // que impede a volta: o mock de i18n devolve a CHAVE, então nenhuma frase pode sobreviver nele.
  await revertTaskStage("t1", "s2", "faltou o off", "INTERNAL");

  const { content } = db.taskComment.create.mock.calls[0][0].data;
  for (const cravada of ["TAREFA REVERTIDA", "De:", "Para:", "Motivo:", "Data:"]) {
    expect(content).not.toContain(cravada);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/revert-comment.test.ts`
Expected: FAIL nos dois — o comentário nasce `USER`, sem etapa, e o corpo tem as frases cravadas.

- [ ] **Step 3: Write minimal implementation**

Trocar o `content` montado à mão por uma chave com parâmetros, e o registro pela linha da etapa alvo:

```ts
// O motivo da reversão É a instrução da etapa que volta a ser executada: quem vai refazer
// precisa dele no lugar onde vai trabalhar, não numa linha perdida da conversa da demanda.
// O texto sai do locale — antes era português cravado aqui, com data em pt-BR para qualquer
// visitante, e a paridade de locales não via porque a string não estava em locale nenhum.
await tx.taskComment.create({
  data: {
    taskId,
    userId: currentUserId,
    activeStageId: linhaAlvo.id,
    kind: "STAGE_INSTRUCTION",
    content: tTask("revertInstruction", { reason: comment.trim() }),
  },
});
```

`linhaAlvo` é a linha de `TaskActiveStage` da etapa para onde se reverteu — a transação já a atualiza; capture o `id` dela ali. Chaves novas (`tasks.detail` ou o namespace já usado por `tTask` na action):

```json
"revertInstruction": "Retrabalho pedido: {reason}"
```

es-ES: `"revertInstruction": "Retrabajo solicitado: {reason}"`

> Quem reverteu, de onde veio e quando já estão gravados em `TaskStageLog`/`StageTransition` e no próprio autor e data do comentário. Repetir isso no corpo era duplicar dado — e é o que produzia as cinco frases cravadas.

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run __tests__/lib/actions __tests__/i18n && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/task.ts locales __tests__/lib/actions/revert-comment.test.ts
git commit -m "fix(etapa): o motivo da reversão vira instrução da etapa, e sai do locale"
```

---

### Task 6: A leitura da tela da etapa

**Files:**

- Create: `lib/actions/stage-view.ts`
- Test: `__tests__/lib/actions/stage-view.test.ts`

**Interfaces:**

- Consumes: `TaskComment.activeStageId`, `kind` (Task 1).
- Produces:

```ts
export type StageView = {
  stage: {
    activeStageId: string;
    name: string;
    order: number;
    status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
    teamName: string | null;
    assignee: { id: string; name: string } | null;
    instruction: string | null;
  };
  task: {
    id: string;
    title: string;
    dueDate: Date | null;
    projectName: string;
    clientName: string;
  };
  /** A conversa INTEIRA da demanda: a etapa é uma lente sobre ela, não um recorte. */
  comments: {
    id: string;
    content: string;
    createdAt: Date;
    kind: "USER" | "STAGE_INSTRUCTION";
    activeStageId: string | null;
    author: { id: string; name: string };
  }[];
};
/** Recebe a demanda da URL junto: o id da etapa existir não basta — ver o guarda na Task 7. */
export async function getStageView(
  activeStageId: string,
  taskId: string
): Promise<StageView | null>;
```

- [ ] **Step 1: Write the failing test**

```ts
it("devolve a etapa, a demanda e a conversa INTEIRA", async () => {
  // A conversa não é filtrada pela etapa: a tela realça o bloco dela, mas quem opera precisa do
  // contexto todo — foi a decisão explícita da spec.
  const v = await getStageView("as2");
  expect(v?.stage.activeStageId).toBe("as2");
  expect(v?.comments.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
});

it("a instrução da etapa vem separada, para o destaque do topo", async () => {
  const v = await getStageView("as2");
  expect(v?.stage.instruction).toBe("Gravar no estúdio B");
});

it("etapa inexistente devolve nulo, e a rota vira 404", async () => {
  db.taskActiveStage.findUnique.mockResolvedValue(null);
  expect(await getStageView("nao-existe", "t1")).toBeNull();
});

it("recusa quem não está autenticado", async () => {
  // Rota nova é onde se esquece a porta. `getSessionUser` é a mesma que /tasks/{id} usa, e este
  // teste é o que impede a tela da etapa de nascer aberta.
  vi.mocked(getSessionUser).mockRejectedValueOnce(new Error("Access Denied"));
  await expect(getStageView("as2", "t1")).rejects.toThrow(/Access Denied/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/stage-view.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";

export async function getStageView(activeStageId: string, taskId: string) {
  // Mesma porta de /tasks/{id}: a tela da etapa não afrouxa quem enxerga o quê.
  await getSessionUser();

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      status: true,
      instructions: true,
      taskId: true,
      stage: { select: { name: true, order: true } },
      team: { select: { name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      task: {
        select: {
          id: true,
          title: true,
          dueDate: true,
          project: { select: { name: true, client: { select: { name: true } } } },
        },
      },
    },
  });
  if (!row || row.taskId !== taskId) return null;

  // A conversa INTEIRA da demanda: a etapa é uma lente sobre ela, não um recorte. Filtrar aqui
  // tiraria de quem opera o contexto do que já foi dito nas etapas anteriores.
  const comments = await prisma.taskComment.findMany({
    where: { taskId: row.taskId },
    select: {
      id: true,
      content: true,
      createdAt: true,
      kind: true,
      activeStageId: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // `name ?? email ?? id` é a convenção do projeto — conta sem nome não pode virar um cuid na tela.
  const nomeDe = (u: { id: string; name: string | null; email: string | null }) =>
    u.name ?? u.email ?? u.id;

  return {
    stage: {
      activeStageId: row.id,
      name: row.stage.name,
      order: row.stage.order,
      status: row.status,
      teamName: row.team?.name ?? null,
      assignee: row.assignee ? { id: row.assignee.id, name: nomeDe(row.assignee) } : null,
      instruction: row.instructions,
    },
    task: {
      id: row.task.id,
      title: row.task.title,
      dueDate: row.task.dueDate,
      projectName: row.task.project.name,
      clientName: row.task.project.client.name,
    },
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      kind: c.kind,
      activeStageId: c.activeStageId,
      author: { id: c.user.id, name: nomeDe(c.user) },
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/stage-view.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/stage-view.ts __tests__/lib/actions/stage-view.test.ts
git commit -m "feat(etapa): a leitura da tela da etapa"
```

---

### Task 7: A rota, e o guarda que ela precisa

**Files:**

- Create: `app/[locale]/(protected)/tasks/[taskId]/stages/[activeStageId]/page.tsx`
- Create: `app/[locale]/(protected)/tasks/[taskId]/stages/[activeStageId]/not-found.tsx`
- Test: `__tests__/lib/actions/stage-view.test.ts` (estende o da Task 6)

**Interfaces:**

- Consumes: `getStageView` (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
it("[CRÍTICO] recusa etapa que não pertence à demanda da URL", async () => {
  // `/tasks/t1/stages/as-de-outra-demanda` não pode abrir: o id existir não basta. Sem esta
  // checagem, trocar o taskId na barra de endereço mostraria a conversa de OUTRA demanda no
  // cabeçalho de uma que não é dela.
  db.taskActiveStage.findUnique.mockResolvedValue({ ...linha(), taskId: "OUTRA" });
  expect(await getStageView("as2", "t1")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/stage-view.test.ts -t "não pertence"`
Expected: FAIL — a função ignora o `taskId`.

- [ ] **Step 3: Write minimal implementation**

A checagem `row.taskId !== taskId` já foi escrita na Task 6; esta tarefa a EXERCITA pela rota e trata o nulo:

```tsx
export default async function StagePage({
  params,
}: {
  params: Promise<{ taskId: string; activeStageId: string }>;
}) {
  const { taskId, activeStageId } = await params;
  const view = await getStageView(activeStageId, taskId);
  // Nulo cobre os dois casos, e de propósito: etapa que não existe e etapa de OUTRA demanda são o
  // mesmo 404 para quem está do lado de fora — distinguir os dois contaria o que existe no banco.
  if (!view) notFound();
  return <StageWorkView view={view} currentUserId={/* getSessionUser().id */ ""} />;
}
```

`not-found.tsx` no molde do irmão em `tasks/[taskId]/not-found.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/stage-view.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(protected)/tasks/[taskId]/stages" lib/actions/stage-view.ts __tests__/lib/actions/stage-view.test.ts
git commit -m "feat(etapa): a rota da etapa, com o guarda de pertencimento"
```

---

### Task 8: A tela — cabeçalho, instrução em destaque, conversa realçada

**Files:**

- Create: `components/tasks/StageWorkView.tsx`
- Modify: `components/tasks/CommentsList.tsx` (realce e título de instrução)
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`
- Test: `__tests__/components/StageWorkView.test.tsx`

**Interfaces:**

- Consumes: `StageView` (Task 6).
- Produces: `<StageWorkView view={StageView} currentUserId={string} />`.

**Chaves novas em `tasks`:** `stageView.instructionTitle` ("Instrução da etapa" / "Instrucción de la etapa"), `stageView.backToDemand`, `stageView.thisStage` (o rótulo do realce).

- [ ] **Step 1: Write the failing test**

```tsx
it("mostra a instrução da etapa em destaque, com título próprio", () => {
  render(<StageWorkView view={VIEW} currentUserId="u1" />);
  const destaque = screen.getByTestId("stage-instruction");
  expect(destaque).toHaveTextContent("stageView.instructionTitle");
  expect(destaque).toHaveTextContent("Gravar no estúdio B");
});

it("a conversa é a da DEMANDA, com o bloco desta etapa realçado", () => {
  // Realçar, não filtrar: quem opera precisa do contexto inteiro. Um teste que só contasse os
  // comentários da etapa passaria numa implementação que filtra — que é o oposto da decisão.
  render(<StageWorkView view={VIEW} currentUserId="u1" />);
  expect(screen.getAllByTestId("comment")).toHaveLength(3);
  expect(screen.getByTestId("comment-c2")).toHaveAttribute("data-this-stage", "true");
  expect(screen.getByTestId("comment-c1")).toHaveAttribute("data-this-stage", "false");
});

it("etapa concluída não oferece caixa de escrever", () => {
  // A tela da etapa concluída é leitura: a conversa dela já aconteceu.
  render(
    <StageWorkView
      view={{ ...VIEW, stage: { ...VIEW.stage, status: "COMPLETED" } }}
      currentUserId="u1"
    />
  );
  expect(screen.queryByTestId("add-comment")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/StageWorkView.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Write minimal implementation**

`StageWorkView` compõe: cabeçalho com a demanda (título, cliente, projeto, prazo) e a identidade da etapa (nome, ordem, status, responsável); o bloco `data-testid="stage-instruction"` quando `view.stage.instruction` existe; a lista de comentários com `data-this-stage` por item; e `AddCommentForm` com `activeStageId={view.stage.activeStageId}` quando o status não é `COMPLETED`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/StageWorkView.test.tsx __tests__/i18n && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/tasks/StageWorkView.tsx components/tasks/CommentsList.tsx locales __tests__/components/StageWorkView.test.tsx
git commit -m "feat(etapa): a tela da etapa, com a instrução em destaque"
```

---

### Task 9: As ações mudam de casa

**Files:**

- Modify: `components/tasks/StageWorkView.tsx`
- Modify: `components/tasks/TaskDetailView.tsx` (remoção)
- Test: `__tests__/components/StageWorkView.test.tsx`, `__tests__/components/TaskDetailView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// StageWorkView.test.tsx
it("a etapa ativa oferece as ações dela", () => {
  render(<StageWorkView view={VIEW} currentUserId="u1" />);
  for (const testid of ["activity-button", "log-time", "advance-stage"]) {
    expect(screen.getByTestId(testid)).toBeInTheDocument();
  }
});

// TaskDetailView.test.tsx
it("a tela da demanda não age mais — é leitura", () => {
  // Se a ação precisa saber QUAL etapa, ela mora na etapa. Com etapas paralelas, um botão aqui
  // teria de escolher sozinho — que é o defeito que esta entrega remove.
  render(<TaskDetailView {...PROPS} />);
  for (const testid of ["activity-button", "log-time", "advance-stage", "add-comment"]) {
    expect(screen.queryByTestId(testid)).not.toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/StageWorkView.test.tsx __tests__/components/TaskDetailView.test.tsx`
Expected: FAIL nos dois — as ações estão na demanda e não na etapa.

- [ ] **Step 3: Write minimal implementation**

Mover para `StageWorkView`: `ActivityButton`, `LogTimeButton`, `AdvanceStageButton`, `RevertStageButton`, `UnassignActiveStageButton` e as ações do painel de artefatos, todos recebendo a etapa da view em vez de "a etapa corrente da demanda". Remover de `TaskDetailView` esses mesmos usos e o `AddCommentForm`; o painel de artefatos permanece em leitura. Acrescentar `data-testid` nos gatilhos citados pelos testes.

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run __tests__/components && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/tasks __tests__/components
git commit -m "feat(etapa): as ações passam a morar na etapa; a demanda vira leitura"
```

---

### Task 10: `/admin/tasks/{id}` deixa de eleger uma etapa sozinho

**Files:**

- Modify: `app/[locale]/(protected)/admin/tasks/[taskId]/page.tsx:216`
- Test: `__tests__/components/AdminTaskStages.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("com DUAS etapas ativas, cada uma tem as próprias ações", () => {
  // `task.currentStageId` elege uma sozinho — o mesmo defeito da tela da demanda, no admin. Com
  // fork/join isso esconde metade do trabalho em curso atrás de um botão que age na outra etapa.
  render(<AdminTaskStages stages={[ATIVA_A, ATIVA_B]} {...PROPS} />);
  expect(screen.getAllByTestId("advance-stage")).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/AdminTaskStages.test.tsx`
Expected: FAIL — a página renderiza um bloco só, pelo `currentStageId`.

- [ ] **Step 3: Write minimal implementation**

Extrair o bloco de ações da página para `components/tasks/AdminTaskStages.tsx`, que recebe a LISTA de etapas ativas e renderiza um conjunto de ações por etapa, com o nome dela ao lado. A página passa `task.activeStages` filtradas por `status in (ACTIVE, BLOCKED)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(protected)/admin/tasks/[taskId]/page.tsx" components/tasks/AdminTaskStages.tsx __tests__/components/AdminTaskStages.test.tsx
git commit -m "fix(admin): as ações de etapa param de eleger uma sozinho"
```

---

### Task 11: A caixa de comentário da demanda mora no admin

**Files:**

- Modify: `app/[locale]/(protected)/admin/tasks/[taskId]/page.tsx`
- Test: `__tests__/components/AddCommentForm.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("sem etapa informada, o formulário manda nulo", () => {
  // É o que dá sentido a `activeStageId` ser opcional: "o cliente adiou tudo" não é de etapa
  // nenhuma, e quem coordena escreve isso no admin.
  render(<AddCommentForm taskId="t1" userId="u1" activeStageId={null} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "cliente adiou" } });
  fireEvent.submit(screen.getByTestId("add-comment"));
  expect(addComment).toHaveBeenCalledWith("t1", "cliente adiou", null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/AddCommentForm.test.tsx`
Expected: FAIL — o formulário chama `addComment` com dois argumentos.

- [ ] **Step 3: Write minimal implementation**

`AddCommentForm` repassa `activeStageId` (Task 3 já criou a prop; aqui garanta o `data-testid="add-comment"` no `<form>` e a chamada com três argumentos). A página do admin renderiza `<CommentsList>` + `<AddCommentForm activeStageId={null} />` numa seção própria.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/tasks/AddCommentForm.tsx "app/[locale]/(protected)/admin/tasks/[taskId]/page.tsx" __tests__/components/AddCommentForm.test.tsx
git commit -m "feat(admin): a conversa da demanda ganha casa"
```

---

### Task 12: O histórico para de adivinhar

**Files:**

- Modify: `components/tasks/WorkflowHistoryModal.tsx:48`
- Test: `__tests__/components/WorkflowHistoryModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("[CRÍTICO] um comentário aparece em UMA etapa, não em todas as que o autor passou", () => {
  // O defeito de hoje: a atribuição é pelo AUTOR (`stageLogs.some(log => log.userId === c.userId)`),
  // então quem trabalhou em três etapas tem todos os comentários repetidos nas três, e comentário
  // de quem nunca teve log não aparece em nenhuma.
  render(
    <WorkflowHistoryModal
      comments={[COMENTARIO_DA_ETAPA_2]}
      stageLogs={TRES_LOGS_DA_MESMA_PESSOA}
      {...PROPS}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /history/ }));
  expect(screen.getAllByText(/faltou o off/)).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/WorkflowHistoryModal.test.tsx`
Expected: FAIL — o texto aparece três vezes.

- [ ] **Step 3: Write minimal implementation**

```tsx
// Pelo VÍNCULO, não pelo autor: `activeStageId` diz de qual etapa o comentário é. A versão
// anterior perguntava "o autor passou por esta etapa?", o que repetia o mesmo comentário em toda
// etapa por onde a pessoa passou e escondia o de quem nunca teve log.
const stageComments = comments.filter((c) => c.activeStageId === activeStageIdDaEtapa);
```

O componente passa a receber, por etapa, o `activeStageId` correspondente (a página já tem `task.activeStages`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/tasks/WorkflowHistoryModal.tsx __tests__/components/WorkflowHistoryModal.test.tsx
git commit -m "fix(etapa): o histórico filtra pelo vínculo, não pelo autor"
```

---

### Task 13: Os links de contexto de etapa mudam de destino

**Files:**

- Modify: `app/[locale]/(protected)/tasks/page.tsx:119`, `app/[locale]/(protected)/dashboard/page.tsx:172`, `components/admin/AgingQueue.tsx`, `components/admin/BlockedQueue.tsx`, `components/admin/TeamLoadBalanceClient.tsx`, `components/presence/PresenceCard.tsx`
- Modify: os 18 `revalidatePath` em `lib/actions/task.ts`, `lib/actions/activity.ts`, `lib/actions/artifact.ts`, `lib/actions/task-stage-setup.ts`
- Test: `__tests__/lib/navigation.test.ts`

**Interfaces:**

- Produces: `stagePath(taskId: string, activeStageId: string): string` em `lib/navigation.ts`.

- [ ] **Step 1: Write the failing test**

```ts
it("o caminho da etapa é montado num lugar só", () => {
  // Seis telas linkam para a etapa. Seis interpolações à mão divergem no dia em que a rota mudar —
  // e uma delas vai continuar mandando para a demanda sem ninguém notar.
  expect(stagePath("t1", "as2")).toBe("/tasks/t1/stages/as2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/navigation.test.ts`
Expected: FAIL — `stagePath` não existe.

- [ ] **Step 3: Write minimal implementation**

Criar `stagePath` em `lib/navigation.ts` e usá-lo nos seis pontos de navegação — todos nascidos de contexto de ETAPA (minhas etapas, dashboard, aging, bloqueadas, balanço de time, presença). **Não mexer** na linha do tempo do projeto nem na barra do calendário: elas falam da demanda. Nos 18 `revalidatePath`, acrescentar o caminho da etapa quando o `activeStageId` estiver à mão; onde não estiver, manter só o da demanda e comentar por quê.

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/navigation.ts app components lib/actions __tests__/lib/navigation.test.ts
git commit -m "feat(etapa): quem chega de contexto de etapa cai na etapa"
```

---

### Task 14: Fechar a documentação

**Files:**

- Modify: `CHANGELOG.md`, `docs/pendencias.md`
- Modify: `docs/superpowers/specs/2026-09-02-tela-da-etapa-design.md` (estado)

- [ ] **Step 1: Rodar a verificação completa**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: tudo verde — sem isto o changelog afirmaria o que ninguém conferiu.

- [ ] **Step 2: Escrever a entrada do changelog**

Em `### 🚀 Adicionado`, uma seção `#### A tela da etapa` cobrindo: as três telas e a regra de uma frase; a rota pela instância e por quê; a instrução que passa a chegar na liberação; o comentário de reversão que deixou de ser português cravado no código; o histórico que parou de adivinhar pelo autor; e o admin que parou de eleger uma etapa sozinho.

- [ ] **Step 3: Anotar o que ficou aberto**

Em `docs/pendencias.md`: comentários e demandas anteriores a esta entrega ficam sem etapa e sem criador (decisão, não dívida — mas quem for ler os dados precisa saber).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs
git commit -m "docs(etapa): changelog da tela da etapa"
```

---

## Notas para quem executar

- **Leia a spec antes da primeira tarefa.** Ela carrega os porquês que este plano só resume — em especial por que a rota é pela instância, e por que a instrução vira conversa apesar de o schema declarar o contrário.
- **`activateNextStages` roda dentro de fluxo transacional em alguns caminhos.** Se a criação dos comentários de instrução precisar entrar na mesma transação, use o `tx` disponível em vez de `prisma` — nunca abra transação nova aninhada.
- **Não invente afrouxamento de permissão.** A tela da etapa não muda quem pode o quê: os botões mudam de lugar carregando as mesmas travas, e as actions seguem validando por conta própria.
- **Se aparecer a necessidade de duas linhas da mesma etapa** (retrabalho como execução nova), PARE: isso é a spec seguinte, não esta. Anote e siga.
