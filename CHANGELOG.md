# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não lançado]

### 🚀 Adicionado

#### Fluxo de trabalho

- **Etapa coringa (roteamento na criação):** uma etapa de template **sem time padrão** deixa de
  nascer órfã. `TaskActiveStage` ganhou `teamId` e `instructions` (ambos anuláveis, sem backfill):
  na criação da demanda o gestor escolhe o **time**, opcionalmente o **responsável** (validado
  contra os membros do time escolhido) e escreve **o que precisa ser feito**. A instrução aparece
  na fila do time, no modal de conclusão de etapa e no detalhe da demanda. Override numa etapa que
  já tem time no template é **ignorado** — quem manda no fluxo é o template.
- **Correção de demanda ainda não iniciada** (`/admin/tasks/[taskId]` → "Configuração das etapas"):
  enquanto a demanda é **virgem**, o gestor pode reconfigurar quais etapas opcionais entram, para
  qual time vai cada etapa coringa, quem responde e a instrução. Fecha o buraco em que uma etapa
  roteada errado — ou não roteada — ficava presa para sempre. Virgem = `Task.startedAt` nulo,
  nenhuma etapa com responsável e status `BACKLOG` (`lib/task-virgin.ts`); o carimbo write-once já
  existente é a âncora, em vez de um predicado novo de "teve interação". A janela fecha porque
  depois disso mudar o time de uma etapa **reescreveria medição** já produzida (throughput,
  on-time, flow efficiency por time), e não corrigiria erro de planejamento. Etapa **não-opcional
  entra sempre**: a correção não pode virar reescrita do fluxo. A lista de etapas é o mesmo
  componente do formulário de criação (`StageSetupRows`) — é a mesma decisão, tomada depois.
- **Duplicar carrega o desenho das etapas coringa:** `duplicateTask` já recriava as MESMAS etapas
  incluídas, mas perdia o time roteado e a instrução. Agora viajam junto. Duplicar é o caminho de
  conserto de uma demanda que travou (obsoleta → duplica → corrige), e redecidir cada coringa do
  zero para consertar uma transformaria o conserto em retrabalho. O **responsável** continua
  deliberadamente fora: é a ausência dele que faz a cópia nascer virgem e, portanto, corrigível.
- **Time efetivo como regra única** (`lib/stage-team.ts`): roteamento da tarefa, senão o time
  padrão do template. Aplicado em fila do time, etapas bloqueadas, cockpit de saúde, calendário,
  carga, "minhas etapas", filtros da lista de tarefas e relatórios (produtividade, desempenho,
  flow efficiency, CFD, retrabalho, lead time, throughput e on-time por time). Para as tabelas
  históricas — que guardam `(taskId, stageId)` mas não o roteamento — `routedStageTerms` agrupa por
  etapa, gerando um termo por etapa coringa em vez de um por demanda.

### 🐛 Corrigido

- **Preview de avanço divergia da execução:** `previewNextStages` olhava apenas as etapas que
  dependem **diretamente** da etapa concluída. Com uma **etapa opcional excluída no meio do fluxo**,
  ele anunciava a própria etapa excluída como "próxima" e escondia a que de fato abre. Passou a
  rodar o **mesmo motor** da ativação (`computeStageReadiness`) sobre o grafo inteiro do template —
  pré-requisito sem linha na tarefa conta como satisfeito, então quem libera a seguinte é a etapa
  **anterior** à opcional. O motor de ativação já se comportava assim; era o preview que mentia.
- **Reversão para etapa fora da tarefa:** `revertTaskStage` validava a ordem da etapa-alvo, mas não
  se ela **faz parte** da tarefa. Uma etapa opcional excluída na criação (ou de outro template)
  passava pela validação e falhava depois, no `update`, com erro genérico. Agora é recusada antes
  de qualquer escrita — sem `ReworkEvent` fantasma. Inalcançável pela UI (a lista de retorno só
  oferece etapas percorridas); é defesa de borda da server action.
- **Atribuição da próxima etapa em etapa coringa:** a validação do responsável usava só o
  `defaultTeam` (nulo numa coringa) e recusava qualquer atribuição, deixando a etapa
  permanentemente sem responsável. Agora valida contra o time efetivo.

### 📝 Notas de migração

