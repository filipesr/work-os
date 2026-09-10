# Importação do quadro do Trello (AtlanticoShop) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trazer 230 demandas de 19 meses do quadro "Atlantico Shop" para o WorkOS, com as etapas que foram observadas, as datas históricas reais e nenhuma etapa inventada.

**Architecture:** lógica pura em `lib/trello/` (classificação, mapeamento, evidência), testada pela suíte que já existe; escrita reusando o miolo de criação de demanda do próprio produto, com data histórica passada por parâmetro; executável descartável em `scripts/import-trello/`, em modo ensaio por padrão.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, vitest. `tsx` para executar o script (a lógica precisa importar `lib/`, e os scripts `.mjs` existentes não conseguem).

**Spec:** `docs/superpowers/specs/2026-09-10-importar-trello-atlantico-design.md`

## Global Constraints

- **Etapa sem evidência é etapa NÃO-INCLUÍDA, nunca inferida.** Vale para toda a entrega. `Briefing`, `Gráfica`, `Trafego Pago`, `Imprensa` e `Relatório` ficam fora das 230 demandas.
- **"Arquivado" não é "concluído".** Só card na lista `Concluido` vira `COMPLETED`. Arquivado em outra lista vira `OBSOLETE`. Aberto vira `IN_PROGRESS`.
- **`Task.completedAt` só é datado quando o status for `COMPLETED`** — é o que alimenta lead time.
- **No `ReworkEvent`, `sourceStage` é a etapa que INJETOU o defeito** (`Desenho` / `Audio Visual`), não a revisão que o encontrou. Inverter isso inverte a métrica (P5 da `docs/biblioteca-de-conhecimento.md`).
- **Mudança em código de produção é só a que a spec autoriza:** parâmetro de data opcional em três funções (padrão inalterado) e a extração do miolo de `createTask`. Nada mais.
- **O modo padrão do script é ENSAIO** — não escreve nada. Gravar exige `--commit`.
- **TDD:** teste primeiro, rode, veja falhar pelo motivo certo, então implemente.
- **Commits diretos na `main`** (projeto solo).
- Nomes de arquivo e função em inglês (convenção do repo); comentários e mensagens em pt-BR.

---

## File Structure

**Criados — lógica pura (testável sem banco):**

| Arquivo                    | Responsabilidade                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `lib/trello/types.ts`      | As formas do export que usamos (card, lista, anexo, ação, membro). Nada além do que se lê.                                   |
| `lib/trello/classify.ts`   | A natureza de um card: demanda, separador, ausência, referência.                                                             |
| `lib/trello/map-task.ts`   | Card → campos da demanda: título com prefixo de rótulo, descrição, prazo, prioridade, status, `completedAt`, mês do projeto. |
| `lib/trello/map-people.ts` | Membro do Trello → usuário do WorkOS, em três estratégias, com lista de repescagem.                                          |
| `lib/trello/map-stages.ts` | Quais etapas entram, com que responsável e que datas — os três níveis de evidência.                                          |
| `lib/trello/map-rework.ts` | As devoluções da revisão → entradas de `ReworkEvent`.                                                                        |
| `lib/trello/plan.ts`       | Junta tudo num **plano de importação** (estrutura de dados), sem tocar no banco.                                             |

**Criados — escrita e execução:**

| Arquivo                        | Responsabilidade                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `lib/trello/writer.ts`         | Aplica o plano: projetos mensais, demandas, etapas, artefatos. Checa idempotência. |
| `scripts/import-trello/run.ts` | O executável. Ensaio por padrão, relatório, `--commit` para gravar.                |

**Modificados — produção, só o autorizado:**

