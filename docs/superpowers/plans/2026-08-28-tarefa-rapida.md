# Tarefa rápida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um colaborador registre, do celular, um trabalho de etapa única que já
aconteceu (data, tempo, link), mantendo métrica e histórico sem contaminar a previsão das demandas
normais.

**Architecture:** A tarefa rápida é uma `Task` comum cujo template tem exatamente uma etapa e a marca
`quickEntry`. Como a previsão já é por classe (template), separar o tipo basta para não envenenar o
p50/p85 das demandas normais. A gravação acontece numa transação que escreve o fluxo inteiro já
concluído, com os instantes derivados de (data, tempo) — sem passar por `createTaskStages`, que
existe para ABRIR um fluxo.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma/PostgreSQL, next-intl v4 (pt-BR +
es-ES), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-28-tarefa-rapida-design.md`

## Global Constraints

- **Bilíngue obrigatório:** toda string nova entra em `locales/pt-BR/*.json` **e**
  `locales/es-ES/*.json`. Existe teste de paridade; espanhol tem de ser espanhol de verdade.
- **Mensagens de erro de Server Action vêm do dicionário**, nunca fixas no código:
  `const t = await getTranslations("errors.<ns>")`.
- **Comentários explicam o PORQUÊ**, em português, no tom do repositório. Nada que só reescreva a
  linha de código.
- **Testes de Server Action precisam do mock de next-intl** (sob jsdom o next-intl resolve para o
  build de cliente e `getTranslations` lança):
  ```ts
  vi.mock("next-intl/server", () => ({
    getTranslations: vi.fn().mockResolvedValue((k: string) => k),
  }));
  ```
- **Verificação de cada task:** `npx tsc --noEmit -p tsconfig.json` limpo e `npx vitest run` verde.
- **Commits direto na `main`** (projeto solo, sem branch/PR).
- **Migrations:** escrever o SQL à mão em `prisma/migrations/<timestamp>_<nome>/migration.sql`, com
  comentário explicando a decisão. **Não** rodar `migrate deploy` — o banco é produção e a aplicação
  é decisão do usuário.

## File Structure

| Arquivo                                                         | Responsabilidade                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `lib/quick-task.ts` (novo)                                      | Regras puras: derivação dos instantes e validação da janela retroativa  |
| `lib/actions/quick-task.ts` (novo)                              | Server Action `createQuickTask` — a transação de gravação               |
| `lib/template-invariants.ts` (novo)                             | Predicados puros da trava recíproca `quickEntry` ↔ etapas               |
| `lib/actions/template.ts`                                       | Passa a aceitar `quickEntry`, guardado pela invariante                  |
| `lib/actions/stage.ts`                                          | `createTemplateStage` e `deleteTemplateStage` guardados pela invariante |
| `components/admin/TemplateHeader.tsx`                           | Caixa "fluxo rápido", habilitada/desabilitada com motivo                |
| `components/admin/CreateStageForm.tsx`                          | Botão "adicionar etapa" desabilitado com motivo                         |
| `app/[locale]/(protected)/tasks/quick/page.tsx` (novo)          | Tela do formulário                                                      |
| `app/[locale]/(protected)/tasks/quick/QuickTaskForm.tsx` (novo) | Formulário cliente + "salvar e repetir"                                 |

---

### Task 1: Coluna `quickEntry` no template

**Files:**

- Modify: `prisma/schema.prisma` (model `WorkflowTemplate`)
- Create: `prisma/migrations/20260828120000_add_template_quick_entry/migration.sql`

**Interfaces:**

- Consumes: nada
- Produces: campo `WorkflowTemplate.quickEntry: boolean` disponível no Prisma Client

- [ ] **Step 1: Adicionar o campo ao schema**

Em `prisma/schema.prisma`, dentro de `model WorkflowTemplate`, depois de `createdAt`:

```prisma
  /// Fluxo de ENTRADA RÁPIDA: registro de trabalho de etapa única que já aconteceu
  /// (ver docs/superpowers/specs/2026-08-28-tarefa-rapida-design.md).
  ///
  /// Só templates com esta marca aparecem no formulário rápido. A marca é o que separa a CLASSE:
  /// uma tarefa rápida nasce e morre no mesmo instante (lead time ≈ 0) e, misturada às demandas
  /// normais, puxaria o p50/p85 do tipo para baixo — justamente os percentis que alimentam a
  /// checagem de viabilidade na criação de demanda. Como a previsão é por classe (P4), separar o
  /// template já resolve.
  ///
  /// Invariante: template com `quickEntry` tem EXATAMENTE uma etapa (ver lib/template-invariants.ts).
  quickEntry Boolean @default(false)
```

- [ ] **Step 2: Escrever a migration**

```sql
-- Marca de fluxo de ENTRADA RÁPIDA (tarefa de etapa única, registrada depois de acontecer).
--
-- Default false, sem backfill: todos os templates existentes são fluxos normais, e marcar algum
-- retroativamente mudaria a classe de demandas já entregues — reescrevendo métrica fechada.
ALTER TABLE "WorkflowTemplate" ADD COLUMN "quickEntry" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Gerar o client e conferir que compila**

Run: `npx prisma format --schema prisma/schema.prisma && npx prisma generate && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(tarefa rápida): coluna quickEntry no template de fluxo"
```

---

### Task 2: Invariantes puras da trava recíproca

**Files:**

- Create: `lib/template-invariants.ts`
- Test: `__tests__/lib/template-invariants.test.ts`

**Interfaces:**

- Consumes: nada
- Produces:
  - `canEnableQuickEntry(stageCount: number): boolean`
  - `canAddStage(args: { stageCount: number; quickEntry: boolean }): boolean`
  - `canDeleteStage(stageCount: number): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/template-invariants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canEnableQuickEntry, canAddStage, canDeleteStage } from "@/lib/template-invariants";

// A trava é recíproca: a marca "rápido" e a quantidade de etapas restringem uma à outra. Estes
// predicados são a ÚNICA definição da regra — tela e servidor os consomem, para não existirem duas
// versões da mesma verdade que divergem na primeira mudança.

describe("canEnableQuickEntry", () => {
  it("permite marcar quando há exatamente uma etapa", () => {
    expect(canEnableQuickEntry(1)).toBe(true);
  });

  it("recusa com duas ou mais — um fluxo rápido é de etapa única", () => {
    expect(canEnableQuickEntry(2)).toBe(false);
    expect(canEnableQuickEntry(7)).toBe(false);
  });

  it("recusa com zero — template sem etapa não deve existir", () => {
    expect(canEnableQuickEntry(0)).toBe(false);
  });
});

describe("canAddStage", () => {
  it("um fluxo NORMAL sempre aceita mais uma etapa", () => {
    expect(canAddStage({ stageCount: 1, quickEntry: false })).toBe(true);
    expect(canAddStage({ stageCount: 5, quickEntry: false })).toBe(true);
  });

  it("um fluxo RÁPIDO com sua etapa já não aceita outra", () => {
    expect(canAddStage({ stageCount: 1, quickEntry: true })).toBe(false);
  });

  it("um fluxo rápido sem etapa alguma aceita a primeira", () => {
    // Estado transitório: a marca existe, a etapa ainda não. Bloquear aqui deixaria o template
    // preso em zero etapas, que é o estado que não deve existir.
    expect(canAddStage({ stageCount: 0, quickEntry: true })).toBe(true);
  });
});

describe("canDeleteStage", () => {
  it("recusa apagar a última — template sem etapa não deve existir", () => {
    // Hoje isso é possível, e a falha só aparece muito depois: quem tenta criar uma demanda com o
    // template recebe "Template is misconfigured", longe de quem apagou.
    expect(canDeleteStage(1)).toBe(false);
  });

  it("permite quando sobra etapa", () => {
    expect(canDeleteStage(2)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/template-invariants.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/template-invariants"`

- [ ] **Step 3: Implementar**

Criar `lib/template-invariants.ts`:

```ts
/**
 * Trava recíproca entre a marca de fluxo rápido e a quantidade de etapas.
 *
 * A regra vive aqui, pura, porque tem DOIS consumidores com papéis diferentes: a tela usa para
 * desabilitar o controle e escrever o motivo ao lado; o servidor usa para garantir. Se cada um
 * tivesse a sua cópia, divergiriam na primeira mudança — e a divergência apareceria como um botão
 * habilitado que devolve erro, que é a pior forma de descobrir uma regra.
 */

