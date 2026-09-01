# Apontamento obrigatório para concluir etapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** concluir etapa passa a exigir o apontamento de horas, e a pedir um motivo quando o apontado passa da referência ou é 10% dela ou menos.

**Architecture:** a regra do gatilho vive pura em `lib/stage-completion-note.ts`, para ser a mesma na tela e no servidor. `completeStageAndAdvance` ganha um parâmetro de apontamento, fecha o cronômetro aberto antes de somar, grava a diferença como `TimeLog` complementar e registra o motivo numa tabela própria. A tela lê o já apontado e a referência antes de abrir o diálogo, e só mostra atrito onde falta alguma coisa.

**Tech Stack:** Next.js 15 (Server Actions), Prisma/PostgreSQL, next-intl v4, vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-01-apontamento-obrigatorio-design.md`

## Global Constraints

- **O atrito é proporcional ao que falta.** Quem já apontou pelo cronômetro não digita hora nenhuma; quem ficou dentro da referência não escolhe motivo. Concluir continua sendo um clique no caso comum.
- **Não dá para reduzir hora já apontada** pelo campo de conclusão. O cronômetro gravou períodos reais; apagá-los ali seria destruir medição em silêncio.
- **As horas são do responsável pela etapa**, mesmo quando quem conclui é o gestor. Sem responsável, de quem concluiu.
- **Gatilho do motivo:** apontado **>** referência, ou apontado **≤ 10%** da referência. Exatamente na referência não pede. **Sem referência (0), nunca pede.**
- **O motivo é causa declarada, não penalidade:** não bloqueia nada além da própria conclusão, não pontua, não entra em indicador, e **nenhuma leitura o agrega por pessoa**.
- Toda mensagem de erro vem do dicionário (`getTranslations`), nunca fixa no código. **pt-BR e es-ES**, com espanhol de verdade — há teste de paridade de chaves.
- Comentários em pt-BR explicando o **porquê**.
- `npx tsc --noEmit` limpo, `npx vitest run` verde (**1367 testes hoje**, nenhum pode quebrar), `npm run build` compilando.
- **A migration NÃO é aplicada pelo plano.** Aplicar em produção é decisão do usuário, feita fora daqui.

---

### Task 1: A regra do gatilho (função pura)

**Files:**

- Create: `lib/stage-completion-note.ts`
- Test: `__tests__/lib/stage-completion-note.test.ts`

**Interfaces:**

- Consumes: nada
- Produces:
  - `const LOW_LOG_RATIO = 0.1`
  - `type StageNoteReasonValue = "EXTERNAL_INTERRUPTION" | "REWORK" | "SCOPE_LARGER" | "TIMER_FORGOTTEN" | "OTHER"`
  - `const STAGE_NOTE_REASONS: readonly StageNoteReasonValue[]`
  - `needsReason(hoursLogged: number, referenceHours: number): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/stage-completion-note.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { needsReason, LOW_LOG_RATIO, STAGE_NOTE_REASONS } from "@/lib/stage-completion-note";

