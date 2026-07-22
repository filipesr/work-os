# Visão de pessoas — 3a: painel auto-referenciado + lentes de carga — Design

**Fatia 3a de 3** do subsistema "Visão de pessoas" (subsistema 3 do tema
"Previsibilidade e qualidade em trabalho criativo"). A 3b (qualidade por pessoa +
reclassificação de retrabalho) terá spec próprio; subsistemas 1 e 2 já entregues.

**Fundamentação:** [biblioteca-de-conhecimento.md](../../biblioteca-de-conhecimento.md)
— **P1** (informacional, nunca motivacional — Austin), **P2** (variação é do sistema,
não da pessoa — Deming), **P7** (capacidade ≠ horas fungíveis; throughput/utilização
como guarda).

## Objetivo

Dar a cada colaborador uma visão **auto-referenciada** da própria carga/entrega ao
longo do tempo ("estou entregando mais/menos que meu passado?") e ao gestor uma
visão de **carga/capacidade** por pessoa para coaching/staffing. Tudo
auto-referenciado (a pessoa vs. o próprio passado), **nunca comparativo**.

## Princípios inegociáveis (bind este design)

- **Auto-referenciado, nunca comparativo (P1/P2):** nada ordena/rankeia pessoas.
  Cada pessoa é vista isolada, contra o próprio histórico.
- **Acesso restrito:** só o gestor/admin (em `/admin/users/[userId]`, já sob o
  layout admin `requireManagerOrAdmin`) e a própria pessoa (em `/dashboard`, escopo
  `session.user.id`). Sem visibilidade entre pares.
- **Sem qualidade nesta fatia:** nenhuma métrica de qualidade/FTR/retrabalho por
  pessoa aqui (isso é 3b, com salvaguardas próprias). 3a é carga/capacidade só.
- **Informacional (P1):** nada bloqueia; utilização é faixa **indicativa** (P7),
  não alarme; sem score composto, sem pay-link.

## Escopo 3a

Incluído:

1. Dados por pessoa: throughput por semana; utilização; carga (WIP + envelhecendo).
2. `/admin/users/[userId]` (gestor): cards de throughput + utilização; contador de
   envelhecendo junto da carga já exibida.
3. `/dashboard` "Meu foco" (privado): widget "Minha evolução" (throughput semanal +
   utilização + WIP, só da própria pessoa).

Explicitamente FORA (3b ou depois / nunca):

- Qualidade/FTR por pessoa + reclassificação de retrabalho → **3b**.
- Cycle time por pessoa → deferido (confundido por espera; throughput é mais limpo).
- Comparar/ordenar/rankear pessoas por qualquer lente → **nunca** (P1/P2).

---

## Arquitetura

Sem migração (3a não muda schema). Reusa dados existentes:

- Throughput: `TaskActiveStage` (assigneeId, status COMPLETED, completedAt).
- Utilização: a lógica já existente em `getHoursByUser` (`lib/actions/reporting.ts`),
  que computa `utilization = totalHours ÷ (weeklyCapacityHours × periodWeeks)` quando
  há capacidade + janela; `ProductivityFilters` já aceita `userId`.
- Carga/envelhecendo: `stageAgingRatio` (`lib/team-health-format.ts`) +
  `DEFAULT_SLA_HOURS`/`AGING_ALERT_RATIO` (`lib/actions/team-health.ts`).

### Componente 1 — Dados por pessoa

`lib/actions/person-metrics.ts` (server-only; NÃO "use server" — exporta funções
chamadas por Server Components; se precisar ser chamado do client, marcar
individualmente. Aqui os consumidores são Server Components, então módulo
server-only sem a diretiva, seguindo o padrão de `team-health.ts`).

```ts
export interface ThroughputPoint {
  weekStart: string;
  count: number;
} // ISO week start

/** Conclusões da pessoa por semana (últimas `weeks`), auto-referenciado.
 * Conta TaskActiveStage COMPLETED com assigneeId = userId, bucketizado por
 * completedAt. Requer que o CALLER autorize o acesso (ver nota de RBAC). */
export async function getPersonThroughputSeries(
  userId: string,
  weeks?: number // default 8
): Promise<ThroughputPoint[]>;

export interface PersonWorkload {
  wip: number; // etapas ACTIVE atribuídas
  aging: number; // dessas, quantas passaram do SLA (stageAgingRatio >= AGING_ALERT_RATIO)
}
export async function getPersonWorkload(userId: string): Promise<PersonWorkload>;
```