/** Só um fluxo de etapa única pode ser marcado como rápido. */
export function canEnableQuickEntry(stageCount: number): boolean {
  return stageCount === 1;
}

/** Um fluxo rápido já com sua etapa não aceita outra; qualquer outro caso aceita. */
export function canAddStage(args: { stageCount: number; quickEntry: boolean }): boolean {
  if (!args.quickEntry) return true;
  // Marca ativa e nenhuma etapa é estado transitório: bloquear prenderia o template em zero.
  return args.stageCount === 0;
}

/** Template sem etapa não deve existir — a última não sai. */
export function canDeleteStage(stageCount: number): boolean {
  return stageCount > 1;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/template-invariants.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/template-invariants.ts __tests__/lib/template-invariants.test.ts
git commit -m "feat(templates): invariantes puras da trava rápido↔etapas"
```

---

### Task 3: Servidor garante as invariantes

**Files:**

- Modify: `lib/actions/template.ts` (`updateWorkflowTemplate`)
- Modify: `lib/actions/stage.ts` (`createTemplateStage`, `deleteTemplateStage`)
- Modify: `lib/validations.ts` (`workflowTemplateSchema`)
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/template-invariants.test.ts`

**Interfaces:**

- Consumes: `canEnableQuickEntry`, `canAddStage`, `canDeleteStage` (Task 2)
- Produces: `updateWorkflowTemplate` passa a persistir `quickEntry`

- [ ] **Step 1: Adicionar as chaves de erro nos dois locales**

Em `locales/pt-BR/errors.json`, dentro do namespace `template`:

```json
"quickNeedsSingleStage": "Só um fluxo de etapa única pode ser marcado como rápido.",
"quickCannotAddStage": "Um fluxo rápido tem etapa única. Desmarque \"fluxo rápido\" para adicionar mais etapas.",
"lastStageCannotBeDeleted": "Um fluxo precisa de ao menos uma etapa."
```

Em `locales/es-ES/errors.json`, mesmo namespace:

```json
"quickNeedsSingleStage": "Solo un flujo de una sola etapa puede marcarse como rápido.",
"quickCannotAddStage": "Un flujo rápido tiene una sola etapa. Desmarca «flujo rápido» para añadir más etapas.",
"lastStageCannotBeDeleted": "Un flujo necesita al menos una etapa."
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `__tests__/lib/actions/template-invariants.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

vi.mock("@/lib/prisma", () => ({
  default: {
    workflowTemplate: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    templateStage: {
      count: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "s1" }),
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
    stageDependency: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { updateWorkflowTemplate } from "@/lib/actions/template";
import { createTemplateStage, deleteTemplateStage } from "@/lib/actions/stage";

const db = prisma as unknown as {
  workflowTemplate: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  templateStage: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function templateForm(fields: Record<string, string>) {
  const fd = new FormData();
  fd.append("name", "Story de loja");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function stageForm() {
  const fd = new FormData();
  fd.append("name", "Execução");
  fd.append("order", "1");
  fd.append("expectedDurationHours", "1");
  return fd;
}

describe("updateWorkflowTemplate — marca de fluxo rápido", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aceita marcar quando o template tem uma etapa só", async () => {
    db.templateStage.count.mockResolvedValue(1);
    const res = await updateWorkflowTemplate("tpl", templateForm({ quickEntry: "on" }));
    expect(res).toEqual(expect.objectContaining({ success: true }));
    expect(db.workflowTemplate.update.mock.calls[0][0].data.quickEntry).toBe(true);
  });

  it("recusa marcar com duas etapas, sem escrever nada", async () => {
    db.templateStage.count.mockResolvedValue(2);
    const res = await updateWorkflowTemplate("tpl", templateForm({ quickEntry: "on" }));
    expect(res).toEqual({ error: "quickNeedsSingleStage" });
    expect(db.workflowTemplate.update).not.toHaveBeenCalled();
  });

  it("desmarcar é sempre permitido — é a saída para poder crescer o fluxo", async () => {
    db.templateStage.count.mockResolvedValue(1);
    const res = await updateWorkflowTemplate("tpl", templateForm({}));
    expect(res).toEqual(expect.objectContaining({ success: true }));
    expect(db.workflowTemplate.update.mock.calls[0][0].data.quickEntry).toBe(false);
  });
});

describe("createTemplateStage — não cresce fluxo rápido", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa a segunda etapa num fluxo rápido", async () => {
    db.workflowTemplate.findUnique.mockResolvedValue({ quickEntry: true });
    db.templateStage.count.mockResolvedValue(1);
    const res = await createTemplateStage("tpl", stageForm());
    expect(res).toEqual({ error: "quickCannotAddStage" });
    expect(db.templateStage.create).not.toHaveBeenCalled();
  });

  it("aceita etapa em fluxo normal", async () => {
    db.workflowTemplate.findUnique.mockResolvedValue({ quickEntry: false });
    db.templateStage.count.mockResolvedValue(3);
    const res = await createTemplateStage("tpl", stageForm());
    expect(res).toEqual(expect.objectContaining({ success: true }));
  });
});

