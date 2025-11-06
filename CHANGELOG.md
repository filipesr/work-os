# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

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