- Migration `20260825120000_add_stage_team_override` — puramente aditiva (duas colunas anuláveis,
  FK `SET NULL` e índice). `teamId` nulo = herda o time padrão da etapa, que é o comportamento de
  todas as linhas existentes.
- Nenhuma mudança de schema além da migration acima. A correção de demanda virgem apaga linhas de
  etapa, transições e log das etapas removidas: a tarefa nunca as percorreu, então não há história
  a preservar — manter descreveria algo que não aconteceu.

## [2.3.0] - 2026-07-07

### 🚀 Adicionado

#### Fluxo de trabalho

- **Etapas opcionais por tarefa:** flag `optional` em `TemplateStage` (marcável no template,
  destacada em âmbar tracejado + legenda no card de fluxo). Na criação da demanda as etapas
  opcionais vêm **desmarcadas** e as normais marcadas mas desmarcáveis; etapas não incluídas
  **não geram linha** e somem de fluxo/seguimento/retorno/histórico. Motor reescrito
  (`computeStageReadiness`) com _pass-through_ por etapas excluídas.
- **Conclusão automática da tarefa:** ao encerrar a última etapa, `Task.status` vira `COMPLETED`
  (corrige a lacuna em que a tarefa ficava `IN_PROGRESS` com todas as etapas concluídas).
- **Status/% do projeto:** card de **% de conclusão** no detalhe do projeto e filtro
  **Pendentes/Concluídos** na lista de projetos do cliente (`computeProjectCompletion`).
- **Tarefa OBSOLETE + Duplicar:** novo status `OBSOLETE` (sai de pendentes e do %) e ação
  **Duplicar** (copia metadados + recria etapas frescas, sem comentários/artefatos), no
  `TaskLifecycleActions` do `/admin/tasks/{id}`.

#### Artefatos

- **Artefatos com escopo** `TASK`/`PROJECT`/`CLIENT` (um só modelo com `scope` + FKs nuláveis).
  **Tabela única** com chip **Origem** nas 4 telas (tarefa, admin-tarefa, projeto, cliente);
  descrição do projeto em destaque no card da tarefa.
- **Versionamento de artefatos:** cadeia `rootId`/`version`/`isCurrent`. Ação **"Nova versão"**
  (herda título/tipo, só a URL muda; só no próprio escopo); card mostra **Criado/Atualizado** +
  selo `v{N}` + expander **"ver versões"** com o responsável de cada versão.

### 🛠️ Modificado

- **Fluxo NAS simplificado:** pastas `institucional` por escopo
  (`{cliente}/institucional`, `{cliente}/{projeto|tarefa ~id}/institucional`); nome com `AAAA_MM`
  da data do envio. `prepareArtifactUpload`/`buildNasPath` por escopo, RBAC por escopo,
  **sem gate `nasUploadEnabled` nem metadados de campanha** — só exige `Client.folderName`.
  Upload NAS habilitado também em projeto/cliente.
- **Robustez/desempenho:** `getSessionUser`/`getCurrentUser` em `React cache()` (dedup da
  sessão por request); `AbortSignal.timeout` no proxy de imagem e no heartbeat; cache local do
  histórico de versões no painel.
- **N+1 eliminados** em `activateNextStages` e `completeStageAndAdvance` (batch de linhas/times).

### 🗑️ Removido

- Card **"Armazenamento no NAS"** (metadados de campanha + toggle) do detalhe do projeto.
- Campos mortos pós-simplificação NAS: `Project.campaignSlug/Year/Month`, `nasUploadEnabled`,
  `nasMetadataReviewed*`; `TaskArtifact.target` (+ enum `ArtifactTarget`); `TemplateStage.defaultMediaType`.
  Componentes aposentados: `ScopedArtifactsManager`, `ProjectArtifactsTable`, `AddArtifactForm`.

### ✅ Testes

- Novos testes: seleção/prontidão de etapas, `computeProjectCompletion`, auto-conclusão,
  artefatos com escopo + versionamento, ciclo de vida da tarefa, `buildNasPath` por escopo,
  unificação de linhas de artefato. Suíte em **237** testes, verde.

## [2.2.0] - 2026-06-29

### 🚀 Adicionado

#### Produto

- **SLA por etapa:** novo campo `expectedDurationHours` em `TemplateStage` (editável
  nos forms de criação/edição de etapa). O relatório de produtividade por equipe passa
  a sinalizar etapas **No prazo/Acima** do SLA com base na duração média real.