| Arquivo                           | Mudança                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `lib/task-start.ts`               | `markTaskStarted(client, taskId, at?)`                                   |
| `lib/stage-transitions.ts`        | `recordStageTransition(..., at?)` e `recordStageTransitions(..., at?)`   |
| `lib/stage-assignment-helpers.ts` | `createTaskStages(tx, { ..., at? })`                                     |
| `lib/actions/task.ts`             | `createTask` passa a chamar o miolo extraído                             |
| `lib/task-create-core.ts`         | **novo** — o miolo transacional, compartilhado pela action e pelo script |
| `package.json`                    | `tsx` em devDependencies                                                 |

---

### Task 1: data explícita nas três funções do fluxo

Sem isto, importar pelo caminho do produto produz um histórico datado de **hoje** — o oposto do objetivo. O padrão continua `new Date()`, então nenhum comportamento de produção muda.

**Files:**

- Modify: `lib/task-start.ts`, `lib/stage-transitions.ts`, `lib/stage-assignment-helpers.ts`
- Test: `__tests__/lib/task-start.test.ts`, `__tests__/lib/stage-transitions.test.ts`, `__tests__/lib/actions/task-stage-setup.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces:
  - `markTaskStarted(client, taskId, at?: Date)`
  - `recordStageTransition(client, taskId, stageId, status, at?: Date)`
  - `recordStageTransitions(client, taskId, stageIds, status, at?: Date)`
  - `createTaskStages(tx, { …, at?: Date })` — usa `at` para `assignedAt`, para o `TaskStageLog.enteredAt` e ao chamar `recordStageTransition`.

- [ ] **Step 1: Escrever os testes que falham**

Em `__tests__/lib/task-start.test.ts`:

```ts
it("sem data explícita, carimba agora", async () => {
  const client = fakeClient();
  const antes = Date.now();
  await markTaskStarted(client, "t1");
  const gravado = client.task.updateMany.mock.calls[0][0].data.startedAt as Date;
  expect(gravado.getTime()).toBeGreaterThanOrEqual(antes);
});

it("com data explícita, carimba a data pedida — é o que a importação histórica precisa", async () => {
  const client = fakeClient();
  const quando = new Date("2025-08-14T10:00:00.000Z");
  await markTaskStarted(client, "t1", quando);
  expect(client.task.updateMany.mock.calls[0][0].data.startedAt).toEqual(quando);
});
```

Em `__tests__/lib/stage-transitions.test.ts`, o par equivalente para `recordStageTransition`, afirmando que o `data` do `create` leva o campo de data quando ela é passada e não o leva (deixando o default do banco) quando não é.

Em `__tests__/lib/actions/task-stage-setup.test.ts`, um caso afirmando que `createTaskStages` com `at` grava `assignedAt` e `TaskStageLog.enteredAt` com essa data.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/task-start.test.ts __tests__/lib/stage-transitions.test.ts`
Expected: FAIL — as funções não aceitam o terceiro/quarto argumento.

- [ ] **Step 3: Implementar**

```ts
// lib/task-start.ts
export async function markTaskStarted(
  client: TaskStartWriter,
  taskId: string,
  /** Data do início. Padrão: agora. A importação histórica passa a data real. */
  at?: Date
): Promise<void> {
  await client.task.updateMany({
    where: { id: taskId, startedAt: null },
    data: { startedAt: at ?? new Date() },
  });
}
```

```ts
// lib/stage-transitions.ts
export async function recordStageTransition(
  client: TransitionWriter,
  taskId: string,
  stageId: string,
  status: ActiveStageStatus,
  /** Quando a transição aconteceu. Padrão: o default do banco (agora). */
  at?: Date
): Promise<void> {
  await client.stageTransition.create({
    data: { taskId, stageId, status, ...(at ? { at } : {}) },
  });
}
```

> O campo é mesmo `at` (`StageTransition.at DateTime @default(now())`) — conferido no `schema.prisma`.

Em `createTaskStages`, acrescente `at?: Date` a `args`, e use-o nos três pontos que hoje chamam `new Date()` ou dependem do default: `assignedAt`, o `TaskStageLog` criado e a chamada a `recordStageTransition`.

