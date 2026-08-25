# Material de origem — Páginas de Help

Documentação do funcionamento real do Work OS, coletada do código para servir de base
às páginas de ajuda (`/help`). Toda a terminologia abaixo é a que o produto usa de fato
(extraída dos arquivos `locales/pt-BR/*.json`), para que o Help ensine com as mesmas palavras.

Estrutura de aprendizado em 3 guias, na ordem natural de uso:

1. **Template / Fluxo de Trabalho** — a "receita" do processo
2. **Cliente → Projeto → Demanda** — a hierarquia onde o trabalho mora
3. **Demandas para o colaborador** — o dia a dia da execução

---

## Modelo de dados (resumo)

```
WorkflowTemplate 1──N TemplateStage ──N StageDependency (define pré-requisitos / fork-join)
TemplateStage N──1 Team (time padrão da etapa)

Client 1──N Project 1──N Task (Demanda)
Project.status: ACTIVE | INACTIVE   (INACTIVE = não recebe novas demandas)
Task 1──N TaskActiveStage (etapas ativas; many-to-many Task↔Stage → habilita paralelismo)
TaskActiveStage.status: ACTIVE | BLOCKED | COMPLETED
Task.status: BACKLOG | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED
Task.priority: LOW | MEDIUM | HIGH | URGENT
```

Arquivo: `prisma/schema.prisma`.

---

## Guia 1 — Template / Fluxo de Trabalho

**Rota:** `/admin/templates` (lista + criar) e `/admin/templates/[templateId]` (editor). Admin apenas.
**i18n:** `template.json` (namespaces `admin.workflows`, `template.header/detail/createStage/stagesList/dependencies/visualization`).

### Fluxo de criação

1. **Criar template** (`/admin/templates`, card "Criar Novo Template"):
   - `Nome do Template *` (ex: "Vídeo Curto, Landing Page")
   - `Descrição` (opcional)
   - Botão `Criar Template` → redireciona ao editor.
2. **Adicionar etapas** (editor, "Etapas do Fluxo de Trabalho" → `+ Adicionar Nova Etapa`):
   - `Nome da Etapa *` (ex: "Roteiro")
   - `Ordem *` (sequência: 1, 2, 3…)
   - `Time Padrão` (auto-atribui o time quando a tarefa chega na etapa) — default "Sem time padrão".
     **Deixar em branco é uma decisão de desenho**, não configuração faltando: a etapa vira
     **coringa** e o roteamento (time + responsável + instrução) passa a ser feito na criação da
     demanda. Ver Guia 2.
   - `Opcional` (checkbox): a etapa nasce **desmarcada** no formulário de criação. Etapa não
     incluída não gera linha — e **não bloqueia a seguinte**: quem libera é a etapa ANTERIOR à
     opcional, mesmo que a dependência esteja declarada sobre a opcional (pré-requisito sem linha
     na tarefa conta como satisfeito, `computeStageReadiness`).
3. **Definir dependências** (dentro do form, `DependencySelector`): "Depende das Etapas (opcional)" — grid de
   botões clicáveis (badge de ordem + nome + check). Aviso: "Esta etapa só ficará disponível após todas as
   etapas selecionadas serem concluídas". Sem dependência → inicia imediatamente.
4. **Gerenciar etapas** (`StagesList`): cada etapa vira um card com badge de ordem, "Time: …", "Depende de: …",
   botões `Editar` / `Excluir`.
5. **Visualizar fluxo** (`WorkflowVisualization`): diagrama vertical agrupado por nível de dependência.
   Etapas no mesmo nível = "Execução Paralela (N etapas)" com separador "ou"; setas ↓ indicam direção.

### Componentes (para replicar layout)

`components/admin/`: `CreateStageForm.tsx`, `StagesList.tsx`, `DependencySelector.tsx`,
`TemplateHeader.tsx`, `WorkflowVisualization.tsx`. Server actions: `lib/actions/template.ts`, `lib/actions/stage.ts`.

---

## Guia 2 — Cliente → Projeto → Demanda