- **Drag-and-drop no calendário:** barras de tarefa no Gantt semanal podem ser
  arrastadas para outro dia, reagendando `dueDate` (ação `rescheduleTask`, via `@dnd-kit/core`).
- **Exportação CSV/PDF** em relatórios (produtividade, performance, produtividade por
  equipe) — geração no cliente com `papaparse` e `jspdf`/`jspdf-autotable`.
- **Relatório individual por colaborador** (`/reports/user/[userId]`): horas totais,
  horas por etapa, etapas concluídas e % no prazo; seletor de colaborador no índice de relatórios.

### 🔒 Isolamento entre projetos + frescor de dados (ambiente dev)

- **Porta dedicada:** `pnpm dev` agora roda em **`localhost:3100`** (era 3000). Vários
  projetos na mesma origem `localhost:3000` compartilhavam cookies, `localStorage` e
  **Service Workers** — um SW de outro projeto (PWA) chegava a "sequestrar" a porta e
  servir o app errado. Origem própria por projeto elimina a colisão.
- **Cookies/armazenamento namespaced:** cookie de sessão `workos.session-token`
  (`auth.config.ts` + `middleware.ts`), cookie de idioma `workos.NEXT_LOCALE` (next-intl)
  e chave `workos:preferred-locale` no `localStorage`. Assim o app ignora estado deixado
  por outros projetos mesmo na mesma origem. **Troca o cookie de sessão → desloga 1 vez.**
- **Limpeza de Service Worker:** `ServiceWorkerCleanup` (layout raiz) desregistra qualquer
  SW e apaga o Cache Storage da origem ao carregar (o app não usa SW).
- **Navegação sempre fresca:** `experimental.staleTimes: { dynamic: 0, static: 0 }` (página
  e layout/menu refazem fetch ao navegar) + `RefreshOnFocus` (revalida ao voltar o foco/aba
  e em restauração de bfcache via `pageshow`). Resolve "tarefas excluídas/menu desatualizado
  até dar hard refresh".

### 🛠️ Modificado / Qualidade

- **Segurança (CSP):** `Content-Security-Policy` agora é gerada por requisição no
  middleware com **nonce** + `strict-dynamic` (sem `unsafe-inline` em scripts).
- **Tempo real:** páginas TV e live-activity migradas de polling para **SSE**
  (`/api/tv/stream`, `/api/live-activity/stream`) com fallback automático a polling.
- **Performance:** corrigido N+1 de `getTranslations()` por linha no dashboard e N+1 de
  leitura em `previewNextStages` (bulk-fetch + predicado `areAllPrerequisitesComplete`
  compartilhado com `activateNextStages`).
- **Hardening:** validação Zod em todas as funções de `reporting.ts`; metadata/título em
  8 páginas (`account`, `reports`, `admin/*`); `dynamic = "force-dynamic"` explícito nas rotas protegidas.
- **i18n:** mensagens de erro de `createTasksBatch` e toasts de `AdvanceStageButton`
  movidos para os catálogos (`errors`, `toasts`).
- **Cloudinary removido** por completo (pacote, envs obrigatórias, hosts e `addFileArtifact` morto).
- **Testes:** novos testes de componente para `KanbanBoard` e `TaskDetailView` (Vitest).

## [2.1.0] - 2026-06-26

### 🚀 Adicionado

#### Pré-criação de etapas + atribuição de responsável

- **Pré-criação:** ao criar uma demanda, **todas** as etapas já nascem como
  `TaskActiveStage` — a de menor ordem como `ACTIVE`, as demais com o novo status
  `INACTIVE`. A criação de etapas passou a existir num único lugar (`createTaskStages`).
- **Atribuição de responsável por etapa** usando o `assigneeId` já existente, validado
  no servidor contra a equipe (`defaultTeam`) da etapa:
  - **Na criação:** card de pré-visualização com seletor de responsável por etapa.
  - **Na conclusão:** modal de avanço permite atribuir as próximas etapas (e
    pré-preenche quem já foi definido na criação).
- **Tela `/admin/tasks/{id}`:** seção "Todas as etapas" (status + responsável de cada
  etapa) e card "Tempos Registrados" (lançamentos + atividades **em andamento**).