- [ ] **Step 4: Rodar e ver passar, e a suíte inteira**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. A suíte inteira é o que prova que o padrão não mudou.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(fluxo): data explícita opcional nas funções de início e transição"
```

---

### Task 2: extrair o miolo de `createTask`

`createTask` não é chamável de um script: termina em `redirect()`, que lança por design, exige sessão e chama `revalidatePath`. O que se reusa é o bloco transacional.

**Files:**

- Create: `lib/task-create-core.ts`
- Modify: `lib/actions/task.ts` (`createTask` passa a chamar o miolo)
- Test: `__tests__/lib/task-create-core.test.ts`

**Interfaces:**

- Consumes: `createTaskStages` e `markTaskStarted` com `at` (Task 1).
- Produces:

```ts
export interface CreateTaskCoreInput {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  projectId: string;
  templateId: string;
  userId: string;
  status?: TaskStatus; // padrão BACKLOG (o produto); a importação passa o dela
  completedAt?: Date | null; // só quando status === "COMPLETED"
  createdAt?: Date; // a importação data no passado
  assignments?: Record<string, string>;
  selectedStageIds?: ReadonlySet<string>;
  teams?: Record<string, string>;
  instructions?: Record<string, string>;
  at?: Date; // repassado a createTaskStages/markTaskStarted
}
export async function createTaskCore(
  tx: Prisma.TransactionClient,
  input: CreateTaskCoreInput
): Promise<{ id: string; initialAssigned: boolean }>;
```

- [ ] **Step 1: Escrever o teste que falha**

`__tests__/lib/task-create-core.test.ts` com prisma falso:

```ts
it("cria a demanda e as etapas, e marca iniciada quando a etapa inicial já tem dono", async () => {
  const tx = fakeTx();
  const r = await createTaskCore(tx, { …base, assignments: { s1: "u1" } });
  expect(tx.task.create).toHaveBeenCalledOnce();
  expect(r.initialAssigned).toBe(true);
  expect(tx.task.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { status: "IN_PROGRESS" } })
  );
});

it("sem dono na etapa inicial, a demanda fica em BACKLOG", async () => { … });

it("a importação manda o próprio status e a data — e eles chegam ao create", async () => {
  const tx = fakeTx();
  const quando = new Date("2025-08-14T10:00:00.000Z");
  await createTaskCore(tx, { …base, status: "OBSOLETE", createdAt: quando });
  const data = tx.task.create.mock.calls[0][0].data;
  expect(data.status).toBe("OBSOLETE");
  expect(data.createdAt).toEqual(quando);
});
```

- [ ] **Step 2: Rodar e ver falhar** — o módulo não existe.

- [ ] **Step 3: Implementar**, movendo o bloco de `lib/actions/task.ts` (o `prisma.$transaction` de `createTask`) para o módulo novo, com os campos novos opcionais. `createTask` passa a ser:

```ts
const task = await prisma.$transaction((tx) =>
  createTaskCore(tx, {
    title,
    description: description || null,
    priority: priority || "MEDIUM",
    dueDate,
    projectId,
    templateId,
    userId,
    assignments,
    selectedStageIds,
    teams: stageTeams,
    instructions: stageInstructions,
  })
);
```

O `revalidatePath` e o `redirect` **ficam na action** — são do mundo da requisição.

- [ ] **Step 4: A suíte de criação é a rede**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, sem tocar em nenhum teste existente de criação de demanda. Se algum precisar mudar, **pare e explique** — extração pura não muda comportamento.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(demanda): o miolo de createTask vira função compartilhada"
```

---

### Task 3: ler e classificar o export

**Files:**

- Create: `lib/trello/types.ts`, `lib/trello/classify.ts`
- Test: `__tests__/lib/trello/classify.test.ts`

**Interfaces:**

- Produces: `type CardNature = "demanda" | "separador" | "ausencia" | "referencia"` e `cardNature(card, labelsById): CardNature`.

- [ ] **Step 1: Teste com os títulos REAIS do export**

