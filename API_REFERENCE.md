# API Reference - Sistema de Workflow Paralelo

Este documento detalha as principais funções e tipos do sistema de workflow paralelo do Work OS.

## 📚 Índice

- [Tipos TypeScript](#tipos-typescript)
- [Funções Core](#funções-core)
- [Queries do Dashboard](#queries-do-dashboard)
- [Componentes UI](#componentes-ui)
- [Funções Auxiliares](#funções-auxiliares)
- [Funções Depreciadas](#funções-depreciadas)

---

## Tipos TypeScript

### ActiveStageStatus

```typescript
enum ActiveStageStatus {
  ACTIVE    = "ACTIVE",    // Pronta para trabalho
  BLOCKED   = "BLOCKED",   // Aguardando dependências
  COMPLETED = "COMPLETED"  // Trabalho finalizado
}
```

### TaskActiveStage (Prisma Model)

```typescript
type TaskActiveStage = {
  id: string;
  status: ActiveStageStatus;
  taskId: string;
  stageId: string;
  assigneeId: string | null;
  activatedAt: Date;
  completedAt: Date | null;

  // Relations
  task: Task;
  stage: TemplateStage;
  assignee: User | null;
}
```

### ActiveStageWithDetails

Tipo usado no dashboard para exibir etapas ativas:

```typescript
type ActiveStageWithDetails = {
  id: string;
  status: ActiveStageStatus;
  taskId: string;
  stageId: string;

  task: {
    id: string;
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: Date | null;
    project: {
      name: string;
      client: { name: string };
    };
  };

  stage: {
    id: string;
    name: string;
    order: number;
    defaultTeam: {
      id: string;
      name: string;
    } | null;
    template: {
      id: string;
      name: string;
    };
  };

  assignee?: {
    name: string | null;
    email: string | null;
  } | null;
}
```

---

## Funções Core

### completeStageAndAdvance()

Completa uma etapa ativa e executa fork/join automático.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function completeStageAndAdvance(
  taskId: string,
  stageId: string
): Promise<{
  success?: boolean;
  error?: string;
  completed?: TemplateStage;
  activated?: TemplateStage[];
  blocked?: TemplateStage[];
}>
```

**Parâmetros:**
- `taskId` - ID da tarefa
- `stageId` - ID da etapa a ser completada

**Retorno:**
- `success` - true se a operação foi bem-sucedida
- `error` - Mensagem de erro, se houver
- `completed` - Etapa que foi completada
- `activated` - Array de etapas que foram ativadas (FORK)
- `blocked` - Array de etapas que foram criadas como bloqueadas (JOIN pendente)

**Validações:**
- Etapa deve estar ACTIVE
- Usuário deve ser admin, manager ou assignee da etapa
- Usuário regular deve ter pelo menos 1 artefato OU comentário na tarefa
- Etapa deve existir e pertencer à tarefa

**Exemplo de Uso:**
```typescript
const result = await completeStageAndAdvance(
  "task-id-123",
  "stage-id-456"
);

if (result.error) {
  toast.error(result.error);
} else {
  toast.success(
    `Etapa ${result.completed?.name} completada! ` +
    `${result.activated?.length || 0} etapas ativadas.`
  );
}
```

**Fluxo Interno:**
1. Valida que etapa está ACTIVE
2. Verifica permissões do usuário
3. Valida contribuições (se necessário)
4. Fecha log da etapa atual
5. Chama `activateNextStages()` para fork/join
6. Atualiza status da Task se necessário
7. Revalida paths do Next.js

---

### activateNextStages()

Implementa a lógica fork/join para ativar próximas etapas.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function activateNextStages(
  taskId: string,
  completedStageId: string
): Promise<{
  activated: TemplateStage[];
  blocked: TemplateStage[];
}>
```

**Parâmetros:**
- `taskId` - ID da tarefa
- `completedStageId` - ID da etapa que foi completada

**Retorno:**
- `activated` - Etapas que foram ativadas (todas dependências satisfeitas)
- `blocked` - Etapas que foram bloqueadas (dependências pendentes)

**Lógica:**
1. Marca etapa completada como COMPLETED
2. Busca todas as etapas que dependem da etapa completada
3. Para cada etapa dependente:
   - Se já existe TaskActiveStage e está BLOCKED:
     - Verifica se todas as dependências estão completas
     - Se sim, muda para ACTIVE (JOIN)
   - Se não existe TaskActiveStage:
     - Verifica se todas as dependências estão completas
     - Se sim, cria como ACTIVE (FORK)
     - Se não, cria como BLOCKED
4. Retorna arrays de etapas ativadas e bloqueadas

**Não deve ser chamada diretamente** - use `completeStageAndAdvance()` ao invés.

---

### checkAllDependenciesComplete()

Verifica se todas as dependências de uma etapa foram completadas.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function checkAllDependenciesComplete(
  taskId: string,
  stageId: string
): Promise<boolean>
```

**Parâmetros:**
- `taskId` - ID da tarefa
- `stageId` - ID da etapa a verificar

**Retorno:**
- `true` se TODAS as dependências estão completas
- `false` se pelo menos uma dependência está incompleta

**Lógica:**
1. Busca todas as StageDependency da etapa
2. Para cada dependência:
   - Verifica se existe TaskActiveStage com status COMPLETED
3. Retorna true apenas se TODAS foram encontradas

**Implementa o AND lógico do pattern Join.**

---

### claimActiveStage()

Permite que um usuário reivindique uma etapa ativa.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function claimActiveStage(
  taskId: string,
  stageId: string
): Promise<{
  success?: boolean;
  error?: string;
}>
```

**Parâmetros:**
- `taskId` - ID da tarefa
- `stageId` - ID da etapa a reivindicar

**Validações:**
- Etapa deve estar ACTIVE (não pode pegar BLOCKED)
- Etapa não pode estar já atribuída
- Usuário deve pertencer ao team da etapa

**Exemplo de Uso:**
```typescript
const result = await claimActiveStage(taskId, stageId);

if (result.error) {
  setError(result.error);
} else {
  router.refresh();
  toast.success("Etapa atribuída a você!");
}
```

---

### unassignActiveStage()

Libera uma etapa atribuída, devolvendo-a ao backlog do time.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function unassignActiveStage(
  taskId: string,
  stageId: string
): Promise<{
  success?: boolean;
  error?: string;
}>
```

**Validações:**
- Usuário deve ser admin, manager OU o próprio assignee
- Etapa deve estar atribuída

**Exemplo de Uso:**
```typescript
const result = await unassignActiveStage(taskId, stageId);

if (result.error) {
  setError(result.error);
} else {
  router.refresh();
  toast.success("Etapa liberada!");
}
```

---

## Queries do Dashboard

### getMyActiveStages()

Retorna todas as etapas ativas atribuídas ao usuário atual.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function getMyActiveStages(): Promise<ActiveStageWithDetails[]>
```

**Retorno:** Array de etapas ativas com todos os detalhes necessários para display.

**Query SQL (simplificada):**
```sql
SELECT * FROM "TaskActiveStage"
WHERE "assigneeId" = $userId
  AND status = 'ACTIVE'
ORDER BY task.dueDate, task.priority
```

**Uso no Dashboard:**
```typescript
const myStages = await getMyActiveStages();

// Exibir na seção "Minhas Etapas Ativas"
myStages.map(stage => (
  <ActiveStageCard key={stage.id} stage={stage} />
))
```

---

### getTeamBacklog()

Retorna etapas ativas não atribuídas do time.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function getTeamBacklog(
  teamId: string
): Promise<ActiveStageWithDetails[]>
```

**Parâmetros:**
- `teamId` - ID do time

**Retorno:** Array de etapas disponíveis para o time.

**Query SQL (simplificada):**
```sql
SELECT * FROM "TaskActiveStage"
WHERE "assigneeId" IS NULL
  AND status = 'ACTIVE'
  AND stage."defaultTeamId" = $teamId
ORDER BY task.priority, task.dueDate
```

**Uso no Dashboard:**
```typescript
const backlog = await getTeamBacklog(currentUser.teamId);

// Exibir na seção "Backlog do Time"
backlog.map(stage => (
  <ActiveStageCard
    key={stage.id}
    stage={stage}
    showClaimButton
  />
))
```

---

### getTaskById()

Busca tarefa com todas as etapas ativas.

**Localização:** `lib/actions/task.ts`

**Assinatura:**
```typescript
async function getTaskById(taskId: string): Promise<TaskWithActiveStages | null>
```

**Retorno:**
```typescript
{
  ...task,
  activeStages: TaskActiveStage[],
  // Computed properties para backward compatibility:
  currentStage: TemplateStage | null,
  currentStageId: string | null,
}
```

**Computed Properties:**
- `currentStage` - Primeira etapa com status ACTIVE (ou null)
- `currentStageId` - ID da primeira etapa ACTIVE (ou null)

---

## Componentes UI

### AdvanceStageButton

Botão para completar etapa com preview de fork/join.

**Localização:** `components/tasks/AdvanceStageButton.tsx`

**Props:**
```typescript
interface AdvanceStageButtonProps {
  taskId: string;
  currentStageId: string;
}
```

**Features:**
- Modal de confirmação com preview
- Mostra etapas que serão ativadas (fork)
- Mostra etapas que ficarão bloqueadas (join)
- Validação de contribuições
- Toast com resumo após sucesso

**Uso:**
```tsx
<AdvanceStageButton
  taskId={task.id}
  currentStageId={activeStage.stageId}
/>
```

---

### ClaimActiveStageButton

Botão para pegar etapa do backlog.

**Localização:** `components/tasks/ClaimActiveStageButton.tsx`

**Props:**
```typescript
interface ClaimActiveStageButtonProps {
  taskId: string;
  stageId: string;
  isBlocked?: boolean;
}
```

**Features:**
- Desabilitado para etapas BLOCKED
- Validação automática de team
- Feedback visual durante atribuição

**Uso:**
```tsx
<ClaimActiveStageButton
  taskId={task.id}
  stageId={stage.stageId}
  isBlocked={stage.status === "BLOCKED"}
/>
```

---

### UnassignActiveStageButton

Botão para liberar etapa atribuída.

**Localização:** `components/tasks/UnassignActiveStageButton.tsx`

**Props:**
```typescript
interface UnassignActiveStageButtonProps {
  taskId: string;
  stageId: string;
  currentAssignee: string | null;
}
```

**Features:**
- Confirmação antes de liberar
- Valida permissões automaticamente
- Atualiza dashboard após sucesso

**Uso:**
```tsx
<UnassignActiveStageButton
  taskId={task.id}
  stageId={stage.stageId}
  currentAssignee={stage.assignee?.name}
/>
```

---

### StageWorkflowVisualization

Visualização do workflow com status das etapas.

**Localização:** `components/tasks/StageWorkflowVisualization.tsx`

**Props:**
```typescript
interface StageWorkflowVisualizationProps {
  currentStageId: string | null;
  allStages: (TemplateStage & {
    defaultTeam: { id: string; name: string } | null;
  })[];
  stageLogs: TaskStageLog[];
}
```

**Features:**
- Mostra todas as etapas do template
- Indica visualmente: COMPLETED, ACTIVE, PENDING
- Mostra tempo em cada etapa
- Timeline de progresso

**Uso:**
```tsx
<StageWorkflowVisualization
  currentStageId={task.currentStageId}
  allStages={allTemplateStages}
  stageLogs={task.stageLogs}
/>
```

---

## Funções Auxiliares

### getCurrentActiveStage()

Obtém a primeira etapa ativa de uma tarefa.

**Uso:**
```typescript
const currentActiveStage = task.activeStages.find(
  as => as.status === "ACTIVE"
);
```

### getDependenciesStatus()

Verifica status de todas as dependências de uma etapa.

**Implementação:**
```typescript
async function getDependenciesStatus(
  taskId: string,
  stageId: string
) {
  const dependencies = await prisma.stageDependency.findMany({
    where: { stageId },
    include: { dependsOn: true },
  });

  const statuses = await Promise.all(
    dependencies.map(async (dep) => {
      const taskActiveStage = await prisma.taskActiveStage.findUnique({
        where: {
          taskId_stageId: {
            taskId,
            stageId: dep.dependsOnStageId,
          },
        },
      });

      return {
        stage: dep.dependsOn,
        status: taskActiveStage?.status || "PENDING",
      };
    })
  );

  return statuses;
}
```

---

## Funções Depreciadas

As seguintes funções foram depreciadas na versão 2.0:

### ❌ advanceTaskStage()

**Depreciada:** Use `completeStageAndAdvance()` ao invés.

**Motivo:** Sistema anterior não suportava fork/join.

---

### ❌ getAvailableNextStages()

**Depreciada:** Lógica integrada em `completeStageAndAdvance()`.

**Motivo:** Preview agora acontece automaticamente.

---

### ❌ claimTask()

**Depreciada:** Use `claimActiveStage()` ao invés.

**Motivo:** Atribuição agora é por etapa, não por tarefa.

---

### ❌ assignTask()

**Depreciada:** Use `claimActiveStage()` ao invés.

**Motivo:** Sistema de atribuição foi refatorado para etapas.

---

### ❌ revertTaskStage()

**Depreciada:** Em revisão para nova implementação.

**Motivo:** Lógica de retrocesso precisa ser adaptada para sistema paralelo.

---

## Exemplos Práticos

### Criar Tarefa com Fork/Join

```typescript
// 1. Criar tarefa (cria primeira etapa como ACTIVE)
const task = await createTask({
  title: "Nova Feature",
  projectId: "project-123",
  templateId: "template-456",
});

// 2. Pegar primeira etapa
await claimActiveStage(task.id, firstStageId);

// 3. Adicionar contribuição
await addComment(task.id, "Trabalho iniciado");

// 4. Completar primeira etapa (FORK pode acontecer)
const result = await completeStageAndAdvance(task.id, firstStageId);

console.log(`Ativadas: ${result.activated?.length}`);
console.log(`Bloqueadas: ${result.blocked?.length}`);
```

### Listar Etapas de uma Tarefa

```typescript
const task = await getTaskById(taskId);

// Etapas ativas
const activeStages = task.activeStages.filter(
  s => s.status === "ACTIVE"
);

// Etapas bloqueadas
const blockedStages = task.activeStages.filter(
  s => s.status === "BLOCKED"
);

// Etapas completadas
const completedStages = task.activeStages.filter(
  s => s.status === "COMPLETED"
);
```

### Verificar se Pode Avançar

```typescript
async function canAdvanceStage(taskId: string, stageId: string) {
  const activeStage = await prisma.taskActiveStage.findUnique({
    where: { taskId_stageId: { taskId, stageId } },
  });

  if (!activeStage || activeStage.status !== "ACTIVE") {
    return { can: false, reason: "Etapa não está ativa" };
  }

  // Verificar contribuições
  const [artifactCount, commentCount] = await Promise.all([
    prisma.taskArtifact.count({ where: { taskId, userId: currentUserId } }),
    prisma.taskComment.count({ where: { taskId, userId: currentUserId } }),
  ]);

  if (artifactCount === 0 && commentCount === 0 && !isAdminOrManager) {
    return {
      can: false,
      reason: "Adicione pelo menos 1 artefato ou comentário",
    };
  }

  return { can: true };
}
```

---

## Performance e Otimização

### Índices Importantes

```sql
-- TaskActiveStage
CREATE INDEX idx_taskactivestage_task ON "TaskActiveStage"("taskId");
CREATE INDEX idx_taskactivestage_stage ON "TaskActiveStage"("stageId");
CREATE INDEX idx_taskactivestage_assignee ON "TaskActiveStage"("assigneeId");
CREATE INDEX idx_taskactivestage_status ON "TaskActiveStage"("status");
CREATE UNIQUE INDEX unique_task_stage ON "TaskActiveStage"("taskId", "stageId");
```

### Queries Otimizadas

Use `select` para reduzir payload:

```typescript
// ❌ Ruim - traz todos os campos
const stages = await prisma.taskActiveStage.findMany({
  where: { assigneeId: userId },
  include: { task: true, stage: true },
});

// ✅ Bom - traz apenas o necessário
const stages = await prisma.taskActiveStage.findMany({
  where: { assigneeId: userId },
  select: {
    id: true,
    status: true,
    task: {
      select: {
        id: true,
        title: true,
        priority: true,
      },
    },
    stage: {
      select: {
        id: true,
        name: true,
      },
    },
  },
});
```

---

## Troubleshooting

### Etapa não ativa após Join

**Problema:** Completei todas as dependências mas etapa continua BLOCKED.

**Debug:**
```typescript
// Verificar dependências
const deps = await prisma.stageDependency.findMany({
  where: { stageId: blockedStageId },
  include: { dependsOn: true },
});

// Verificar status de cada dependência
for (const dep of deps) {
  const status = await prisma.taskActiveStage.findUnique({
    where: {
      taskId_stageId: {
        taskId,
        stageId: dep.dependsOnStageId,
      },
    },
    select: { status: true },
  });

  console.log(`${dep.dependsOn.name}: ${status?.status || "NOT_FOUND"}`);
}
```

**Possíveis Causas:**
1. Dependência não está marcada como COMPLETED
2. TaskActiveStage não existe para alguma dependência
3. Configuração incorreta de StageDependency

---

**Versão:** 2.0.0
**Última Atualização:** 2024-11-06