- **Relatório `/reports/productivity`:** filtros de **mês** (select dos meses com
  registro, padrão mês atual), **equipe**, **cliente** e **projeto**; cards de Projeto/
  Cliente ocultados quando o respectivo filtro está ativo.
- **Relatório `/reports/performance`:** mesmos filtros de produtividade (mês + equipe +
  cliente + projeto), com idêntico padrão de UX.
- **Tela `/admin/projects/{id}`:** card "Artefatos" com o total ao lado de "Concluída" e
  **tabela de artefatos pesquisável** (título/link, tipo, tarefa, autor, data).
- Documentação: plano em `docs/superpowers/plans/2026-06-26-stage-precreation-and-assignment.md`
  e auditoria em `docs/nextjs-best-practices-audit.md`.

### 🛠️ Modificado

- `activateNextStages` deixou de **criar** etapas e passou a **transicionar**
  (`INACTIVE`→`ACTIVE`/`BLOCKED`) preservando o `assigneeId`.
- Reversão de etapa reseta as etapas posteriores para `INACTIVE`.
- Coluna "Projeto" da lista de etapas e do backlog da equipe virou **"Cliente/Projeto"**.
- Streaming (Suspense) por widget nos relatórios de produtividade e performance.

### 🐛 Corrigido

- Link "voltar" da tarefa retorna ao **projeto** (`/admin/projects/{id}`).
- Avatares de comentários/artefatos/tempos passam pelo proxy de imagem (corrige imagem
  quebrada de fotos do Google).
- Status da demanda nos modais do dia do calendário mensal agora é **traduzido** (antes
  mostrava o enum cru, ex.: `IN_PROGRESS`).
- Type-safety: removidos os `any` das Server Actions; validação Zod em stage/template/
  dependency; correção do módulo `"use server"` (helpers síncronos movidos para fora).

## [2.0.0] - 2024-11-06

### 🚀 Adicionado (Breaking Changes)

#### Sistema de Workflow Paralelo (Fork/Join)

- **TaskActiveStage Model:** Novo modelo many-to-many entre Task e TemplateStage
  - Status: ACTIVE, BLOCKED, COMPLETED
  - Suporta múltiplas etapas ativas simultaneamente
  - Atribuição (assigneeId) por etapa individual

- **Fork Pattern:** Ativação automática de múltiplas etapas dependentes
  - Função `activateNextStages(taskId, completedStageId)`
  - Quando uma etapa é completada, todas as etapas dependentes ativam simultaneamente

- **Join Pattern:** Sincronização automática de dependências
  - Função `checkAllDependenciesComplete(taskId, stageId)`
  - Etapas aguardam TODAS as dependências antes de ativar
  - Status BLOCKED para etapas aguardando dependências

- **Atribuição por Etapa:**
  - `claimActiveStage(taskId, stageId)` - Pegar etapa específica
  - `unassignActiveStage(taskId, stageId)` - Liberar etapa específica
  - Validação automática de team do usuário

- **Dashboard Refatorado:**
  - Uma entrada por etapa ativa (não por tarefa)
  - `getMyActiveStages()` - Buscar etapas atribuídas ao usuário
  - `getTeamBacklog(teamId)` - Buscar etapas não atribuídas do time
  - Filtros avançados (por time, por assignee, por prioridade)

- **Novos Componentes UI:**
  - `ClaimActiveStageButton` - Pegar etapa
  - `UnassignActiveStageButton` - Liberar etapa
  - `AdvanceStageButton` (refatorado) - Preview de fork/join
  - `StageWorkflowVisualization` - Visualização de progresso

- **ActiveStageStatus Enum:** ACTIVE, BLOCKED, COMPLETED

### 🔄 Modificado

- **Task Model:**
  - Removido: `currentStageId` (breaking)
  - Adicionado: `activeStages` (relação com TaskActiveStage)
  - Computed properties para backward compatibility: `currentStage`, `currentStageId`

- **TemplateStage Model:**
  - Adicionado: `activeTasks` (relação com TaskActiveStage)

- **User Model:**
  - Adicionado: `assignedActiveStages` (relação com TaskActiveStage)

- **completeStageAndAdvance():** Refatorado para usar fork/join
  - Valida contribuições (artefatos/comentários)
  - Valida permissões (admin/manager/assignee)
  - Retorna preview de etapas ativadas e bloqueadas