```ts
describe("natureza do card", () => {
  it("separadores visuais não são demanda", () => {
    for (const t of [
      "PRIORIDAD 👆",
      "EN PROCESO ⬆️",
      "-------------------------------------",
      "☝ ALTERACIÓN ☝",
      "Haciendo☝",
      "PARA HACER 👆",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("separador");
    }
  });

  it("ausências e eventos não são demanda", () => {
    for (const t of [
      "FERIADO 14/05",
      "FÉRIAS 09 A 16/06",
      "DIA LIBRE 15/05",
      "SABADO LIVRE 14/06",
      "REUNIÓN JULIO 23/06",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("ausencia");
    }
  });

  it("instrução e referência não são demanda", () => {
    for (const t of [
      "TAMAÑO - Banners Web",
      "ACCESSOS",
      "MODELO - SOLICITAÇÃO Briefing",
      "Modelo - Pedido Tráfego",
      "MODELO - Checklist materiais campanhas",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("referencia");
    }
  });

  it("trabalho de verdade é demanda", () => {
    for (const t of [
      "Identidad Albirroa ATL",
      "Carrusel de carnaval",
      "VIDEO - CAMPAÑA Atlantic Essence",
      "Capa Reel",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("demanda");
    }
  });

  it("card com anexo é demanda mesmo com rótulo MODELO — o arquivo é a evidência", () => {
    const c = card({ name: "MODELO x", idLabels: ["L1"], attachments: [anexo()] });
    expect(cardNature(c, { L1: "MODELO" })).toBe("demanda");
  });
});
```

O último caso é o que impede a regra de referência de engolir trabalho real: rótulo `MODELO` só desclassifica quando **não há anexo**.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** com os três padrões da spec (separador: `^[\s\-=_*.·—]+$` ou contendo `⬆️👆👇⬇️☝`; ausência: `feriado|férias|vacaciones|día libre|sábado livre|reunión|acompañamiento|cumpleaños`; referência: título começando com `modelo|tamaño|acceso|checklist`, ou rótulo `MODELO` **sem anexo**).

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Verificar contra o export real** — um teste que lê o JSON e afirma a contagem: 230 demandas, 38 separadores, 25 ausências, 10 referências (soma 303 — confira a soma, foi ela que pegou meu erro). Se o arquivo não estiver presente no ambiente, o teste é pulado com `it.skip` e uma nota; **não invente números**.

- [ ] **Step 6: Commit.**

---

### Task 4: mapear o card para os campos da demanda

**Files:**

- Create: `lib/trello/map-task.ts`
- Test: `__tests__/lib/trello/map-task.test.ts`

**Interfaces:**

- Produces: `mapCardToTask(card, ctx): { title; description; dueDate; priority; status; completedAt; monthKey }`.

- [ ] **Step 1: Testes que falham**

```ts
it("o rótulo de tipo vira prefixo do título", () => {
  const r = mapCardToTask(card({ name: "Carrusel de carnaval", idLabels: ["L1"] }),
                          ctx({ labels: { L1: "STORIES" } }));
  expect(r.title).toBe("[STORIES] Carrusel de carnaval");
});

it("prioridade sai dos rótulos, e só deles", () => {
  expect(prio("URGENTE")).toBe("URGENT");
  expect(prio("PRIORIDAD")).toBe("HIGH");
  expect(prio("IMPORTANTE")).toBe("HIGH");
  expect(prio(undefined)).toBe("MEDIUM");
});

describe("status — arquivado NÃO é concluído", () => {
  it("card na lista Concluido é COMPLETED, e só ele leva completedAt", () => {
    const r = mapCardToTask(card({ idList: "L_CONC", dateClosed: "2026-07-02T10:00:00Z" }), ctx());
    expect(r.status).toBe("COMPLETED");
    expect(r.completedAt).toEqual(new Date("2026-07-02T10:00:00Z"));
  });

  it("arquivado em OUTRA lista é OBSOLETE e NÃO leva completedAt", () => {
    const r = mapCardToTask(card({ idList: "L_AV", closed: true, dateClosed: "2026-07-02T10:00:00Z" }), ctx());
    expect(r.status).toBe("OBSOLETE");
    expect(r.completedAt).toBeNull();
  });

  it("card aberto fora de Concluido é IN_PROGRESS", () => { … });
});

describe("mês do projeto", () => {
  it("usa o prazo quando existe", () => { … expect(r.monthKey).toBe("2026-07"); });
  it("cai na última atividade quando não há prazo", () => { … });
  it("sem os dois, devolve null para a repescagem — não inventa mês", () => {
    expect(mapCardToTask(card({ due: null, dateLastActivity: null }), ctx()).monthKey).toBeNull();
  });
});
```

