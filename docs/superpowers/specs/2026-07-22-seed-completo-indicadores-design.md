# Seed completo de indicadores — Design

Refina o gerador de dados de teste (`prisma/demo-seed.ts` + `prisma/demo-cleanup.ts`)
para **popular todos os indicadores** do app — fluxo, qualidade/retrabalho, pessoas,
gargalos, previsão por classe — que hoje aparecem vazios porque o seed foi escrito
(25/jun) antes de todas as features de fluxo/qualidade/pessoas desta sessão e da
anterior.

**Motivação concreta:** o banco tem 36 usuários reais mas ~2 tarefas reais e **zero**
`stageTransition`/`reworkEvent`/`oneOnOneLog`, nenhum `blockedAt`, nenhum
`weeklyCapacityHours`, nenhum `wipLimit`, e as tasks do seed nem setam
`workflowTemplateId`. Resultado: cockpit admin, `/reports/performance`, dashboards
por pessoa e a banda de previsão renderizam vazios.

**Fundamentação:** [biblioteca-de-conhecimento.md](../../biblioteca-de-conhecimento.md).
O seed deve produzir **variação realista de causa-comum** (P2/Deming), não caricaturas:
distribuições suaves de cycle-time (percentis/Monte Carlo fazem sentido — P3), uma
fração pequena de retrabalho com classe majoritariamente DEFECT mas alguns LEGITIMATE
(P5), gargalo concentrado numa etapa (ToC/P6), carga desigual mas plausível (P7). Os
dados existem para **exercitar** os indicadores, não para contar uma história
motivacional.

## Objetivo