Utilização: **reusar** `getHoursByUser({ userId, startDate, endDate })` e pegar a
linha única (`utilization`, `weeklyCapacityHours`, `totalHours`). Não duplicar a
fórmula.

**RBAC (nota importante):** essas funções recebem `userId` e devem ser
**fail-closed** — só retornam se o chamador é (a) ADMIN/MANAGER, ou (b) o próprio
`userId` (`session.user.id`). Espelhar o padrão fail-closed de `member-drill.ts`
(`getMemberActiveStages` verifica que o alvo está no escopo do chamador). Como 3a
serve tanto a página admin (manager/admin) quanto o dashboard (self), a checagem é:
`requireSelfOrManager(userId)` — retorna ok se `session.user.id === userId` OU
`requireManagerOrAdmin()` passa. Implementar esse guard (em `lib/permissions.ts`
ou local) e chamá-lo no topo de cada função.

### Componente 2 — `/admin/users/[userId]` (gestor)

`app/[locale]/(protected)/admin/users/[userId]/page.tsx` — agregar ao perfil:

- **Card "Throughput (últimas 8 semanas)"**: mini-gráfico de barras/linha (SVG
  server-side, no padrão de `components/reports/FlowCharts.tsx`). Extrair um
  componente reutilizável `components/people/ThroughputSparkline.tsx` (server, puro
  presentacional) já pensando na 3b/Meu foco.
- **Card "Utilização"**: `%` + capacidade (ou "sem meta definida" quando
  `weeklyCapacityHours` nulo), faixa indicativa (>90% vermelho, 60–90% verde, <60%
  âmbar — igual ao relatório de produtividade).
- **Carga**: a página já mostra `activeStages.length`; acrescentar o contador de
  **envelhecendo** (de `getPersonWorkload`).

A página é Server Component sob o layout admin (manager/admin) — o guard já cobre;
as novas funções recebem o `userId` da rota.

### Componente 3 — `/dashboard` "Meu foco" (privado)

Novo widget `components/dashboard/MyGrowthWidget.tsx` (Server Component; recebe o
`userId` do dashboard = `session.user.id`):

- **Minha evolução**: throughput semanal (meu, sparkline) + minha utilização (mês
  atual) + meu WIP. Rótulo deixando claro que é auto-referenciado ("vs. seu próprio
  histórico", não comparado com colegas).
  Renderizado em `app/[locale]/(protected)/dashboard/page.tsx` junto dos widgets
  existentes (`StatsCards`, `MyActiveStagesWidget`), passando `userId`.

---

## i18n

Namespaces: `dashboard` (widget Meu foco) e `admin.users` (cards no perfil).
Chaves: títulos, "sem meta definida", "envelhecendo", "vs. seu histórico",
faixa/legendas. pt-BR + es-ES em paridade (guard); es-ES real.

## Testes

Puros/lógica (mock Prisma):

- `getPersonThroughputSeries` — bucketização semanal correta; conta só COMPLETED do
  próprio assignee; janela.
- `getPersonWorkload` — WIP + contagem de envelhecendo (via stageAgingRatio no limiar).
- `requireSelfOrManager` — permite self; permite manager/admin; nega outro membro
  (fail-closed).
- Reuso de `getHoursByUser` (já testado) — não reimplementar utilização.

Presentacional (`ThroughputSparkline`): render smoke opcional; a lógica de dados é
testada nas funções.

## Verificação

`tsc --noEmit` 0 · `vitest` (novos + regressão) · `next build` limpo · paridade
i18n · **sem migração**. Sem mudança de comportamento existente (tudo aditivo).

## Pendências / próximos

- **3b:** qualidade por pessoa (FTR defeito-only) + `reworkClass` (DEFECT/LEGITIMATE)
  - reclassificação pelo gestor + lista de retornos com motivos — spec próprio, com
    o registro de exceção a P2 na biblioteca.
- Cycle time por pessoa (auto-referenciado) → possível refinamento futuro.
- `ThroughputSparkline` fica reutilizável para a 3b/Meu foco.