describe("deleteTemplateStage — nunca deixa o template vazio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa apagar a última etapa", async () => {
    db.templateStage.count.mockResolvedValue(1);
    const res = await deleteTemplateStage("s1", "tpl");
    expect(res).toEqual({ error: "lastStageCannotBeDeleted" });
    expect(db.templateStage.delete).not.toHaveBeenCalled();
  });

  it("permite quando sobra etapa", async () => {
    db.templateStage.count.mockResolvedValue(2);
    const res = await deleteTemplateStage("s1", "tpl");
    expect(res).toEqual(expect.objectContaining({ success: true }));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/template-invariants.test.ts`
Expected: FAIL — as ações ainda não conhecem `quickEntry` nem contam etapas

- [ ] **Step 4: Aceitar `quickEntry` no schema de validação**

Em `lib/validations.ts`, substituir `workflowTemplateSchema` por:

```ts
export const workflowTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(200),
  description: z.string().max(2000).optional().default(""),
  // Checkbox: presente = "on", ausente = undefined. A guarda da invariante é na action, que sabe
  // quantas etapas o template tem.
  quickEntry: z.coerce.boolean().optional().default(false),
});
```

- [ ] **Step 5: Guardar `updateWorkflowTemplate`**

Em `lib/actions/template.ts`, **primeiro** incluir o campo no `safeParse` (sem isto ele nunca chega
ao schema e a marca jamais é gravada):

```ts
const parsed = workflowTemplateSchema.safeParse({
  name: formData.get("name") ?? "",
  description: formData.get("description") ?? undefined,
  // Checkbox ausente vem como null; `?? undefined` deixa o default do schema (false) valer.
  quickEntry: formData.get("quickEntry") ?? undefined,
});
```

Depois, trocar o corpo entre o parse e o `prisma.workflowTemplate.update`:

```ts
  const { name, description, quickEntry } = parsed.data;

  // A marca só existe para fluxo de etapa única — ver lib/template-invariants.ts. Desmarcar é
  // sempre permitido: é a saída para o fluxo poder crescer.
  if (quickEntry) {
    const stageCount = await prisma.templateStage.count({ where: { templateId } });
    if (!canEnableQuickEntry(stageCount)) {
      return { error: (await getTranslations("errors.template"))("quickNeedsSingleStage") };
    }
  }

  try {
    await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { name, description, quickEntry },
    });