O par "COMPLETED leva `completedAt` / OBSOLETE não leva" é o teste que protege o lead time. Um `completedAt` datado com o arquivamento de card abandonado corromperia a medida sem dar erro.

- [ ] **Steps 2-4:** rodar, ver falhar, implementar, ver passar.
- [ ] **Step 5: Commit.**

---

### Task 5: mapear as pessoas

**Files:**

- Create: `lib/trello/map-people.ts`
- Test: `__tests__/lib/trello/map-people.test.ts`

**Interfaces:**

- Produces: `matchMembers(trelloMembers, workosUsers): { byTrelloId: Map<string,string>; unmatched: TrelloMember[] }`.

- [ ] **Step 1: Testes com os dados reais dos dois lados**

```ts
const users = [
  { id: "u1", name: "Adonias Henrique Dias Nery", email: "henriquegoonmkt@gmail.com" },
  { id: "u2", name: "Benicio Mathias Gonzalez Delgado", email: "mathiasgoonmk@gmail.com" },
  { id: "u3", name: "Alessandra Francielli Marques", email: "leligoonmkt@gmail.com" },
];

it("casa pelo prefixo do e-mail — o padrão <apelido>goonmkt@", () => {
  const r = matchMembers([m({ id: "t1", username: "leligoon", fullName: "Lèli Goon" })], users);
  expect(r.byTrelloId.get("t1")).toBe("u3");
});

it("casa pelo nome completo idêntico", () => {
  const r = matchMembers([m({ id: "t2", fullName: "Adonias Henrique Dias Nery" })], users);
  expect(r.byTrelloId.get("t2")).toBe("u1");
});

it("casa por nome e sobrenome contidos no nome completo", () => {
  const r = matchMembers([m({ id: "t3", fullName: "Mathias Gonzalez" })], users);
  expect(r.byTrelloId.get("t3")).toBe("u2");
});

it("quem não casa vai para repescagem — NUNCA para o mais parecido", () => {
  const r = matchMembers([m({ id: "t9", fullName: "Fulano Que Saiu", username: "xyz" })], users);
  expect(r.byTrelloId.has("t9")).toBe(false);
  expect(r.unmatched.map((x) => x.id)).toEqual(["t9"]);
});

it("um usuário do WorkOS não é atribuído a dois membros do Trello", () => { … });
```

Os dois últimos são os que importam: atribuir trabalho à pessoa errada é pior que não atribuir, e a única saída honesta para o ambíguo é a repescagem manual.

- [ ] **Steps 2-5:** ciclo TDD e commit.

---

### Task 6: quais etapas entram, com que responsável e que datas

O coração da entrega, e onde a honestidade é regra: **etapa sem evidência não entra.**

**Files:**

- Create: `lib/trello/map-stages.ts`
- Test: `__tests__/lib/trello/map-stages.test.ts`

**Interfaces:**

- Produces:

```ts
export interface StagePlan {
  stageName: "Desenho" | "Audio Visual" | "Quality Control" | "Aprovação";
  assigneeTrelloId?: string;
  enteredAt?: Date;
  exitedAt?: Date;
  completed: boolean;
}
export function planStages(card, movements, ctx): { stages: StagePlan[]; tier: 1 | 2 | 3 };
```