Rodar `npm run demo:cleanup && npm run demo:seed` e ter **todos** os indicadores do
app populados e coerentes, com histórico rico por-pessoa para alguns usuários demo
**e** para os 2 usuários reais Filipe e Leli (para o dashboard pessoal "Minha
evolução" acender ao logar). Tudo namespaced e reversível.

## Princípios inegociáveis (bind este design)

- **Namespaced e reversível:** todo dado demo é identificável (`@demo.workos.fake`,
  `[DEMO] `) e removível pelo cleanup. Dados reais nunca são apagados; campos setados
  em entidades reais (Filipe/Leli `weeklyCapacityHours`, templates `wipLimit`) são
  **explicitamente resetados** pelo cleanup.
- **Coerência temporal:** timestamps encadeados e consistentes — `createdAt` ≤ etapas
  ≤ `completedAt`; `StageTransition.at` monotônico por (task,stage); `ReworkEvent.at`
  dentro da vida da task; `blockedAt` só em etapas BLOCKED atuais.
- **Variação de causa-comum (P2):** distribuições suaves, sem outliers artificiais
  além dos necessários para 1 gargalo e alguns sinais de sobrecarga.
- **Determinismo suficiente:** o script usa `Math.random` (como hoje); não exigimos
  seed fixo, mas as contagens-alvo são verificáveis por faixas.

## Escopo

Incluído:

1. **Enxugar escala:** ~18 usuários demo em times-chave (Copywriting, Design/…,
   Software Engineer, Video-makers, Manager, Supervisor) + 3 clientes `[DEMO]` com
   projetos. (Hoje ~54 usuários — reduzir para poluir menos o app live mantendo
   volume estatístico.)
2. **Fix `workflowTemplateId`** nas tasks demo (destrava previsão por classe/banda).
3. **`StageTransition`** — cadeia de status por etapa (eficiência de fluxo).
4. **`ReworkEvent`** — retrabalho interno/cliente, DEFECT/LEGITIMATE, com
   `sourceAssigneeId` (FTR agregado, por etapa-origem e por pessoa).
5. **Etapas em andamento ACTIVE/BLOCKED** com `blockedAt` e aging por SLA
   (gargalos, restrição do sistema, filas de aging e de bloqueados).
6. **`wipLimit`** nas etapas dos templates reais + WIP atual perto/acima do limite.
7. **`weeklyCapacityHours`** nos usuários demo e em Filipe/Leli + `TimeLog` suficiente
   (utilização).
8. **`OneOnOneLog`** para parte dos usuários (recentes) deixando outros em atraso.
9. **Histórico rico para Filipe e Leli (reais):** atribuídos a etapas de tasks demo
   (conclusões, retrabalho como `sourceAssignee`, time logs) → métricas por-pessoa
   deles acendem; removidas em cascata ao deletar as tasks demo.
10. **Cleanup estendido:** remover `oneOnOneLog` dos usuários demo (cascata cobre via
    user delete, mas explicitar por robustez); resetar `weeklyCapacityHours` de
    Filipe/Leli; resetar `wipLimit` dos templates reais. (`stageTransition`,
    `reworkEvent`, `timeLog` caem em cascata ao deletar as tasks demo.)
11. **Preparação:** remover as 10 tasks ad-hoc `SEED forecast — LP` (substituídas
    pelas tasks demo com `workflowTemplateId`).

Explicitamente FORA:

- Migração/schema — **nenhuma** (todos os modelos já existem).
- Mudança de qualquer código de produção (actions/componentes) — só os 2 scripts + a
  doc.
- Determinismo com seed fixo / snapshot testing do dataset.
- Popular indicadores de outras áreas não citadas (ex.: portal do cliente) além do
  que já cai fora naturalmente.

## Arquitetura

### Escala & namespace

`TEAM_USERS` reduzido para ~18 no total, concentrando nos times que aparecem nos
templates reais. Emails `slugN@demo.workos.fake`. 3 clientes `[DEMO] <nome>` com 1–2
projetos cada. Mantém o mapeamento etapa→time já existente (`stageUserMap`) para que
os assignees das etapas sejam do time certo.

### Modelos & campos gerados

Para cada task demo (por template, por projeto), gerar uma de três "trajetórias":

**(A) Concluída (~55%)** — alimenta cycle-time/throughput/CFD/previsão/FTR:

- `task`: `status=COMPLETED`, `workflowTemplateId=template.id`, `createdAt` espalhado
  nas últimas ~12 semanas, `completedAt = createdAt + cycle`, onde `cycle` é sorteado
  de uma distribuição por template (ex.: log-normalish via soma de uniformes) para dar
  p50/p85/p95 distintos.
- Por etapa (em ordem): `taskActiveStage` `status=COMPLETED` com `assigneeId` (do time
  da etapa), `activatedAt`/`completedAt` encadeados; `taskStageLog` como hoje.
- **`StageTransition`** por etapa: `{status:ACTIVE, at:activatedAt}`, opcionalmente
  `{status:BLOCKED, at:...}` + `{status:ACTIVE, at:...}` (em ~30% das etapas, para dar
  eficiência de fluxo < 100%), e `{status:COMPLETED, at:completedAt}`. O tempo ACTIVE
  soma vs. BLOCKED define a eficiência.
- `TimeLog` em ~60% das etapas concluídas (horas por usuário/etapa/dia) — já existe;
  garantir que Filipe/Leli e os usuários "ricos" tenham cobertura suficiente.

**(B) Em andamento (~35%)** — alimenta carga/gargalos/WIP/aging/bloqueados:

- `task`: `status=IN_PROGRESS`, `completedAt=null`, `workflowTemplateId` setado.
- Etapas anteriores COMPLETED (com transitions), **uma etapa atual** `ACTIVE` **ou**
  `BLOCKED`:
  - ACTIVE: `activatedAt` recuado o suficiente para alguns passarem do SLA
    (`expectedDurationHours`) → aging.
  - BLOCKED: `status=BLOCKED`, `blockedAt` setado, + `StageTransition{status:BLOCKED}`
    → fila de bloqueados e sinal de gargalo.
- Concentrar o excesso de WIP/aging numa **única etapa** (ex.: "Design" ou "Quality
  Control") para a restrição do sistema (ToC) ficar evidente.

**(C) Backlog (~10%)** — massa de fila: `status=BACKLOG`, sem etapas ativas.

**Retrabalho (`ReworkEvent`)** — em ~20% das tasks (A e B), 1 evento:

- `kind`: ~70% INTERNAL, ~30% CLIENT.
- `reworkClass`: ~70% DEFECT, ~20% LEGITIMATE, ~10% `null` (não-classificado).
- `sourceStageId` = uma etapa "de qualidade" plausível; `byUserId` = um manager/
  supervisor demo (ou Leli); `sourceAssigneeId` = o assignee daquela etapa (inclui
  Filipe/Leli quando forem os executores) → FTR por pessoa.
- `reason` textual em pt-BR realista.
- `at` dentro da vida da task.

**WIP (`wipLimit`)** — setar `wipLimit` nas etapas dos templates reais (ex.: 3–5
conforme o time), e dimensionar a trajetória (B) para que **uma** etapa fique **no/acima**
do limite (medidor de WIP vermelho) e as demais abaixo.

**Capacidade & utilização** — `weeklyCapacityHours` em todos os usuários demo (ex.:
30–40h) e em Filipe/Leli; `TimeLog` calibrado para que alguns fiquem ~sub-utilizados,
a maioria saudável e 1–2 acima de 100% (sinal de sobrecarga/burnout, sem caricatura).

**1:1 (`OneOnOneLog`)** — para ~60% dos usuários demo, 1–3 registros com `occurredAt`
recente (manager = um manager demo); os outros ~40% **sem** registro → aparecem como
"em atraso" no card de cadência. Incluir Filipe/Leli como subjects de alguns.

### Usuários reais ricos (Filipe, Leli)

IDs conhecidos: Filipe `cmhncybt50000vof8qwmwdzxu`, Leli `cmqsgdglf0000l704aii77zkr`
(resolver por email em runtime, não hardcode: `movimento.jant@gmail.com`,
`leligoonmkt@gmail.com`). Eles entram no pool de assignees das etapas de tasks demo
(concluídas e em andamento), recebem `weeklyCapacityHours`, `TimeLog`, aparecem como
`sourceAssignee` em alguns `ReworkEvent`, e como subject de `OneOnOneLog`. Como todo o
histórico deles está **preso a tasks demo**, o cleanup remove tudo ao deletar as tasks
demo — exceto `weeklyCapacityHours` (campo no User real), que o cleanup reseta a `null`.

### Cleanup estendido (`demo-cleanup.ts`)

Ordem atual preservada. Adicionar:

- Antes de deletar tasks demo: nada extra necessário para `stageTransition`/
  `reworkEvent`/`timeLog` (cascata em `Task`), mas deletar `oneOnOneLog` de usuários
  demo explicitamente (subject **ou** manager demo) antes de deletar os usuários.
- Após remover dados demo: **resetar** `weeklyCapacityHours=null` para Filipe/Leli
  (por email) e **resetar** `wipLimit=null` em todas as `TemplateStage` (ou só as que
  o seed tocou — resetar todas é seguro e idempotente).
- Log de cada passo, como hoje.

## Coerência dos dados (invariantes)

- Para cada (task,stage): `StageTransition` ordenados por `at`, começando em ACTIVE e
  (se COMPLETED) terminando em COMPLETED; BLOCKED sempre seguido de ACTIVE antes de
  COMPLETED. Soma ACTIVE + BLOCKED ≈ `completedAt − activatedAt`.
- `ReworkEvent.at` ∈ [task.createdAt, task.completedAt ?? now].
- Etapa atual BLOCKED ⇒ `blockedAt != null` e existe transition BLOCKED recente.
- Aging: `activatedAt` de etapas ACTIVE em andamento recuado além de
  `expectedDurationHours` em uma fração.
- Utilização: horas do `TimeLog` na janela ÷ `weeklyCapacityHours` cai numa faixa
  plausível (0.4–1.2), com poucos > 1.0.

## Verificação

1. `npx tsc --noEmit` (os scripts compilam sob `prisma/tsconfig.seed.json`).
2. Rodar `npm run demo:cleanup && npm run demo:seed` contra o banco; script imprime
   contagens por modelo.
3. Query de sanidade (script): contagens > 0 e coerentes para `stageTransition`,
   `reworkEvent`, `oneOnOneLog`, etapas BLOCKED, usuários com `weeklyCapacityHours`,
   `wipLimit` setado, tasks com `workflowTemplateId`, e ≥ `MIN_CLASS_SAMPLES` (8)
   concluídas por template.
4. Dirigir o app (sessão forjada, Playwright canal chrome) e **screenshotar
   populados**: cockpit `/admin` (carga/aging/bloqueados/restrição/1:1), `/reports/
performance` (percentis/Monte Carlo/CFD/eficiência de fluxo/FTR/retrabalho),
   perfil de um usuário demo rico e de Filipe (qualidade + throughput + utilização), e
   a **banda p95** na criação.
5. Rodar `npm run demo:cleanup` e confirmar: 0 dados demo, `weeklyCapacityHours` de
   Filipe/Leli de volta a `null`, `wipLimit` de volta a `null`, e os 36 usuários reais
   - 2 clientes reais intactos.
6. `npx vitest run` continua verde (nenhum código de produção mudou).

## Pendências / próximos

- Nenhuma migração. Não altera código de produção.
- Possível futuro: seed determinístico (seed fixo de RNG) para screenshots
  reproduzíveis; parametrizar densidade por env var.
- Se a poluição do app live incomodar, rodar cleanup ao fim da avaliação.