```

E no topo do arquivo:

```ts
import { canEnableQuickEntry } from "@/lib/template-invariants";
```

- [ ] **Step 6: Guardar `createTemplateStage` e `deleteTemplateStage`**

Em `lib/actions/stage.ts`, no topo:

```ts
import { canAddStage, canDeleteStage } from "@/lib/template-invariants";
```

Em `createTemplateStage`, logo depois do `if (!parsed.success)`:

```ts
// Um fluxo rápido tem etapa única. A tela já desabilita o botão; aqui é a garantia, porque
// requisição fora da tela não passa pela tela.
const [template, stageCount] = await Promise.all([
  prisma.workflowTemplate.findUnique({
    where: { id: templateId },
    select: { quickEntry: true },
  }),
  prisma.templateStage.count({ where: { templateId } }),
]);
if (!canAddStage({ stageCount, quickEntry: template?.quickEntry ?? false })) {
  return { error: (await getTranslations("errors.template"))("quickCannotAddStage") };
}
```

Em `deleteTemplateStage`, logo depois do `await requireAdmin();`:

```ts
// Template sem etapa não deve existir: `createTaskStages` lança "Template is misconfigured" só
// muito depois, quando alguém tenta criar uma demanda — longe de quem apagou.
const stageCount = await prisma.templateStage.count({ where: { templateId } });
if (!canDeleteStage(stageCount)) {
  return { error: (await getTranslations("errors.template"))("lastStageCannotBeDeleted") };
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/template-invariants.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (7 testes), tsc limpo

- [ ] **Step 8: Commit**

```bash
git add lib/actions/template.ts lib/actions/stage.ts lib/validations.ts locales __tests__/lib/actions/template-invariants.test.ts
git commit -m "feat(templates): servidor garante a trava rápido↔etapas e o template não-vazio"
```

---

### Task 4: A tela explica a trava

**Files:**

- Modify: `components/admin/TemplateHeader.tsx`
- Modify: `components/admin/CreateStageForm.tsx`
- Modify: `app/[locale]/(protected)/admin/templates/[templateId]/page.tsx`
- Modify: `locales/pt-BR/admin.json`, `locales/es-ES/admin.json`

**Interfaces:**

- Consumes: `canEnableQuickEntry`, `canAddStage` (Task 2); `WorkflowTemplate.quickEntry` (Task 1)
- Produces: nada consumido por tasks seguintes

- [ ] **Step 1: Chaves de tradução**

⚠️ Os namespaces importam: `TemplateHeader` usa `admin.workflows.header` e `CreateStageForm` usa
`admin.workflows.createStage`. Chave no lugar errado vira `MISSING_MESSAGE` na tela.

Em `locales/pt-BR/admin.json`, dentro de `workflows.header`:

```json
"quickEntry": {
  "label": "Fluxo rápido (registro de trabalho já feito)",
  "help": "Aparece no formulário de registro rápido, para trabalho de etapa única que já aconteceu.",
  "blockedByStages": "Só um fluxo de etapa única pode ser rápido. Este tem {count} etapas."
}
```

Em `locales/es-ES/admin.json`, dentro de `workflows.header`:

````json
"quickEntry": {
  "label": "Flujo rápido (registro de trabajo ya hecho)",
  "help": "Aparece en el formulario de registro rápido, para trabajo de una sola etapa que ya ocurrió.",
  "blockedByStages": "Solo un flujo de una sola etapa puede ser rápido. Este tiene {count} etapas."
}

E, dentro de `workflows.createStage` (namespace do próprio `CreateStageForm`):

```json
"blockedByQuick": "Un flujo rápido tiene una sola etapa. Desmarca «flujo rápido» para añadir más."
````

Em `locales/pt-BR/admin.json`, dentro de `workflows.createStage`:

```json
"blockedByQuick": "Um fluxo rápido tem etapa única. Desmarque \"fluxo rápido\" para adicionar mais."
```

````

- [ ] **Step 2: Passar a contagem e a marca para os componentes**

Em `app/[locale]/(protected)/admin/templates/[templateId]/page.tsx`, trocar as duas chamadas:

```tsx
<TemplateHeader template={template} stageCount={template.stages.length} />
````

```tsx
<CreateStageForm
  templateId={template.id}
  teams={teams}
  existingStages={template.stages.map((s) => ({ id: s.id, name: s.name, order: s.order }))}
  quickEntry={template.quickEntry}
  stageCount={template.stages.length}
/>
```

- [ ] **Step 3: Caixa "fluxo rápido" no cabeçalho**

Em `components/admin/TemplateHeader.tsx`, adicionar `stageCount: number` às props, importar
`canEnableQuickEntry` de `@/lib/template-invariants` e `useTranslations`, e inserir dentro do
`<form>`, depois do campo de descrição:

```tsx
{
  /* A caixa fica DESABILITADA com o motivo ao lado quando o fluxo tem mais de uma etapa.
              Deixá-la clicável e recusar no envio ensinaria a regra do jeito pior: depois de
              preencher. Já marcada, ela continua clicável — desmarcar é a saída para o fluxo crescer. */
}
<div>
  <label className="flex items-start gap-2 text-sm font-semibold text-foreground">
    <input
      type="checkbox"
      name="quickEntry"
      defaultChecked={template.quickEntry}
      disabled={!template.quickEntry && !canEnableQuickEntry(stageCount)}
      className="mt-0.5 h-4 w-4 accent-primary disabled:opacity-40"
    />
    <span>
      {t("quickEntry.label")}
      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
        {!template.quickEntry && !canEnableQuickEntry(stageCount)
          ? t("quickEntry.blockedByStages", { count: stageCount })
          : t("quickEntry.help")}
      </span>
    </span>
  </label>
</div>;
```

- [ ] **Step 4: Botão "adicionar etapa" desabilitado com motivo**

Em `components/admin/CreateStageForm.tsx`, adicionar `quickEntry: boolean` e `stageCount: number` às
props, importar `canAddStage`, e trocar o bloco `if (!isOpen)` por:

```tsx
const podeAdicionar = canAddStage({ stageCount, quickEntry });

if (!isOpen) {
  return (
    <div>
      <button
        onClick={() => setIsOpen(true)}
        disabled={!podeAdicionar}
        className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("addButton")}
      </button>
      {/* O motivo fica ao lado do botão desabilitado: botão cinza sem explicação vira chamado
            de suporte. */}
      {!podeAdicionar && (
        <p className="mt-2 text-sm text-muted-foreground">
          {tDetail("quickEntry.addStageBlocked")}
        </p>
      )}
    </div>
  );
}
```

O `t` já existente do componente (`admin.workflows.createStage`) resolve a chave — não é preciso um
segundo tradutor.

- [ ] **Step 5: Conferir tipos e testes**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc limpo, suíte verde (a paridade de locales precisa passar)

- [ ] **Step 6: Commit**

```bash
git add components/admin locales "app/[locale]/(protected)/admin/templates/[templateId]/page.tsx"
git commit -m "feat(templates): tela explica a trava rápido↔etapas em vez de recusar no envio"
```

---

### Task 5: Regras puras da tarefa rápida

**Files:**

- Create: `lib/quick-task.ts`
- Test: `__tests__/lib/quick-task.test.ts`

**Interfaces:**

- Consumes: `formatISODate`, `todayInSaoPaulo` de `@/lib/dates`
- Produces:
  - `QUICK_TASK_MAX_BACKDATE_DAYS = 7`
  - `type QuickTaskDateError = "future" | "tooOld"`
  - `validateQuickTaskDate(dateISO: string, now?: Date): QuickTaskDateError | null`
  - `quickTaskTimestamps(dateISO: string, minutes: number, now?: Date): { createdAt: Date; startedAt: Date; completedAt: Date }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/quick-task.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  QUICK_TASK_MAX_BACKDATE_DAYS,
  validateQuickTaskDate,
  quickTaskTimestamps,
} from "@/lib/quick-task";

// Estas regras decidem o que as métricas vão dizer sobre essa classe de trabalho para sempre.
// Erram em silêncio: nenhum teste de tela pega um lead time carimbado errado.

const AGORA = new Date("2026-08-28T15:00:00.000Z");

describe("validateQuickTaskDate", () => {
  it("aceita hoje", () => {
    expect(validateQuickTaskDate("2026-08-28", AGORA)).toBeNull();
  });

  it("aceita o limite da janela retroativa", () => {
    expect(validateQuickTaskDate("2026-08-21", AGORA)).toBeNull();
  });

  it("recusa antes da janela", () => {
    // Sem limite, um lançamento antigo reescreveria relatório já fechado.
    expect(validateQuickTaskDate("2026-08-20", AGORA)).toBe("tooOld");
  });

  it("recusa data futura — é registro do que JÁ aconteceu", () => {
    expect(validateQuickTaskDate("2026-08-29", AGORA)).toBe("future");
  });

  it("a janela são 7 dias", () => {
    expect(QUICK_TASK_MAX_BACKDATE_DAYS).toBe(7);
  });
});

describe("quickTaskTimestamps", () => {
  it("carimba o fim no instante atual quando a data é hoje", () => {
    // A pessoa acabou de terminar; `agora` é a verdade mais próxima que temos.
    const t = quickTaskTimestamps("2026-08-28", 40, AGORA);
    expect(t.completedAt.toISOString()).toBe(AGORA.toISOString());
  });

  it("deriva o início subtraindo o tempo gasto", () => {
    const t = quickTaskTimestamps("2026-08-28", 40, AGORA);
    expect(t.completedAt.getTime() - t.startedAt.getTime()).toBe(40 * 60 * 1000);
  });

  it("createdAt = startedAt: a demanda nasceu e foi servida no mesmo momento", () => {
    // É isso que zera o queue time desta classe, que é a verdade dela.
    const t = quickTaskTimestamps("2026-08-28", 40, AGORA);
    expect(t.createdAt.toISOString()).toBe(t.startedAt.toISOString());
  });

  it("data passada é carimbada ao meio-dia daquele dia", () => {
    // O horário do dia não é capturado (seria mais um campo, e nenhum relatório usa). Meio-dia é
    // marcador neutro e determinístico, e nunca cai no futuro.
    const t = quickTaskTimestamps("2026-08-25", 60, AGORA);
    expect(t.completedAt.toISOString()).toBe("2026-08-25T15:00:00.000Z"); // 12:00 em São Paulo (UTC-3)
    expect(t.startedAt.toISOString()).toBe("2026-08-25T14:00:00.000Z");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/quick-task.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/quick-task"`

- [ ] **Step 3: Implementar**

Criar `lib/quick-task.ts`:

```ts
import { formatISODate, todayInSaoPaulo } from "@/lib/dates";

/**
 * Regras puras da tarefa rápida — registro de trabalho de etapa única que JÁ aconteceu.
 *
 * Vivem separadas da Server Action porque decidem o que as métricas vão dizer sobre essa classe de
 * trabalho para sempre, e erram em silêncio: um lead time carimbado errado não quebra tela nenhuma,
 * só contamina relatório. Regra que erra calada é regra que precisa de teste próprio.
 */

/** Janela retroativa. Sem limite, um lançamento antigo reescreveria relatório já fechado. */
export const QUICK_TASK_MAX_BACKDATE_DAYS = 7;

export type QuickTaskDateError = "future" | "tooOld";

const DIA_MS = 86_400_000;

function diaSaoPauloISO(instant: Date): string {
  return formatISODate(todayInSaoPaulo(instant));
}

/** Null quando a data serve. */
export function validateQuickTaskDate(
  dateISO: string,
  now: Date = new Date()
): QuickTaskDateError | null {
  const hojeISO = diaSaoPauloISO(now);
  if (dateISO > hojeISO) return "future";

  const limite = new Date(
    Date.parse(`${hojeISO}T00:00:00Z`) - QUICK_TASK_MAX_BACKDATE_DAYS * DIA_MS
  );
  if (dateISO < formatISODate(limite)) return "tooOld";
  return null;
}

/**
 * Deriva os três instantes a partir de (data, minutos).
 *
 *   completedAt = fim do trabalho
 *   startedAt   = completedAt − tempo gasto
 *   createdAt   = startedAt
 *
 * Com isso: cycle time = tempo real de trabalho, lead time = o mesmo, queue time = zero. Todos
 * verdadeiros aqui, porque a demanda e a execução foram o mesmo momento.
 *
 * REJEITADO: `createdAt = agora` (instante do registro). Faria o lead time medir quanto a pessoa
 * demorou para lançar no sistema — ruído puro, e pior quanto mais tarde ela lançasse.
 */
export function quickTaskTimestamps(
  dateISO: string,
  minutes: number,
  now: Date = new Date()
): { createdAt: Date; startedAt: Date; completedAt: Date } {
  // Hoje → o instante atual, que é a verdade mais próxima. Dia passado → meio-dia em São Paulo:
  // o horário do dia não é capturado (seria mais um campo, e nenhum relatório usa), e meio-dia é
  // marcador neutro, determinístico e nunca futuro.
  const completedAt =
    dateISO === diaSaoPauloISO(now) ? new Date(now) : new Date(`${dateISO}T12:00:00-03:00`);

  const startedAt = new Date(completedAt.getTime() - minutes * 60_000);
  return { createdAt: new Date(startedAt), startedAt, completedAt };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/quick-task.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/quick-task.ts __tests__/lib/quick-task.test.ts
git commit -m "feat(tarefa rápida): derivação dos instantes e janela retroativa"
```

---

### Task 6: A Server Action que grava

**Files:**

- Create: `lib/actions/quick-task.ts`
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/quick-task.test.ts`

**Interfaces:**

- Consumes: `quickTaskTimestamps`, `validateQuickTaskDate`, `QUICK_TASK_MAX_BACKDATE_DAYS` (Task 5);
  `WorkflowTemplate.quickEntry` (Task 1)
- Produces:
  - `createQuickTask(formData: FormData): Promise<{ success: true; taskId: string } | { error: string }>`
  - `getQuickTemplates(): Promise<{ id: string; name: string }[]>`

- [ ] **Step 1: Chaves de erro nos dois locales**

Em `locales/pt-BR/errors.json`, namespace novo `quickTask`:

```json
"quickTask": {
  "templateRequired": "Escolha o tipo de trabalho.",
  "templateNotQuick": "Este tipo não é um fluxo rápido.",
  "projectRequired": "Escolha o projeto.",
  "minutesInvalid": "Informe o tempo gasto, em minutos.",
  "dateFuture": "A data não pode estar no futuro — o registro é de trabalho já feito.",
  "dateTooOld": "A data passou da janela de {days} dias.",
  "createFailed": "Erro ao registrar o trabalho."
}
```

Em `locales/es-ES/errors.json`:

```json
"quickTask": {
  "templateRequired": "Elige el tipo de trabajo.",
  "templateNotQuick": "Este tipo no es un flujo rápido.",
  "projectRequired": "Elige el proyecto.",
  "minutesInvalid": "Indica el tiempo dedicado, en minutos.",
  "dateFuture": "La fecha no puede estar en el futuro: el registro es de trabajo ya hecho.",
  "dateTooOld": "La fecha supera la ventana de {days} días.",
  "createFailed": "Error al registrar el trabajo."
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `__tests__/lib/actions/quick-task.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "u1", name: "Ana" }),
}));

const tx = {
  task: { create: vi.fn().mockResolvedValue({ id: "t1" }) },
  taskActiveStage: { create: vi.fn().mockResolvedValue({}) },
  taskStageLog: { create: vi.fn().mockResolvedValue({}) },
  stageTransition: { create: vi.fn().mockResolvedValue({}) },
  timeLog: { create: vi.fn().mockResolvedValue({}) },
  taskArtifact: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    workflowTemplate: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { createQuickTask } from "@/lib/actions/quick-task";

const db = prisma as unknown as {
  workflowTemplate: { findUnique: ReturnType<typeof vi.fn> };
  project: { findUnique: ReturnType<typeof vi.fn> };
};

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    templateId: "tpl",
    projectId: "p1",
    date: "2026-08-28",
    minutes: "40",
    title: "Story de loja",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) if (v !== "") fd.append(k, v);
  return fd;
}

describe("createQuickTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(tx).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear())
    );
    db.workflowTemplate.findUnique.mockResolvedValue({
      id: "tpl",
      quickEntry: true,
      stages: [{ id: "s1" }],
    });
    db.project.findUnique.mockResolvedValue({ id: "p1" });
    // `setSystemTime` só tem efeito com fake timers ligados; sem isto a data de "hoje" seria a real
    // e os testes de janela passariam ou falhariam conforme o dia em que a suíte roda.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("grava a demanda já concluída, com a etapa única concluída", async () => {
    const res = await createQuickTask(form());
    expect(res).toEqual({ success: true, taskId: "t1" });

    const task = tx.task.create.mock.calls[0][0].data;
    expect(task.status).toBe("COMPLETED");
    expect(task.workflowTemplateId).toBe("tpl");
    // createdAt = startedAt: queue time zero, que é a verdade desta classe.
    expect(task.createdAt.toISOString()).toBe(task.startedAt.toISOString());
    expect(task.completedAt.getTime() - task.startedAt.getTime()).toBe(40 * 60 * 1000);

    const stage = tx.taskActiveStage.create.mock.calls[0][0].data;
    expect(stage.status).toBe("COMPLETED");
    expect(stage.assigneeId).toBe("u1"); // quem registra é quem fez
  });

  it("grava as horas no dia informado, em HORAS", async () => {
    await createQuickTask(form({ minutes: "90" }));
    const log = tx.timeLog.create.mock.calls[0][0].data;
    expect(log.hoursSpent).toBeCloseTo(1.5, 5);
    expect(log.userId).toBe("u1");
  });

  it("grava o link como artefato quando informado", async () => {
    await createQuickTask(form({ link: "https://instagram.com/p/abc" }));
    expect(tx.taskArtifact.create).toHaveBeenCalledTimes(1);
    expect(tx.taskArtifact.create.mock.calls[0][0].data.storageKind).toBe("LINK");
  });

  it("não cria artefato quando não há link", async () => {
    await createQuickTask(form());
    expect(tx.taskArtifact.create).not.toHaveBeenCalled();
  });

  it("recusa template que não é de fluxo rápido, sem escrever nada", async () => {
    db.workflowTemplate.findUnique.mockResolvedValue({
      id: "tpl",
      quickEntry: false,
      stages: [{ id: "s1" }],
    });
    expect(await createQuickTask(form())).toEqual({ error: "templateNotQuick" });
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it("recusa data futura e data fora da janela", async () => {
    expect(await createQuickTask(form({ date: "2026-08-29" }))).toEqual({ error: "dateFuture" });
    expect(await createQuickTask(form({ date: "2026-08-01" }))).toEqual({ error: "dateTooOld" });
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it("recusa tempo ausente ou zero", async () => {
    expect(await createQuickTask(form({ minutes: "0" }))).toEqual({ error: "minutesInvalid" });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/quick-task.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/quick-task"`

- [ ] **Step 4: Implementar a action**

Criar `lib/actions/quick-task.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";
import {
  QUICK_TASK_MAX_BACKDATE_DAYS,
  quickTaskTimestamps,
  validateQuickTaskDate,
} from "@/lib/quick-task";

/** Tipos disponíveis no formulário rápido: só fluxos marcados como tal. */
export async function getQuickTemplates(): Promise<{ id: string; name: string }[]> {
  await requireMemberOrHigher();
  return prisma.workflowTemplate.findMany({
    where: { quickEntry: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Registra um trabalho de etapa única que JÁ aconteceu.
 *
 * Não passa por `createTaskStages`: aquela função existe para ABRIR um fluxo (primeira etapa ACTIVE,
 * log aberto, validação de responsável contra o time). Aqui o fluxo já terminou — a etapa nasce
 * concluída e o responsável é quem registrou, por definição. Reusá-la exigiria desfazer o que faz.
 */
export async function createQuickTask(formData: FormData) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;
  const t = await getTranslations("errors.quickTask");

  const templateId = String(formData.get("templateId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const date = String(formData.get("date") ?? "");
  const minutes = Number(formData.get("minutes") ?? 0);
  const link = String(formData.get("link") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  if (!templateId) return { error: t("templateRequired") };
  if (!projectId) return { error: t("projectRequired") };
  if (!Number.isFinite(minutes) || minutes <= 0) return { error: t("minutesInvalid") };

  const problema = validateQuickTaskDate(date);
  if (problema === "future") return { error: t("dateFuture") };
  if (problema === "tooOld") {
    return { error: t("dateTooOld", { days: QUICK_TASK_MAX_BACKDATE_DAYS }) };
  }

  const [template, project] = await Promise.all([
    prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, quickEntry: true, stages: { select: { id: true }, take: 2 } },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
  ]);

  // A marca é o que separa a CLASSE. Sem esta guarda, um fluxo normal registrado por aqui nasceria
  // com lead time zero e envenenaria o p50/p85 do próprio tipo.
  if (!template || !template.quickEntry || template.stages.length !== 1) {
    return { error: t("templateNotQuick") };
  }
  if (!project) return { error: t("projectRequired") };

  const stageId = template.stages[0].id;
  const { createdAt, startedAt, completedAt } = quickTaskTimestamps(date, minutes);

  try {
    const taskId = await prisma.$transaction(async (dbtx: Prisma.TransactionClient) => {
      const task = await dbtx.task.create({
        data: {
          title: title || "Registro rápido",
          description: description || null,
          status: "COMPLETED",
          priority: "MEDIUM",
          projectId,
          workflowTemplateId: templateId,
          assigneeId: userId,
          createdAt,
          startedAt,
          completedAt,
        },
        select: { id: true },
      });

      await dbtx.taskActiveStage.create({
        data: {
          taskId: task.id,
          stageId,
          status: "COMPLETED",
          assigneeId: userId,
          assignedAt: startedAt,
          activatedAt: startedAt,
          completedAt,
        },
      });

      // O log de etapa e as transições existem para o histórico de fluxo ficar reconstruível — os
      // relatórios de gargalo e de flow efficiency leem daqui, não da Task.
      await dbtx.taskStageLog.create({
        data: {
          taskId: task.id,
          stageId,
          userId,
          enteredAt: startedAt,
          exitedAt: completedAt,
          status: "COMPLETED",
        },
      });
      await dbtx.stageTransition.create({
        data: { taskId: task.id, stageId, status: "ACTIVE", at: startedAt },
      });
      await dbtx.stageTransition.create({
        data: { taskId: task.id, stageId, status: "COMPLETED", at: completedAt },
      });

      // Minutos viram horas: é assim que TimeLog guarda, e é o que a produtividade soma.
      await dbtx.timeLog.create({
        data: {
          taskId: task.id,
          stageId,
          userId,
          hoursSpent: minutes / 60,
          logDate: completedAt,
          description: description || null,
        },
      });

      if (link) {
        await dbtx.taskArtifact.create({
          data: {
            title: title || "Publicação",
            url: link,
            scope: "TASK",
            storageKind: "LINK",
            uploadStatus: "READY",
            // Nunca CONFIDENCIAL nesta classe: o conteúdo é material publicado, e o nível alto
            // dispararia regras de compartilhamento que não fazem sentido para um link público.
            sensitivity: "CLIENTE",
            taskId: task.id,
            userId,
          },
        });
      }

      return task.id;
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    revalidatePath(`/projects/${projectId}`);
    return { success: true as const, taskId };
  } catch (error) {
    console.error("createQuickTask error:", error);
    return { error: t("createFailed") };
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/quick-task.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (7 testes), tsc limpo

> **Nota para quem implementa:** se algum outro campo obrigatório de `TaskArtifact` fizer o tsc
> reclamar (por exemplo `mediaType`), preencha com o default do schema. `sensitivity` já vai
> explícita como `CLIENTE` — a spec proíbe `CONFIDENCIAL` nesta classe.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/quick-task.ts locales __tests__/lib/actions/quick-task.test.ts
git commit -m "feat(tarefa rápida): ação que grava o fluxo já concluído"
```

---

### Task 7: O formulário

**Files:**

- Create: `app/[locale]/(protected)/tasks/quick/page.tsx`
- Create: `app/[locale]/(protected)/tasks/quick/QuickTaskForm.tsx`
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`

**Interfaces:**

- Consumes: `createQuickTask`, `getQuickTemplates` (Task 6); `getProjectsForSelect` de
  `@/lib/actions/task`; `useServerAction` de `@/lib/hooks/useServerAction`
- Produces: rota `/tasks/quick`

- [ ] **Step 1: Chaves de tradução**

Em `locales/pt-BR/tasks.json`, na raiz, adicionar o namespace `quick`:

```json
"quick": {
  "kicker": "Registro rápido",
  "title": "Registrar trabalho já feito",
  "subtitle": "Para trabalho de etapa única que já aconteceu — sem abrir demanda.",
  "type": "Tipo de trabalho",
  "typePlaceholder": "Escolher tipo…",
  "project": "Projeto",
  "projectPlaceholder": "Escolher projeto…",
  "date": "Data",
  "minutes": "Tempo gasto (minutos)",
  "link": "Link da publicação",
  "linkHint": "Opcional — a URL do story ou post.",
  "titleField": "Título",
  "titleHint": "Preenchido automaticamente; edite se quiser.",
  "description": "Descrição",
  "save": "Salvar",
  "saveAndRepeat": "Salvar e repetir",
  "cancel": "Cancelar",
  "saved": "Trabalho registrado.",
  "savedKeepGoing": "Registrado. Continue no próximo.",
  "noTemplates": "Nenhum tipo de fluxo rápido cadastrado. Um administrador precisa marcar um fluxo de etapa única como rápido."
}
```

Em `locales/es-ES/tasks.json`:

```json
"quick": {
  "kicker": "Registro rápido",
  "title": "Registrar trabajo ya hecho",
  "subtitle": "Para trabajo de una sola etapa que ya ocurrió, sin abrir una demanda.",
  "type": "Tipo de trabajo",
  "typePlaceholder": "Elegir tipo…",
  "project": "Proyecto",
  "projectPlaceholder": "Elegir proyecto…",
  "date": "Fecha",
  "minutes": "Tiempo dedicado (minutos)",
  "link": "Enlace de la publicación",
  "linkHint": "Opcional: la URL del story o del post.",
  "titleField": "Título",
  "titleHint": "Se rellena solo; edítalo si quieres.",
  "description": "Descripción",
  "save": "Guardar",
  "saveAndRepeat": "Guardar y repetir",
  "cancel": "Cancelar",
  "saved": "Trabajo registrado.",
  "savedKeepGoing": "Registrado. Sigue con el siguiente.",
  "noTemplates": "No hay ningún tipo de flujo rápido dado de alta. Un administrador debe marcar un flujo de una sola etapa como rápido."
}
```

- [ ] **Step 2: A página (Server Component)**

Criar `app/[locale]/(protected)/tasks/quick/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getQuickTemplates } from "@/lib/actions/quick-task";
import { getProjectsForSelect } from "@/lib/actions/task";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { QuickTaskForm } from "./QuickTaskForm";

export const metadata: Metadata = { title: "Registro rápido" };

export default async function QuickTaskPage() {
  const [t, templates, projects] = await Promise.all([
    getTranslations("tasks.quick"),
    getQuickTemplates(),
    getProjectsForSelect(),
  ]);

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <PageHeader kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")} />
      <SectionCard bodyClassName="p-6">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
        ) : (
          <QuickTaskForm templates={templates} projects={projects} />
        )}
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 3: O formulário (Client Component)**

