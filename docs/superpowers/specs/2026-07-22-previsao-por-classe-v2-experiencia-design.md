# Previsão por classe v2 — experiência como largura de banda — Design

**v2 do subsistema 1** ("Previsão por classe", já entregue). Adiciona a experiência
do executor como **largura da banda** de previsão — o último item do tema
"previsibilidade & qualidade em trabalho criativo".

**Fundamentação:** [biblioteca-de-conhecimento.md](../../biblioteca-de-conhecimento.md)
— **P4** (Flyvbjerg/Kahneman: a habilidade demonstrada do executor ajusta a
largura do intervalo — banda mais estreita só com evidência de ser melhor; mais
larga se pior — **nunca vira nota individual**); **P1** (informacional); **P2**
(nunca comparativo).

## Objetivo

Na criação da tarefa, se o **responsável da etapa de entrada** tem pouco histórico
**naquele tipo de trabalho**, a checagem de viabilidade (v1) passa a usar um
percentil mais **conservador** (p95 em vez de p85) + uma nota. A experiência entra
como **largura de banda**, jamais como nota de pessoa, ranking ou comparação.

## Princípios inegociáveis (bind este design)

- **Experiência = largura de banda, nunca nota (P4):** o sinal só torna a previsão
  mais conservadora; nunca é exibido como pontuação da pessoa nem comparado.
- **Informacional (P1):** não bloqueia; ajusta um número de previsão + nota.
- **Nunca comparativo (P2):** olha a experiência de UMA pessoa em UM tipo, para a
  previsão daquela tarefa; nada ordena/rankeia; nada é armazenado.
- **Aproximação honesta:** "entrada" = etapa de menor ordem no preview; se ela for
  opcional-desmarcada a entrada real muda — registrado, não bloqueia.

## Escopo v2

Incluído:

1. `StageAssigneeSelect`: `onChange` opcional no modo NÃO-controlado (mantém `name`).
2. `getAssigneeTypeExperience(userId, templateId)` — experiência da pessoa no tipo.
3. `CreateTaskForm`: observar o responsável da entrada → banda p95 quando novo + nota.

Explicitamente FORA / nunca:

- Nota/score de pessoa, ranking, comparação, armazenamento da experiência → **nunca**.
- Experiência por etapa não-entrada → fora (só a entrada, aproximação).
- Migração/schema → nenhum.

---

## Arquitetura

### Componente 1 — `StageAssigneeSelect`: onChange no modo não-controlado

`components/ui/StageAssigneeSelect.tsx` hoje: `isControlled = value !== undefined
&& onChange !== undefined` → controlado usa `value`+`onChange` e **omite `name`**;
não-controlado usa `name` e não notifica. Ajuste retrocompatível:

- Passar a chamar `onChange?.(e.target.value)` **sempre** (se `onChange` existir),
  e manter `name` sempre que NÃO estiver em modo controlado (ou seja: só omite
  `name` quando `value` E `onChange` ambos presentes = controlado de fato).
- Resultado: `onChange` sem `value` → **não-controlado + observável** (mantém
  submit via `name`). Nenhum consumidor atual quebra (quem passa ambos continua
  controlado; quem passa nenhum continua uncontrolled silencioso).

### Componente 2 — `getAssigneeTypeExperience`

`lib/actions/reporting.ts` (`"use server"`) ou `lib/actions/person-metrics.ts`?
→ é chamado do CLIENT (form) e é sobre "quantas etapas do tipo a pessoa concluiu";
não é métrica de pessoa exibível. Colocar em **`lib/actions/task.ts`** (já tem
actions do fluxo de criação e `"use server"`) ou um módulo próprio `"use server"`.
Decisão: novo `lib/actions/assignee-experience.ts` (`"use server"`), coeso.

```ts
export const EXPERIENCE_THRESHOLD = 3; // < isso = "novo neste tipo"

export interface AssigneeTypeExperience {
  completed: number; // etapas COMPLETED da pessoa naquele template
  experienced: boolean; // completed >= EXPERIENCE_THRESHOLD
}

/** Experiência da pessoa NAQUELE tipo (template): nº de etapas concluídas.
 * Insumo de LARGURA DE BANDA de previsão — nunca nota/ranking. Gate member+. */
export async function getAssigneeTypeExperience(
  userId: string,
  templateId: string
): Promise<AssigneeTypeExperience> {
  await requireMemberOrHigher();
  if (!userId || !templateId) return { completed: 0, experienced: false };
  const completed = await prisma.taskActiveStage.count({
    where: { assigneeId: userId, status: "COMPLETED", stage: { templateId } },
  });
  return { completed, experienced: completed >= EXPERIENCE_THRESHOLD };
}
```

### Componente 3 — `CreateTaskForm`: banda por experiência da entrada

`components/tasks/CreateTaskForm.tsx` (client, já tem a viabilidade v1):

- Estado `entryAssigneeId: string` e `entryExperienced: boolean | null`.
- **Entrada** = `stagePreview[0]` (menor ordem). No `StageAssigneeSelect` DESSA
  etapa, passar `onChange={(v) => setEntryAssigneeId(v)}` (as demais ficam como
  estão). Ao criar/trocar template, resetar `entryAssigneeId`.
- Efeito: quando `entryAssigneeId` e `selectedTemplateId` presentes, chamar
  `getAssigneeTypeExperience(entryAssigneeId, selectedTemplateId)` e guardar
  `entryExperienced`.
- **Banda efetiva:** helper puro em `lib/forecast-feasibility.ts`:
  ```ts
  /** Dias do percentil "confiável" segundo a experiência: experiente → p85;
   * novo/desconhecido → p95 (banda mais larga). */
  export function confidentDays(p85: number, p95: number, experienced: boolean): number {
    return experienced ? p85 : p95;
  }
  ```
  Na viabilidade, usar `const band = confidentDays(forecast.p85, forecast.p95, entryExperienced ?? true)` — default `true` (p85) quando não há responsável selecionado (comportamento v1). Passar `band` como o 3º arg de `assessFeasibility` e a `idealStartOffsetDays(band)`.
- **Nota:** quando `entryAssigneeId` presente e `entryExperienced === false`, exibir
  abaixo do veredito: `t("create.feasibility.newToTypeNote")` ("Responsável novo
  neste tipo → previsão mais conservadora (p95)."). Enquadra **confiança da
  previsão**, não julgamento da pessoa.

---

## i18n

Namespace `tasks` → `create.feasibility.newToTypeNote` (pt-BR + es-ES, paridade, es real).

## Testes

- `getAssigneeTypeExperience` (mock prisma): count no/abaixo/acima do limiar → `experienced`; userId/templateId vazio → false.
- `confidentDays` (puro): experiente → p85; novo → p95.
- `StageAssigneeSelect`: uncontrolled + onChange mantém `name` E dispara onChange (render smoke / prop check).

## Verificação

`tsc --noEmit` 0 · `vitest` (novos + regressão — consumidores atuais do select) ·
`next build` limpo · paridade i18n · **sem migração**.

## Pendências / próximos

- Nenhuma migração. Encerra o tema "previsibilidade & qualidade em trabalho criativo"
  (subsistemas 1+v2, 2, 3a, 3b).
- Refinamento futuro possível: entrada real (respeitando opcional-desmarcada) em vez
  de `stagePreview[0]`.