**Rotas:** `/admin/clients` (+ `/admin/clients/[clientId]`), `/admin/tasks/new` (sob `[locale]/(protected)/admin/`).
A tela de lista de projetos (`/admin/projects`) foi **removida** — a gestão de projetos vive no detalhe do cliente. O detalhe de um projeto continua em `/admin/projects/[projectId]`.
**i18n:** `admin.json` (`admin.clients`, `admin.clients.detail`, `admin.tasks.new`), `tasks.json` (`tasks.create`, `tasks.priority`), `quickCreate.json`.

### Cliente (`/admin/clients`)

Form inline: `Nome do cliente *` → `Criar`. Detalhe permite Descrição, Email, Telefone.
Quick-create (`QuickCreateClient`): Nome\*, Email, Telefone, Descrição.

### Projeto (no detalhe do cliente — `/admin/clients/[clientId]`)

Form `Adicionar projeto` (`Nome` → `Criar`, cliente implícito). Cada projeto tem `status` (`ProjectStatus: ACTIVE | INACTIVE`) com botão Ativar/Desativar.
Projetos **INACTIVE** não aparecem na criação de demandas (`getProjectsForSelect` filtra `status: ACTIVE`).
Quick-create (`QuickCreateProject` / botão "Novo Projeto" por cliente no modal de criação em lote): Cliente*, Nome*. Pode ser criado direto do form de tarefa ou do calendário de eventos.

### Demanda / Tarefa (`/admin/tasks/new`, componente `CreateTaskForm`)

Campos:

1. `Título da Tarefa *` (ex: "Criar vídeo demo do produto")
2. `Descrição`
3. `Projeto *` (formato "Cliente - Projeto"; botão "Novo Projeto" inline)
4. `Template de Fluxo de Trabalho *` (formato "Nome (N etapas)") → mostra **Pré-visualização das Etapas**,
   com uma linha por etapa: checkbox de inclusão (só nas opcionais), selo `Coringa`/`Entrada` e o
   seletor de responsável. Nas etapas **coringa** (template sem time padrão) a linha ganha ainda:
   - `Time` (`team:<stageId>`) — para qual fila a etapa vai. Sem isso ela não aparece para ninguém.
   - `Responsável` (`assignee:<stageId>`) — habilitado só depois de escolher o time; a lista são os
     membros do time escolhido, e trocar de time limpa a escolha anterior.
   - `O que precisa ser feito` (`instructions:<stageId>`) — direcionamento de quem pegar a etapa.
     Persistido em `TaskActiveStage.instructions`; exibido na fila do time, no modal de conclusão
     de etapa e no detalhe da demanda.
5. `Prioridade *` (Baixa/Média/Alta/Urgente, default Média)
6. `Data de Vencimento`
   Botões: `Criar Tarefa` / `Cancelar`.

Bloco "Como funciona:" (i18n `admin.tasks.new.howItWorks`):

- Selecione um projeto e um template de workflow
- O template define as etapas pelas quais a tarefa passará
- A tarefa é criada automaticamente com base nas etapas do template
- Você será atribuído à primeira etapa automaticamente
- A tarefa avança pelas etapas conforme o trabalho progride

**Ao criar:** Task nasce `status: BACKLOG`; a 1ª etapa **incluída** vira um `TaskActiveStage` com
`status: ACTIVE`; registra `TaskStageLog`. Redireciona para `/admin/tasks/{taskId}`. Se a etapa de
entrada já nascer com responsável, a tarefa vai direto para `IN_PROGRESS` (o fluxo de "reivindicar",
que faz essa promoção, não roda quando a etapa já tem dono).

**Time efetivo de uma etapa:** `TaskActiveStage.teamId ?? stage.defaultTeamId` — regra única em
`lib/stage-team.ts` (`effectiveStageTeam`, `stageTeamWhere`, `routedStageTerms`), usada por fila,
cockpit, calendário e relatórios. Exceção deliberada: o **teto de WIP** continua escopado pelo time
padrão, porque é propriedade da coluna no fluxo, não da demanda.

**Limitação atual:** o roteamento da etapa coringa só é definido na criação — não há tela para
redirecionar depois.

### Componentes