Criar `app/[locale]/(protected)/tasks/quick/QuickTaskForm.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Check, Repeat } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { createQuickTask } from "@/lib/actions/quick-task";
import { useServerAction } from "@/lib/hooks/useServerAction";

type Template = { id: string; name: string };
type Project = { id: string; name: string; client: { name: string } };

/** Formulário de registro rápido, pensado para o celular: poucos campos, um polegar.
 *
 *  "Salvar e repetir" existe para o caso real de cinco stories do mesmo cliente no mesmo dia —
 *  mantém tipo, cliente/projeto, data, tempo e descrição, e limpa só o que é individual de cada
 *  registro (título e link). Sem isso, a quinta vez teria a mesma fricção da primeira, que é o que
 *  esta tela existe para eliminar. */
export function QuickTaskForm({
  templates,
  projects,
}: {
  templates: Template[];
  projects: Project[];
}) {
  const t = useTranslations("tasks.quick");
  const router = useRouter();

  const hoje = new Date().toISOString().slice(0, 10);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(hoje);
  const [minutes, setMinutes] = useState("");
  const [description, setDescription] = useState("");
  // Individuais de cada registro: limpos pelo "salvar e repetir".
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  // Ref, não state: o clique no botão precisa marcar a intenção ANTES de o submit do form disparar,
  // e um setState não teria efeito a tempo dentro do mesmo ciclo de evento.
  const repetirRef = useRef(false);

  const tipo = templates.find((x) => x.id === templateId)?.name ?? "";
  const projeto = projects.find((p) => p.id === projectId);
  // Título sugerido: ninguém precisa inventar nome para o quinto story do dia.
  const tituloSugerido =
    tipo && projeto
      ? `${tipo} · ${projeto.client.name} · ${date.slice(8, 10)}/${date.slice(5, 7)}`
      : "";

  // A mensagem depende de qual botão foi clicado, então o toast sai aqui e não pelo
  // `successMessage` do hook — que é lido na renderização e não enxergaria a ref.
  const { run, isPending } = useServerAction(createQuickTask, {
    onSuccess: () => {
      if (repetirRef.current) {
        toast.success(t("savedKeepGoing"));
        // Limpa só o que é individual de cada registro; tipo, projeto, data, tempo e descrição
        // ficam, que é o ponto do "salvar e repetir".
        setTitle("");
        setLink("");
      } else {
        toast.success(t("saved"));
        router.push("/dashboard");
      }
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("title", title || tituloSugerido);
    run(fd);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <FieldLabel htmlFor="templateId" required>
          {t("type")}
        </FieldLabel>
        <select
          id="templateId"
          name="templateId"
          required
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="h-11 w-full rounded-md border border-input-border bg-input px-3 text-base text-foreground"
        >
          <option value="">{t("typePlaceholder")}</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel htmlFor="projectId" required>
          {t("project")}
        </FieldLabel>
        <select
          id="projectId"
          name="projectId"
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-11 w-full rounded-md border border-input-border bg-input px-3 text-base text-foreground"
        >
          <option value="">{t("projectPlaceholder")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.client.name} — {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="date" required>
            {t("date")}
          </FieldLabel>
          <Input
            id="date"
            name="date"
            type="date"
            required
            value={date}
            max={hoje}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="minutes" required>
            {t("minutes")}
          </FieldLabel>
          <Input
            id="minutes"
            name="minutes"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="title">{t("titleField")}</FieldLabel>
        <Input
          id="title"
          name="title"
          value={title}
          placeholder={tituloSugerido}
          onChange={(e) => setTitle(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("titleHint")}</p>
      </div>

      <div>
        <FieldLabel htmlFor="link">{t("link")}</FieldLabel>
        <Input
          id="link"
          name="link"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("linkHint")}</p>
      </div>

      <div>
        <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
        <Textarea
          id="description"
          name="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Os DOIS botões são `type="submit"` do MESMO form. O onClick só marca a intenção antes de
          o submit disparar — assim o `e.currentTarget` do onSubmit é sempre o form, e a validação
          nativa do navegador vale para os dois caminhos. */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="submit"
          disabled={isPending}
          onClick={() => (repetirRef.current = false)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("save")}
        </button>
        <button
          type="submit"
          disabled={isPending}
          onClick={() => (repetirRef.current = true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 font-semibold text-foreground disabled:opacity-50"
        >
          <Repeat className="h-4 w-4" />
          {t("saveAndRepeat")}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Conferir tipos, testes e build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npm run build`