- [ ] **Step 1: Testes dos três níveis**

```ts
it("nível 1 — com movimentação, reconstrói a jornada com datas", () => {
  const r = planStages(card({ idList: "L_CONC" }), [
    mov("DISEÑO - MARTIN", "REVISIÓN", "2026-08-14T10:00:00Z"),
    mov("REVISIÓN", "LIBERADO", "2026-08-14T15:00:00Z"),
    mov("LIBERADO", "Concluido", "2026-08-15T09:00:00Z"),
  ], ctx());
  expect(r.tier).toBe(1);
  expect(r.stages.map((s) => s.stageName)).toEqual(["Desenho", "Quality Control", "Aprovação"]);
  expect(r.stages[1].enteredAt).toEqual(new Date("2026-08-14T10:00:00Z"));
  expect(r.stages[1].exitedAt).toEqual(new Date("2026-08-14T15:00:00Z"));
});

it("nível 2 — sem movimentação, o anexo diz quem produziu e quando", () => {
  const r = planStages(card({ idList: "L_MARTIN", attachments: [anexo({ idMember: "tMartin", date: "2026-04-02T12:00:00Z" })] }), [], ctx());
  expect(r.tier).toBe(2);
  expect(r.stages).toHaveLength(1);
  expect(r.stages[0]).toMatchObject({ stageName: "Desenho", assigneeTrelloId: "tMartin" });
  expect(r.stages[0].enteredAt).toEqual(new Date("2026-04-02T12:00:00Z"));
});

it("nível 3 — só a lista de origem, sem data de etapa", () => {
  const r = planStages(card({ idList: "L_AV" }), [], ctx());
  expect(r.tier).toBe(3);
  expect(r.stages.map((s) => s.stageName)).toEqual(["Audio Visual"]);
  expect(r.stages[0].enteredAt).toBeUndefined();
});

it("NUNCA inclui etapa sem evidência", () => {
  const r = planStages(card({ idList: "L_CONC" }), [], ctx());
  const nomes = r.stages.map((s) => s.stageName);
  expect(nomes).not.toContain("Briefing");
  expect(nomes).not.toContain("Relatório");
  expect(nomes).not.toContain("Quality Control"); // estar em Concluido não prova que passou pela revisão
});

it("card de vídeo inclui Audio Visual e exclui Desenho, e vice-versa", () => { … });
```

O caso "estar em `Concluido` não prova que passou pela revisão" é o que impede a inferência estrutural mais tentadora da entrega. Movimentos diretos para `Concluido` existem no export (`COMUNICADOR → Concluido`, `DISEÑO - MARTIN → Concluido`).

- [ ] **Steps 2-5:** ciclo TDD e commit.

---

### Task 7: as devoluções da revisão viram retrabalho

**Files:**

- Create: `lib/trello/map-rework.ts`
- Test: `__tests__/lib/trello/map-rework.test.ts`

**Interfaces:**

- Produces: `planRework(movements, ctx): Array<{ at: Date; kind: "INTERNAL"; sourceStageName: string; byTrelloId?: string; reason: string }>`.

- [ ] **Step 1: Teste, com a armadilha explícita**

```ts
it("devolução da revisão é retrabalho INTERNO atribuído à etapa que INJETOU o defeito", () => {
  const r = planRework([mov("REVISIÓN", "DISEÑO - MARTIN", "2026-08-20T11:00:00Z")], ctx());
  expect(r).toHaveLength(1);
  expect(r[0].kind).toBe("INTERNAL");
  // A origem é o DESENHO, que produziu o defeito — não a revisão, que o encontrou.
  // Trocar isso mediria quem acha defeito em vez de onde ele nasce (P5).
  expect(r[0].sourceStageName).toBe("Desenho");
  expect(r[0].at).toEqual(new Date("2026-08-20T11:00:00Z"));
});

it("devolução para audiovisual atribui ao Audio Visual", () => { … });

it("saída da revisão para LIBERADO não é retrabalho", () => {
  expect(planRework([mov("REVISIÓN", "LIBERADO", "…")], ctx())).toEqual([]);
});

it("movimento que não sai da revisão não é retrabalho", () => {
  expect(planRework([mov("DISEÑO - MARTIN", "REVISIÓN", "…")], ctx())).toEqual([]);
});
```