`components/tasks/CreateTaskForm.tsx`, `components/quick-create/QuickCreate{Client,Project}.tsx`.
Server actions: `lib/actions/{client,project,task}.ts`.

---

## Guia 3 — Demandas para o colaborador

**Rotas:** `/dashboard` (visão geral) e `/tasks` ("Minhas Tarefas" detalhado); detalhe em `/tasks/[taskId]`.
**i18n:** `dashboard.json`, `myStages.json`, `tasks.json`.

### Onde o colaborador vê o trabalho

- **Dashboard** → duas seções:
  - **"Minhas Etapas Ativas"**: tabela (Tarefa | Projeto | Etapa Atual | Prioridade | Status | Data de Entrega | Ação).
  - **"Backlog da Equipe (Não Atribuído)"**: etapas ACTIVE sem dono, com botão `Pegar Etapa`.
- **`/tasks`**: versão completa com filtros (Minhas/Todas, ACTIVE/BLOCKED/COMPLETED, datas) e KPIs
  (Total, Ativas, Bloqueadas, Concluídas, Atrasadas, Horas Registradas).

### Ciclo de vida de uma etapa (botões reais)

1. **Pegar Etapa** (`ClaimActiveStageButton` → `claimActiveStage`): assume a etapa; Task vira `IN_PROGRESS`; loga.
   Etapa BLOCKED não é clicável (mostra "Bloqueado").
2. **Contribuição obrigatória**: antes de concluir, o colaborador (não-admin/manager) precisa de ≥1 artefato ou
   comentário. `AddArtifactForm` (Nome, URL, Tipo: DOCUMENT/IMAGE/VIDEO/FIGMA/OTHER) ou `AddCommentForm`.
3. **Concluir Etapa** (`AdvanceStageButton` → `completeStageAndAdvance`): marca etapa COMPLETED e dispara
   `activateNextStages` (fork/join). Modal "O que acontecerá" + preview de etapas ativadas/bloqueadas.
4. **Liberar Etapa** (`UnassignActiveStageButton` → `unassignActiveStage`): devolve a etapa ao backlog do time.
5. **Reverter Etapa** (`RevertStageButton` → `revertTaskStage`): manda a tarefa de volta a uma etapa anterior;
   **comentário obrigatório**; histórico logado.

### Fork / Join (paralelismo)

- **Fork**: ao concluir uma etapa, todas as dependentes cujas dependências estão COMPLETED viram `ACTIVE`;
  as que ainda têm dependência pendente nascem `BLOCKED` (🔒).
- **Join**: etapa que depende de várias só ativa quando **todas** as predecessoras estão COMPLETED.
- Lógica: `activateNextStages` / `checkAllDependenciesComplete` em `lib/actions/task.ts`.

### Status e cores (para replicar badges)

- Etapa: `ACTIVE` (azul, clicável) · `BLOCKED` (cinza/🔒) · `COMPLETED` (verde).
- Prioridade: URGENTE (vermelho), ALTA (laranja), MÉDIA (amarelo), BAIXA (verde).
- Indicadores: 🔥 atrasada, ⚠️ prazo < 48h, 🆕 "NOVO" (< 24h), 🔒 bloqueada.

### Componentes

`components/dashboard/ActiveStagesWidget.tsx`, `components/my-stages/MyStagesPageClient.tsx`,
`components/tasks/{ClaimActiveStage,AdvanceStage,Revert Stage,UnassignActiveStage,AddArtifact,AddComment}*.tsx`,
`components/tasks/TaskActionsMenu.tsx`. Server actions: `lib/actions/task.ts`.

---

## Notas para a construção do Help

- Padrão de layout protegido: `app/[locale]/(protected)/layout.tsx` (Navbar + `<main className="px-4 sm:px-6 lg:px-8 py-8">`).
- i18n registra namespaces em `lib/i18n.ts` (`getMessages`). Novo namespace `help` deve ser adicionado lá.
- "Replicar layout das páginas reais": usar os mesmos estilos (cards `rounded-lg border-2`, badges de status com as
  cores acima, tabelas) como **mockups estáticos** dentro do Help — depois substituir/complementar por prints reais.