Expected: tsc limpo, suíte verde, build compilando

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(protected)/tasks/quick" locales
git commit -m "feat(tarefa rápida): formulário de registro com salvar e repetir"
```

---

### Task 8: Atalho e documentação

**Files:**

- Modify: `app/[locale]/(protected)/dashboard/page.tsx`
- Modify: `locales/pt-BR/dashboard.json`, `locales/es-ES/dashboard.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/biblioteca-de-conhecimento.md`

**Interfaces:**

- Consumes: rota `/tasks/quick` (Task 7)
- Produces: nada

- [ ] **Step 1: Atalho no dashboard**

Em `locales/pt-BR/dashboard.json` adicionar `"quickTaskCta": "Registrar trabalho já feito"`; em
`locales/es-ES/dashboard.json`, `"quickTaskCta": "Registrar trabajo ya hecho"`.

Em `app/[locale]/(protected)/dashboard/page.tsx`, logo abaixo do cabeçalho da página, inserir:

```tsx
{
  /* O registro rápido só cumpre o objetivo se estiver a um toque de distância: a feature
          existe para vencer atrito, e escondê-la num menu recriaria o atrito. */
}
<Link
  href="/tasks/quick"
  className="mb-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
>
  <Zap className="h-4 w-4 text-primary" />
  {t("quickTaskCta")}