- **createTask():** Atualizado para criar TaskActiveStage inicial
  - Remove atribuição de currentStageId
  - Cria primeira etapa como ACTIVE no TaskActiveStage

- **Queries do Dashboard:**
  - Refatoradas para usar TaskActiveStage ao invés de Task
  - Stats agora contam etapas ativas, não tarefas

- **KanbanBoard:** Atualizado para carregar activeStages
  - Computed properties para backward compatibility

- **TaskDetailView:** Atualizado para mostrar múltiplas etapas ativas
  - Props atualizadas para incluir activeStages

### ⚠️ Depreciado

As seguintes funções foram depreciadas e retornam mensagens de erro:

- `advanceTaskStage()` → Use `completeStageAndAdvance()`
- `getAvailableNextStages()` → Lógica integrada em `completeStageAndAdvance()`
- `claimTask()` → Use `claimActiveStage()`
- `assignTask()` → Use `claimActiveStage()`
- `revertTaskStage()` → Em revisão para nova implementação

### 🗑️ Removido (Breaking Changes)

- **currentStageId field:** Removido do modelo Task
- **currentStage relation:** Removida do modelo Task (agora é computed property)

### 🔒 Segurança

- Validação de team adicionada em `claimActiveStage()`
- Verificação de permissões aprimorada em `completeStageAndAdvance()`
- Validação de contribuições antes de avançar etapa

### 📊 Performance

- Índices otimizados em TaskActiveStage:
  - `@@index([taskId])`
  - `@@index([stageId])`
  - `@@index([assigneeId])`
  - `@@index([status])`
  - `@@unique([taskId, stageId])`

- Queries otimizadas com select seletivo
- Uso de transações para operações críticas

### 📖 Documentação

- Adicionado: `PARALLEL_WORKFLOW.md` - Documentação completa do sistema
- Atualizado: `README.md` - Novo sistema destacado
- Atualizado: `task-flow.md` - Fluxo de trabalho paralelo
- Adicionado: Este `CHANGELOG.md`

### 🔧 Migração

⚠️ **ATENÇÃO: Breaking Changes - Requer reset do banco de dados**

```bash
# 1. Backup (se necessário)
pg_dump $DATABASE_URL > backup_v1.sql

# 2. Reset do banco
npx prisma migrate reset --force

# 3. Gerar Prisma Client
npx prisma generate

# 4. Build
npm run build

# 5. Seed (opcional)
npx prisma db seed
```

### 🧪 Testes Recomendados

Após a migração, teste os seguintes cenários:

1. **Fork Simples:**
   - Criar tarefa com workflow A → (B, C)
   - Completar A
   - Verificar que B e C estão ambos ACTIVE

2. **Join Simples:**
   - Criar tarefa com workflow (A, B) → C
   - Completar A
   - Verificar que C está BLOCKED
   - Completar B
   - Verificar que C mudou para ACTIVE

3. **Atribuição:**
   - Pegar etapa do próprio time
   - Tentar pegar etapa de outro time (deve falhar)
   - Liberar etapa atribuída

4. **Dashboard:**
   - Verificar que aparecem múltiplas entradas para tarefa com múltiplas etapas ativas
   - Verificar filtros (My Tasks, By Team, By Assignee, By Priority)

## [1.0.0] - 2024-10-XX

### Adicionado

- Setup inicial do Next.js 15 com App Router
- Schema Prisma completo com todos os modelos
- NextAuth.js configurado com Google Provider
- Sistema de autenticação e autorização (RBAC)
- Modelos de User, Team, Client, Project, Task
- WorkflowTemplate e TemplateStage
- StageDependency para dependências entre etapas
- TimeLog e TaskStageLog para relatórios
- TaskComment e TaskArtifact para colaboração
- Dashboard básico
- Kanban board
- Visualização de tarefas
- Activity tracking (start/stop)
- Time logging manual
- Comentários e artefatos

---

## Tipos de Mudanças

- **Adicionado** - para novas funcionalidades
- **Modificado** - para mudanças em funcionalidades existentes
- **Depreciado** - para funcionalidades que serão removidas
- **Removido** - para funcionalidades removidas
- **Corrigido** - para correção de bugs
- **Segurança** - para correções de vulnerabilidades