describe("needsReason", () => {
  it("acima da referência pede motivo", () => {
    // O cronômetro esquecido ligado é o caso clássico: a etapa fecha com um número que não
    // descreve trabalho nenhum, e o p50 de todo mundo aprende com ele.
    expect(needsReason(5, 4)).toBe(true);
  });

  it("exatamente na referência NÃO pede", () => {
    // A referência é um p50: metade das execuções fica naturalmente em cima ou perto dela.
    expect(needsReason(4, 4)).toBe(false);
  });

  it("logo abaixo da referência não pede", () => {
    expect(needsReason(3.9, 4)).toBe(false);
  });

  it("10% da referência pede motivo — o limite é inclusivo", () => {
    // Fechar a etapa com quase nada apontado quase sempre quer dizer que o cronômetro não foi
    // usado. É o caso que mais envenena a referência, e o que passaria batido sem este limite.
    expect(needsReason(0.4, 4)).toBe(true);
  });

  it("acima de 10% e abaixo da referência não pede", () => {
    expect(needsReason(0.5, 4)).toBe(false);
  });

  it("zero apontado pede motivo", () => {
    expect(needsReason(0, 4)).toBe(true);
  });

  it("sem referência nunca pede — não há contra o que comparar", () => {
    // Etapa sem amostra e sem SLA cadastrado. Inventar uma régua para justificar seria pior que
    // não perguntar.
    expect(needsReason(0, 0)).toBe(false);
    expect(needsReason(99, 0)).toBe(false);
  });

  it("a razão do limite de baixo é 10%", () => {
    expect(LOW_LOG_RATIO).toBe(0.1);
  });

  it("os cinco motivos existem e a ordem é a da tela", () => {
    expect(STAGE_NOTE_REASONS).toEqual([
      "EXTERNAL_INTERRUPTION",
      "REWORK",
      "SCOPE_LARGER",
      "TIMER_FORGOTTEN",
      "OTHER",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/stage-completion-note.test.ts`
Expected: FAIL — `lib/stage-completion-note.ts` não existe

- [ ] **Step 3: Implementar**

Criar `lib/stage-completion-note.ts`:

```ts
/**
 * Quando concluir uma etapa pede um MOTIVO.
 *
 * O apontamento voluntário falha de dois jeitos opostos, e os dois envenenam o p50 que o sistema
 * oferece a todo mundo: ninguém ligou o cronômetro (a etapa fecha com quase nada) ou ninguém o
 * desligou (fecha com trinta horas porque o chefe chegou e mandou fazer outra coisa). São duas
 * histórias diferentes, e por isso a pergunta é uma só com respostas diferentes.
 *
 * A faixa de ±10% foi rejeitada de propósito: a referência é um p50, então metade das execuções
 * fica naturalmente acima dele. Justificativa que aparece toda vez deixa de ser lida — e ensina a
 * apontar o número que não pergunta nada.
 *
 * Pura porque a mesma regra decide o que a tela mostra e o que o servidor aceita. Duas cópias
 * divergiriam, e a divergência apareceria como um diálogo que não pede nada e uma ação que recusa.
 */

/** Abaixo desta fração da referência, o apontamento quase sempre quer dizer "esqueci o relógio". */
export const LOW_LOG_RATIO = 0.1;

export type StageNoteReasonValue =
  | "EXTERNAL_INTERRUPTION"
  | "REWORK"
  | "SCOPE_LARGER"
  | "TIMER_FORGOTTEN"
  | "OTHER";

/** Ordem da lista na tela: do que revela problema de fora para o que revela problema do processo. */
export const STAGE_NOTE_REASONS: readonly StageNoteReasonValue[] = [
  "EXTERNAL_INTERRUPTION",
  "REWORK",
  "SCOPE_LARGER",
  "TIMER_FORGOTTEN",
  "OTHER",
] as const;

export function needsReason(hoursLogged: number, referenceHours: number): boolean {
  // Sem régua não há extremo: etapa sem amostra e sem SLA cadastrado não pergunta nada.
  if (referenceHours <= 0) return false;
  if (hoursLogged > referenceHours) return true;
  return hoursLogged <= referenceHours * LOW_LOG_RATIO;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/stage-completion-note.test.ts`
Expected: PASS (9 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/stage-completion-note.ts __tests__/lib/stage-completion-note.test.ts
git commit -m "feat(apontamento): a regra que decide quando concluir pede motivo"
```

---

### Task 2: A tabela do motivo

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901120000_add_stage_completion_note/migration.sql`

**Interfaces:**

- Consumes: `StageNoteReasonValue` (Task 1) — os valores do enum do Prisma são os mesmos
- Produces: modelo `StageCompletionNote` e enum `StageNoteReason` no client do Prisma

- [ ] **Step 1: Modelo no schema**

Em `prisma/schema.prisma`, logo depois do enum `ActiveStageStatus`:

```prisma
/// Por que uma etapa fechou fora da referência. Causa DECLARADA, nunca penalidade: nada no
/// sistema muda de comportamento por causa dela.
enum StageNoteReason {
  EXTERNAL_INTERRUPTION // prioridade que chegou por fora do sistema
  REWORK // qualidade a montante: briefing, aprovação
  SCOPE_LARGER // a demanda não era o que o template descreve
  TIMER_FORGOTTEN // o processo pede um gesto que as pessoas não fazem
  OTHER
}
```

E, ao final do arquivo, o modelo:

```prisma
/// Justificativa de conclusão fora da referência.
///
/// Tabela e não campo em `TaskActiveStage` porque uma etapa pode ser concluída mais de uma vez
/// (reversão e refazimento): o registro é do EVENTO, e sobrescrever perderia a história que a
/// justificativa existe para contar.
///
/// `referenceHours` é gravado junto de propósito: a referência é um p50 que se move com o tempo, e
/// sem o valor da época ninguém consegue reconstruir por que aquela justificativa foi pedida.
model StageCompletionNote {
  id             String          @id @default(cuid())
  reason         StageNoteReason
  note           String?         @db.Text
  hoursLogged    Float
  referenceHours Float
  createdAt      DateTime        @default(now())

  taskId String
  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)

  stageId String
  stage   TemplateStage @relation(fields: [stageId], references: [id], onDelete: Cascade)

  /// Quem concluiu. NUNCA agregado por pessoa em leitura nenhuma — ver a spec.
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([stageId, createdAt])
  @@index([taskId])
}
```

E as relações inversas, junto das outras de cada modelo:

- em `model Task`: `stageCompletionNotes StageCompletionNote[]`
- em `model TemplateStage`: `stageCompletionNotes StageCompletionNote[]`
- em `model User`: `stageCompletionNotes StageCompletionNote[]`

- [ ] **Step 2: Migration**

Criar `prisma/migrations/20260901120000_add_stage_completion_note/migration.sql`:

```sql
-- Justificativa de conclusão de etapa fora da referência.
--
-- Tabela nova e nada tocado no que já existe: nenhuma coluna alterada, nenhum backfill. Demanda
-- concluída antes desta regra simplesmente não tem nota, que é a verdade sobre ela.
CREATE TYPE "StageNoteReason" AS ENUM ('EXTERNAL_INTERRUPTION', 'REWORK', 'SCOPE_LARGER', 'TIMER_FORGOTTEN', 'OTHER');

CREATE TABLE "StageCompletionNote" (
    "id" TEXT NOT NULL,
    "reason" "StageNoteReason" NOT NULL,
    "note" TEXT,
    "hoursLogged" DOUBLE PRECISION NOT NULL,
    "referenceHours" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StageCompletionNote_pkey" PRIMARY KEY ("id")
);

-- A leitura que interessa é por ETAPA ao longo do tempo ("metade das estouradas da Edição foi
-- interrupção externa"). Nunca por pessoa — ver a spec.
CREATE INDEX "StageCompletionNote_stageId_createdAt_idx" ON "StageCompletionNote"("stageId", "createdAt");
CREATE INDEX "StageCompletionNote_taskId_idx" ON "StageCompletionNote"("taskId");

ALTER TABLE "StageCompletionNote" ADD CONSTRAINT "StageCompletionNote_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StageCompletionNote" ADD CONSTRAINT "StageCompletionNote_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StageCompletionNote" ADD CONSTRAINT "StageCompletionNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Gerar o client e verificar**

Run: `npx prisma validate && npx prisma generate && npx tsc --noEmit`
Expected: schema válido, client gerado, `tsc` limpo.

**NÃO rode `prisma migrate deploy`.** Aplicar é decisão do usuário, fora deste plano.

- [ ] **Step 4: Suíte inteira**

Run: `npx vitest run`
Expected: 1367 + 9 (Task 1) passando, nenhum quebrado.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(apontamento): tabela da justificativa de conclusão fora da referência"
```

---

### Task 3: A ação de concluir passa a exigir o apontamento

**Files:**

- Modify: `lib/actions/task.ts` (`completeStageAndAdvance`, e uma leitura nova ao lado dela)
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/complete-stage-hours.test.ts`

**Interfaces:**

- Consumes: `needsReason`, `StageNoteReasonValue` (Task 1); `StageCompletionNote` (Task 2); `getStageReferences` de `@/lib/planning/stage-reference`; `closeActivityLog` de `@/lib/activity-close`
- Produces:
  - `getStageCompletionContext(taskId: string, stageId: string): Promise<{ loggedHours: number; referenceHours: number }>`
  - `completeStageAndAdvance(taskId, stageId, assignments?, apontamento?: { hours: number; reason?: StageNoteReasonValue; note?: string })`

- [ ] **Step 1: Chaves de erro nos dois locales**

Em `locales/pt-BR/errors.json`, namespace `task`:

```json
"hoursRequired": "Informe quantas horas você trabalhou nesta etapa.",
"hoursBelowLogged": "O cronômetro já registrou mais horas do que isso. Para reduzir, corrija o apontamento.",
"reasonRequired": "O tempo ficou fora da referência desta etapa — diga o que aconteceu."
```

Em `locales/es-ES/errors.json`, no mesmo namespace:

```json
"hoursRequired": "Indica cuántas horas has trabajado en esta etapa.",
"hoursBelowLogged": "El cronómetro ya ha registrado más horas que esas. Para reducirlas, corrige la imputación.",
"reasonRequired": "El tiempo ha quedado fuera de la referencia de esta etapa: cuenta qué ha pasado."
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `__tests__/lib/actions/complete-stage-hours.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi
    .fn()
    .mockResolvedValue(new Map([["s1", { hours: 4, source: "observed" }]])),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ role: "ADMIN" }) },
    task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
    taskStageLog: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    stageTransition: { create: vi.fn().mockResolvedValue({}) },
    templateStage: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    timeLog: { aggregate: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    activityLog: { findFirst: vi.fn().mockResolvedValue(null) },
    stageCompletionNote: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { completeStageAndAdvance } from "@/lib/actions/task";

function cenario(horasJaApontadas: number) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "ana", name: "Ana", email: "ana@x.com", role: "ADMIN" },
  } as never);
  vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: "ana",
    stageId: "s1",
    stage: { id: "s1", name: "Edição", template: {}, defaultTeam: null },
    task: { id: "t1", project: { client: {} } },
  } as never);
  vi.mocked(prisma.templateStage.findUnique).mockResolvedValue({ templateId: "tpl" } as never);
  vi.mocked(prisma.timeLog.aggregate).mockResolvedValue({
    _sum: { hoursSpent: horasJaApontadas },
  } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("completeStageAndAdvance — apontamento", () => {
  it("recusa concluir sem hora quando nada foi apontado", async () => {
    // A metade "realizado" de todas as telas de tempo nasce aqui. Sem esta trava ela continua
    // sendo um campo em branco com cara de zero.
    cenario(0);
    const r = await completeStageAndAdvance("t1", "s1");
    expect(r).toEqual({ error: "hoursRequired" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("não exige nada quando o cronômetro já apontou dentro da referência", async () => {
    // O atrito é proporcional ao que falta: quem trabalhou com o relógio ligado não digita nada.
    cenario(3);
    const r = await completeStageAndAdvance("t1", "s1");
    expect(r).toMatchObject({ success: true });
    expect(prisma.timeLog.create).not.toHaveBeenCalled();
  });

  it("recusa hora menor que a já apontada", async () => {
    // O cronômetro gravou períodos reais, com início e fim. Apagá-los por um campo de texto seria
    // destruir medição em silêncio.
    cenario(3);
    const r = await completeStageAndAdvance("t1", "s1", undefined, { hours: 2 });
    expect(r).toEqual({ error: "hoursBelowLogged" });
  });

  it("grava só a DIFERENÇA como apontamento complementar", async () => {
    cenario(1);
    await completeStageAndAdvance("t1", "s1", undefined, { hours: 3 });
    const data = vi.mocked(prisma.timeLog.create).mock.calls[0][0].data as {
      hoursSpent: number;
      userId: string;
    };
    expect(data.hoursSpent).toBe(2);
    // As horas são de quem fez o trabalho, não de quem clicou em concluir.
    expect(data.userId).toBe("ana");
  });

  it("acima da referência exige motivo", async () => {
    cenario(0);
    const r = await completeStageAndAdvance("t1", "s1", undefined, { hours: 9 });
    expect(r).toEqual({ error: "reasonRequired" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("com motivo, conclui e grava a nota com a referência da época", async () => {
    cenario(0);
    const r = await completeStageAndAdvance("t1", "s1", undefined, {
      hours: 9,
      reason: "EXTERNAL_INTERRUPTION",
      note: "chefe pediu outra coisa",
    });
    expect(r).toMatchObject({ success: true });
    const data = vi.mocked(prisma.stageCompletionNote.create).mock.calls[0][0].data as {
      reason: string;
      hoursLogged: number;
      referenceHours: number;
    };
    expect(data.reason).toBe("EXTERNAL_INTERRUPTION");
    expect(data.hoursLogged).toBe(9);
    // Sem a régua da época ninguém reconstrói depois por que a justificativa foi pedida.
    expect(data.referenceHours).toBe(4);
  });

  it("dentro da referência não grava nota nenhuma", async () => {
    cenario(3);
    await completeStageAndAdvance("t1", "s1");
    expect(prisma.stageCompletionNote.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/complete-stage-hours.test.ts`
Expected: FAIL — a ação ainda não conhece o parâmetro nem as travas

- [ ] **Step 4: Implementar na ação**

Em `lib/actions/task.ts`, acrescentar os imports no topo:

```ts
import { needsReason, type StageNoteReasonValue } from "@/lib/stage-completion-note";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { closeActivityLog } from "@/lib/activity-close";
```

Acrescentar, imediatamente **antes** de `completeStageAndAdvance`, a leitura que a tela usa:

```ts
/** Quanto já foi apontado nesta etapa e qual é a régua dela. A tela usa os dois para decidir o
 *  que pedir; a ação recalcula por conta, porque o que a tela mandou não é confiável. */
export async function getStageCompletionContext(taskId: string, stageId: string) {
  await getCurrentUser();
  const [agregado, referencias] = await Promise.all([
    prisma.timeLog.aggregate({ where: { taskId, stageId }, _sum: { hoursSpent: true } }),
    getStageReferences([stageId]),
  ]);
  return {
    loggedHours: agregado._sum.hoursSpent ?? 0,
    referenceHours: referencias.get(stageId)?.hours ?? 0,
  };
}
```

Trocar a assinatura de `completeStageAndAdvance` por:

```ts
export async function completeStageAndAdvance(
  taskId: string,
  stageId: string,
  assignments?: Record<string, string>,
  apontamento?: { hours: number; reason?: StageNoteReasonValue; note?: string }
) {
```

E inserir o bloco abaixo **imediatamente depois** da checagem de permissão — a linha
`if (!isAdmin && !isManager && !isAssignee) { return { error: ... } }` —, antes de qualquer escrita.
Ele precisa vir antes porque toda recusa dele tem de deixar a etapa exatamente como estava:

```ts
// --- Apontamento: a metade "realizado" de todas as telas de tempo nasce aqui ---
//
// O cronômetro aberto fecha ANTES de somar: senão a pessoa confirmaria um total que o próprio
// sistema contradiria um segundo depois, quando o período fechasse sozinho.
const aberto = await prisma.activityLog.findFirst({
  where: { taskId, stageId, endedAt: null },
  select: { id: true, userId: true, taskId: true, stageId: true, startedAt: true },
});
if (aberto) await closeActivityLog(prisma, aberto, new Date());

const agregado = await prisma.timeLog.aggregate({
  where: { taskId, stageId },
  _sum: { hoursSpent: true },
});
const jaApontado = agregado._sum.hoursSpent ?? 0;
const informado = apontamento?.hours;

// Sem apontamento nenhum e sem número informado, não há o que concluir: a etapa fecharia
// como se ninguém tivesse trabalhado nela.
if (jaApontado <= 0 && (informado === undefined || informado <= 0)) {
  return { error: tTask("hoursRequired") };
}
// Reduzir hora já apontada por um campo de texto seria apagar período real, com início e fim.
// Corrigir apontamento errado é outro ato, e precisa ser deliberado.
if (informado !== undefined && informado < jaApontado) {
  return { error: tTask("hoursBelowLogged") };
}

const totalHoras = informado !== undefined ? informado : jaApontado;
const referencias = await getStageReferences([stageId]);
const referenceHours = referencias.get(stageId)?.hours ?? 0;

if (needsReason(totalHoras, referenceHours) && !apontamento?.reason) {
  return { error: tTask("reasonRequired") };
}

// A diferença vira apontamento complementar, com data de hoje. As horas são de quem FEZ o
// trabalho — mesmo quando quem clica em concluir é o gestor.
const diferenca = totalHoras - jaApontado;
if (diferenca > 0) {
  await prisma.timeLog.create({
    data: {
      taskId,
      stageId,
      userId: activeStage.assigneeId ?? currentUserId,
      hoursSpent: diferenca,
      logDate: new Date(),
    },
  });
}

if (apontamento?.reason) {
  await prisma.stageCompletionNote.create({
    data: {
      taskId,
      stageId,
      userId: currentUserId,
      reason: apontamento.reason,
      note: apontamento.note?.trim() || null,
      hoursLogged: totalHoras,
      // A régua da época: o p50 se move, e sem ela ninguém reconstrói por que a justificativa
      // foi pedida.
      referenceHours,
    },
  });
}
```

- [ ] **Step 5: O guarda contra agregar motivo por pessoa**

A spec proíbe qualquer leitura que some justificativas por indivíduo, e proibição sem guarda é
lembrete. Criar `__tests__/lib/stage-note-never-per-person.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O motivo de conclusão é causa declarada, NUNCA ficha da pessoa. Este guarda existe porque a
 * proibição é fácil de esquecer: `groupBy(["userId"])` numa tabela que tem `userId` é a coisa
 * mais natural do mundo de se escrever, e viraria um ranking de quem mais estoura prazo — o
 * oposto do que a feature existe para fazer (P1/P2).
 */
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith(".ts") || caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

describe("StageCompletionNote nunca é agregado por pessoa", () => {
  it("nenhum arquivo agrupa ou conta a nota por usuário", () => {
    const suspeitos: string[] = [];
    for (const caminho of [...arquivos("lib"), ...arquivos("app"), ...arquivos("components")]) {
      const texto = readFileSync(caminho, "utf-8");
      if (!texto.includes("stageCompletionNote")) continue;
      // Recorta o trecho que fala da tabela e procura agregação por pessoa perto dela.
      const trecho = texto.slice(texto.indexOf("stageCompletionNote"));
      const janela = trecho.slice(0, 600);
      if (/groupBy[\s\S]{0,120}userId/.test(janela)) suspeitos.push(caminho);
      if (/_count[\s\S]{0,120}userId/.test(janela)) suspeitos.push(caminho);
    }
    expect(suspeitos).toEqual([]);
  });
});
```

Run: `npx vitest run __tests__/lib/stage-note-never-per-person.test.ts`
Expected: PASS

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/complete-stage-hours.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS (7 casos novos); suíte inteira verde, incluindo o guarda de paridade de locales.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/task.ts locales __tests__/lib/actions/complete-stage-hours.test.ts __tests__/lib/stage-note-never-per-person.test.ts
git commit -m "feat(apontamento): concluir etapa exige horas, e motivo nos extremos"
```

---

### Task 4: O diálogo de concluir

**Files:**

- Modify: `components/tasks/AdvanceStageButton.tsx`
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`

**Interfaces:**

- Consumes: `getStageCompletionContext`, `completeStageAndAdvance` (Task 3); `needsReason`, `STAGE_NOTE_REASONS`, `StageNoteReasonValue` (Task 1)
- Produces: nada

- [ ] **Step 1: Chaves nos dois locales**

Em `locales/pt-BR/tasks.json`, dentro de `stages`, o bloco `completion`:

```json
"completion": {
  "hoursLabel": "Horas nesta etapa",
  "hoursFromTimer": "{hours}h já apontadas pelo cronômetro.",
  "hoursHint": "Some o que faltou apontar. Não dá para reduzir o que o cronômetro já registrou.",
  "reasonLabel": "O que aconteceu nesta etapa?",
  "reasonHelp": "O tempo ficou fora da referência ({reference}h). Isso costuma ser do processo, não de quem trabalhou — registrar ajuda a encontrar o padrão.",
  "notePlaceholder": "Detalhe, se quiser",
  "reasons": {
    "EXTERNAL_INTERRUPTION": "Interrupção externa",
    "REWORK": "Retrabalho",
    "SCOPE_LARGER": "Escopo maior que o previsto",
    "TIMER_FORGOTTEN": "Esqueci o cronômetro",
    "OTHER": "Outro"
  }
}
```

Em `locales/es-ES/tasks.json`:

```json
"completion": {
  "hoursLabel": "Horas en esta etapa",
  "hoursFromTimer": "{hours}h ya imputadas por el cronómetro.",
  "hoursHint": "Suma lo que falte imputar. No se puede reducir lo que el cronómetro ya registró.",
  "reasonLabel": "¿Qué ha pasado en esta etapa?",
  "reasonHelp": "El tiempo ha quedado fuera de la referencia ({reference}h). Esto suele ser del proceso, no de quien trabajó: registrarlo ayuda a encontrar el patrón.",
  "notePlaceholder": "Detalla, si quieres",
  "reasons": {
    "EXTERNAL_INTERRUPTION": "Interrupción externa",
    "REWORK": "Retrabajo",
    "SCOPE_LARGER": "Alcance mayor de lo previsto",
    "TIMER_FORGOTTEN": "Se me olvidó el cronómetro",
    "OTHER": "Otro"
  }
}
```

O texto de `reasonHelp` é a trava mais importante desta tela: a pergunta é sobre **o trabalho**, e diz em voz alta que a causa costuma ser do processo. "Por que você demorou" ensinaria as pessoas a apontar o número que não pergunta nada.

- [ ] **Step 2: Estado e leitura no componente**

Em `components/tasks/AdvanceStageButton.tsx`, acrescentar aos imports:

```tsx
import { useEffect, useState } from "react";
import { getStageCompletionContext } from "@/lib/actions/task";
import {
  needsReason,
  STAGE_NOTE_REASONS,
  type StageNoteReasonValue,
} from "@/lib/stage-completion-note";
import { FieldLabel } from "@/components/ui/FieldLabel";
```

E, dentro do componente, depois do `useNextStagePreview`:

```tsx
// Contexto do apontamento: quanto o cronômetro já registrou e qual é a régua da etapa. Vem do
// servidor ao abrir o diálogo — a tela não adivinha nenhum dos dois.
const [contexto, setContexto] = useState<{ loggedHours: number; referenceHours: number } | null>(
  null
);
const [horas, setHoras] = useState("");
const [motivo, setMotivo] = useState<StageNoteReasonValue | "">("");
const [nota, setNota] = useState("");

useEffect(() => {
  if (!showConfirm || !currentStageId) return;
  let vivo = true;
  getStageCompletionContext(taskId, currentStageId).then((c) => {
    if (!vivo) return;
    setContexto(c);
    // Pré-preenchido com o que já foi apontado: quem usou o cronômetro não digita nada.
    setHoras(c.loggedHours > 0 ? String(c.loggedHours) : "");
  });
  return () => {
    vivo = false;
  };
}, [showConfirm, taskId, currentStageId]);

const horasNum = Number(horas.replace(",", "."));
const horasValidas = Number.isFinite(horasNum) && horasNum > 0;
// A MESMA regra do servidor (lib/stage-completion-note.ts). Duas cópias divergiriam, e a
// divergência apareceria como um diálogo que não pede nada e uma ação que recusa.
const pedeMotivo = !!contexto && horasValidas && needsReason(horasNum, contexto.referenceHours);
const podeConcluir = horasValidas && (!pedeMotivo || motivo !== "");
```

E trocar `handleComplete` por:

```tsx
const handleComplete = () => {
  run(taskId, currentStageId, Object.keys(assignments).length > 0 ? assignments : undefined, {
    hours: horasNum,
    reason: pedeMotivo ? (motivo as StageNoteReasonValue) : undefined,
    note: nota.trim() || undefined,
  });
};
```

- [ ] **Step 3: Os campos no diálogo**

Dentro do corpo do diálogo de confirmação, **antes** do botão de confirmar, acrescentar:

```tsx
<div className="space-y-3 border-t border-border pt-3">
  <div>
    <FieldLabel htmlFor="completion-hours" required>
      {t("completion.hoursLabel")}
    </FieldLabel>
    <input
      id="completion-hours"
      type="number"
      min="0"
      step="0.25"
      value={horas}
      onChange={(e) => setHoras(e.target.value)}
      className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
    />
    <p className="mt-1 text-xs text-muted-foreground">
      {contexto && contexto.loggedHours > 0
        ? t("completion.hoursFromTimer", { hours: contexto.loggedHours })
        : t("completion.hoursHint")}
    </p>
  </div>

  {/* O motivo só aparece nos extremos: dentro da referência, concluir continua um clique. */}
  {pedeMotivo && contexto && (
    <div>
      <FieldLabel htmlFor="completion-reason" required>
        {t("completion.reasonLabel")}
      </FieldLabel>
      <select
        id="completion-reason"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as StageNoteReasonValue)}
        className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
      >
        <option value="">—</option>
        {STAGE_NOTE_REASONS.map((r) => (
          <option key={r} value={r}>
            {t(`completion.reasons.${r}`)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("completion.reasonHelp", { reference: contexto.referenceHours })}
      </p>
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder={t("completion.notePlaceholder")}
        rows={2}
        className="mt-2 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-foreground"
      />
    </div>
  )}
</div>
```

E o botão de confirmar ganha `disabled={isPending || !podeConcluir}`.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: verde. O `npm run build` é o único que pega erro de fronteira Server/Client Component.

- [ ] **Step 5: Commit**

```bash
git add components/tasks/AdvanceStageButton.tsx locales
git commit -m "feat(apontamento): o diálogo de concluir pede hora, e motivo só nos extremos"
```

---

### Task 5: Documentação

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/biblioteca-de-conhecimento.md`

**Interfaces:**

- Consumes: o comportamento das Tasks 1–4
- Produces: nada

- [ ] **Step 1: CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### 🚀 Adicionado`, acrescentar (MESCLAR — não sobrescrever as subseções que já existem):

```markdown
#### Apontamento obrigatório para concluir etapa

- **Concluir etapa passa a exigir horas.** Quem usou o cronômetro não digita nada: o campo já vem
  preenchido com o que foi registrado. O atrito é proporcional ao que falta.
- **Motivo nos dois extremos:** acima da referência, ou 10% dela ou menos. São as duas formas de o
  apontamento voluntário falhar — ninguém ligou o cronômetro, ou ninguém desligou — e as duas
  envenenam o p50 que o sistema oferece a todo mundo.
- **Não dá para reduzir hora já apontada** pelo campo de conclusão: o cronômetro gravou períodos
  reais, e apagá-los ali seria destruir medição em silêncio.
- **A justificativa é causa declarada, não penalidade.** Não bloqueia nada além da própria
  conclusão, não pontua, não entra em indicador, e nenhuma leitura a agrega por pessoa.
```

- [ ] **Step 2: Biblioteca de conhecimento**

Em `docs/biblioteca-de-conhecimento.md`, na seção `## 4. Decisões de arquitetura registradas (ADRs)`:

```markdown
- **Justificativa de conclusão fora da referência — e as quatro travas que a mantêm P1/P2** —
  concluir etapa pede um motivo quando o apontado passa da referência ou é 10% dela ou menos. Um
  campo assim vira "explique por que você demorou" com muita facilidade, e aí ensina a apontar o
  número que não pergunta nada. O que o mantém do lado certo: (1) a pergunta é sobre o TRABALHO —
  "o que aconteceu nesta etapa" —, e a tela diz em voz alta que a causa costuma ser do processo;
  (2) o motivo é categorizado, para o padrão sistêmico aparecer ("metade das estouradas deste time
  foi interrupção externa"); (3) nenhuma leitura agrega por pessoa; (4) nada no sistema muda de
  comportamento por causa dele — não bloqueia, não pontua, não entra em indicador. Faixa de ±10%
  foi rejeitada: a referência é um p50, metade das execuções fica acima dele, e justificativa que
  aparece toda vez deixa de ser lida. _(P1/P2/P3)_
```

- [ ] **Step 3: Verificar e commitar**

Run: `npx vitest run && npx prettier --check CHANGELOG.md docs/biblioteca-de-conhecimento.md`
Expected: verde

```bash
git add CHANGELOG.md docs/biblioteca-de-conhecimento.md
git commit -m "docs(apontamento): changelog e a decisão com as quatro travas na biblioteca"
```

---

## Fora deste plano

- **Aplicar a migration.** Decisão do usuário, feita fora daqui.
- **Editar ou apagar apontamento já gravado** — ato deliberado e auditável, com regra própria.
- **Tela de leitura dos motivos** (por etapa, por time, por período). Os dados passam a existir
  agora; a leitura vem quando houver o que ler.
- **A projeção da carga por cliente** — spec própria
  (`docs/superpowers/specs/2026-09-01-carga-cliente-projecao-design.md`), plano próprio, depois
  deste.