</Link>;
```

Importar `Link` de `next/link` e `Zap` de `lucide-react` se ainda não estiverem no arquivo.

- [ ] **Step 2: Entrada no CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### 🚀 Adicionado`, adicionar a seção:

```markdown
#### Tarefa rápida

- **Registro de trabalho de etapa única que já aconteceu** (`/tasks/quick`): data, tempo e link, do
  celular, sem abrir demanda. Existe para o trabalho que hoje **não é registrado** — o fluxo normal
  custa mais que a própria execução, e o resultado é resistência ao sistema.
- **A classe é o template:** só fluxos marcados como rápidos aparecem no formulário. Uma tarefa
  rápida nasce e morre no mesmo instante (lead time ≈ 0) e, misturada às demandas normais, puxaria o
  p50/p85 do tipo para baixo — os mesmos percentis que alimentam a checagem de viabilidade. Como a
  previsão já é por classe (P4), separar o template resolve.
- **Trava recíproca no editor de fluxo:** 2+ etapas desabilita a marca "rápido"; a marca ativa
  desabilita "adicionar etapa" — com o motivo escrito ao lado, não como erro depois do envio.
- **Corrigido:** era possível apagar a **última** etapa de um fluxo e deixá-lo com zero. A falha só
  aparecia depois, na criação de uma demanda, longe de quem apagou.
```