- [ ] **Steps 2-5:** ciclo TDD e commit.

---

### Task 8: o plano de importação, sem tocar no banco

Junta tudo numa estrutura de dados inspecionável — é ela que o ensaio imprime e o escritor aplica.

**Files:**

- Create: `lib/trello/plan.ts`
- Test: `__tests__/lib/trello/plan.test.ts`

**Interfaces:**

- Produces: `buildImportPlan(board, workosUsers, opts): ImportPlan`, com `ImportPlan = { projects: {monthKey, name}[]; tasks: PlannedTask[]; skipped: {card, reason}[]; unmatchedPeople: TrelloMember[] }`.

- [ ] **Step 1: Testes**

```ts
it("agrupa em um projeto por mês, com nome previsível", () => {
  const p = buildImportPlan(board, users, {});
  expect(p.projects.map((x) => x.name)).toContain("AtlanticoShop 2026-07");
});

it("descarta separador, ausência e referência, dizendo o motivo de cada um", () => {
  const p = buildImportPlan(board, users, {});
  const motivos = new Set(p.skipped.map((s) => s.reason));
  expect(motivos).toEqual(new Set(["separador", "ausencia", "referencia"]));
});

it("card sem mês vai para descartados, não para um mês inventado", () => { … });

it("toda demanda planejada tem pelo menos uma etapa", () => {
  const p = buildImportPlan(board, users, {});
  for (const t of p.tasks) expect(t.stages.length).toBeGreaterThan(0);
});
```

O último é invariante do produto: `createTaskStages` lança se nenhuma etapa for incluída. Melhor descobrir no plano que no meio da gravação.

- [ ] **Steps 2-5:** ciclo TDD e commit.

---

### Task 9: o escritor, com idempotência pela URL do card

**Files:**

- Create: `lib/trello/writer.ts`
- Test: `__tests__/lib/trello/writer.test.ts`

**Interfaces:**

- Consumes: `createTaskCore` (Task 2), `ImportPlan` (Task 8).
- Produces: `applyImportPlan(prisma, plan, { commit: boolean }): Promise<ImportReport>`.

- [ ] **Step 1: Testes**

```ts
it("ENSAIO não escreve nada — contado, não deduzido", async () => {
  const prisma = fakePrisma();
  await applyImportPlan(prisma, plan, { commit: false });
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.task.create).not.toHaveBeenCalled();
  expect(prisma.project.create).not.toHaveBeenCalled();
});

it("pula a demanda cujo card já foi importado — a URL do card é a chave", async () => {
  const prisma = fakePrisma({ artifactExistsFor: ["https://trello.com/c/abc"] });
  const r = await applyImportPlan(prisma, planCom(["https://trello.com/c/abc"]), { commit: true });
  expect(r.skippedAlreadyImported).toBe(1);
  expect(prisma.task.create).not.toHaveBeenCalled();
});

it("rodar duas vezes cria a demanda uma vez só", async () => {
  const prisma = fakePrismaComEstado();
  await applyImportPlan(prisma, plan, { commit: true });
  await applyImportPlan(prisma, plan, { commit: true });
  expect(contarTasksCriadas(prisma)).toBe(plan.tasks.length);
});

it("cada demanda ganha o artefato do card original e um por anexo", async () => { … });

it("uma transação por projeto mensal — um mês que falha não derruba os outros", async () => { … });
```

O teste de rodar duas vezes é o que protege o estrago mais caro desta entrega.