- [ ] **Step 3: Registrar a decisão na biblioteca**

Em `docs/biblioteca-de-conhecimento.md`, na seção `### Criação de tarefa (/admin/tasks/new)`,
acrescentar o item:

```markdown
- **Tarefa rápida é CLASSE separada, não exceção** → **P4**: registro de trabalho de etapa única
  que já aconteceu (story em loja de cliente, publicação avulsa) tem lead time ≈ 0 por construção.
  Na mesma distribuição das demandas normais, puxaria o p50/p85 do tipo para baixo — e são esses
  percentis que alimentam a checagem de viabilidade. Como a previsão é por classe, um template
  próprio marcado `quickEntry` resolve sem regra nova. Existe para o trabalho que hoje **não é
  registrado**: o fluxo normal custa mais que a execução, e o efeito é resistência ao sistema.
  _(P4/P1)_
```

- [ ] **Step 4: Verificação final**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npm run build`
Expected: tudo verde

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(protected)/dashboard/page.tsx" locales CHANGELOG.md docs/biblioteca-de-conhecimento.md
git commit -m "docs(tarefa rápida): atalho no dashboard, changelog e defesa na biblioteca"
```

---

## Fora deste plano

- Captura de foto do artefato fora da rede (problema em aberto na spec)
- Lançar por terceiro
- Editar tarefa rápida gravada — a saída é marcar obsoleta e lançar de novo
- Aplicar a migration em produção: decisão do usuário, feita fora do plano