- [ ] **Steps 2-5:** ciclo TDD e commit.

---

### Task 10: o executável — ensaio, relatório, `--commit`

**Files:**

- Create: `scripts/import-trello/run.ts`
- Modify: `package.json` (`tsx` em devDependencies)
- Test: `__tests__/lib/trello/report.test.ts` (o formato do relatório é lógica pura)

- [ ] **Step 1: O relatório é testável — teste primeiro**

```ts
it("o relatório diz o que entra, o que fica de fora e por quê", () => {
  const txt = formatReport(plan);
  expect(txt).toContain("230 demandas");
  expect(txt).toContain("18 projetos");
  expect(txt).toMatch(/separador:\s*38/);
  expect(txt).toContain("repescagem manual");
});
```

- [ ] **Step 2: Implementar o executável**

```ts
// scripts/import-trello/run.ts
// Importação ÚNICA do quadro do Trello (AtlanticoShop). Ensaio por padrão.
//   Ensaio:   npx tsx scripts/import-trello/run.ts --file "<export.json>"
//   Gravando: npx tsx scripts/import-trello/run.ts --file "<export.json>" --commit
```

O `--commit` só grava depois de imprimir o mesmo relatório do ensaio. Sem `--file`, sai com erro — **nada de caminho embutido no código**.

- [ ] **Step 3: Ensaio de verdade contra o export real**

Run: `npx tsx scripts/import-trello/run.ts --file "/Users/fsrezende/Downloads/goon/atl/export trello/INm0k5De - atlantico-shop.json"`
Expected: relatório com 230 demandas, 18 projetos, 73 descartados e a lista de repescagem. **Nenhuma escrita** — confirme com uma contagem de demandas antes e depois.

- [ ] **Step 4: `npm test && npx tsc --noEmit`.**

- [ ] **Step 5: Commit.**

---

### Task 11: as notas que sobrevivem à importação

**Files:**

- Modify: `docs/pendencias.md`

- [ ] **Step 1:** registrar, na seção de limitações: os **10 cards de instrução** que ficaram fora (com os títulos), o que **não** foi importado e por quê (38 separadores, 25 ausências, comentários), e que os anexos são **link para o Trello** — se o quadro for apagado, as referências morrem junto.

- [ ] **Step 2:** registrar a decisão em aberto que a spec levantou: o **projeto que já existe** no cliente AtlanticoShop convive com os 18 mensais ou é absorvido.

- [ ] **Step 3: Commit.**

---

## Self-Review

**Cobertura da spec.** Cada seção tem task: classificação por natureza (3), mapeamento de campos incluindo status e prioridade (4), pessoas (5), etapas nos três níveis (6), retrabalho com a origem certa (7), projetos mensais e plano (8), idempotência e escrita (9), ensaio e relatório (10), notas (11). As duas mudanças de produção que a spec autoriza são as tasks 1 e 2, e nada além delas.

**Ordem e dependências.** 1 → 2 (o miolo usa as funções com data); 3 → 4, 5, 6, 7 (todas leem tipos e classificação); 8 depende de 4-7; 9 depende de 2 e 8; 10 depende de 9. Nenhuma task usa interface que uma posterior define.

**Placeholders.** Onde há `…` nos testes, é continuação óbvia de um caso já escrito por extenso logo acima, no mesmo bloco — não requisito omitido. Os valores que não podem ser inventados (contagens do export, nomes de etapa, códigos de prioridade e status) estão escritos por extenso.

**Riscos que os testes atacam de propósito.** Rodar duas vezes (task 9); `completedAt` em demanda não concluída (4); atribuir trabalho à pessoa errada (5); inferir etapa não observada (6); inverter a origem do retrabalho (7); o ensaio escrever sem querer (9).

**Verificado antes de fechar o plano:** o campo de data em `StageTransition` é `at`, com default `now()` — a Task 1 pode escrever direto, sem descobrir isso no meio.
