# Sistema de Workflow Paralelo (Fork/Join)

## Visão Geral

O Work OS implementa um sistema avançado de workflow paralelo que permite que múltiplas etapas sejam executadas simultaneamente (fork) e se sincronizem quando necessário (join). Esta arquitetura elimina gargalos lineares e otimiza o fluxo de trabalho para equipes distribuídas.

## Arquitetura do Sistema

### Modelo de Dados: TaskActiveStage

Diferente de sistemas tradicionais onde uma tarefa tem apenas **uma etapa atual**, nosso sistema usa um modelo **many-to-many** entre Tasks e Stages através da tabela `TaskActiveStage`.

```prisma
enum ActiveStageStatus {
  ACTIVE    // Pronta para trabalho - todas as dependências foram atendidas
  BLOCKED   // Criada mas aguardando dependências serem completadas
  COMPLETED // Trabalho finalizado nesta etapa
}

model TaskActiveStage {
  id     String            @id @default(cuid())
  status ActiveStageStatus @default(ACTIVE)

  taskId String
  task   Task   @relation(fields: [taskId], references: [id])

  stageId String
  stage   TemplateStage @relation(fields: [stageId], references: [id])

  assigneeId String?
  assignee   User?   @relation(fields: [assigneeId], references: [id])

  activatedAt DateTime  @default(now())
  completedAt DateTime?

  @@unique([taskId, stageId])
}
```

### Vantagens desta Arquitetura

**1. Múltiplas Etapas Simultâneas**
- Uma tarefa pode ter várias etapas ACTIVE ao mesmo tempo
- Exemplo: Front-end e Back-end podem ser desenvolvidos simultaneamente

**2. Atribuição por Etapa**
- Cada etapa ativa pode ter seu próprio `assigneeId`
- Front-end pode ser atribuído para João enquanto Back-end é atribuído para Maria

**3. Visibilidade por Etapa**
- O dashboard mostra **uma entrada por etapa ativa**, não por tarefa
- Se uma tarefa tem 3 etapas ativas, aparecem 3 cards no dashboard

**4. Bloqueio Inteligente**
- Etapas com dependências incompletas são criadas como BLOCKED
- Assim que todas as dependências são completadas, o status muda para ACTIVE automaticamente

## Padrão Fork/Join

### Fork (Divisão)

Quando uma etapa é completada e possui **múltiplas etapas dependentes**, o sistema automaticamente ativa todas elas simultaneamente.

**Exemplo:**

```
Design (COMPLETED)
  ├─> Front-end (ACTIVE)
  └─> Back-end (ACTIVE)
```

**O que acontece:**
1. Designer clica em "Concluir Etapa" no Design
2. Sistema executa `completeStageAndAdvance(taskId, designStageId)`
3. Função `activateNextStages()` encontra Front-end e Back-end como dependentes
4. Ambas as etapas são criadas como ACTIVE simultaneamente
5. Front-end aparece no dashboard do time de Front
6. Back-end aparece no dashboard do time de Back

### Join (Sincronização)

Quando uma etapa depende de **múltiplas etapas anteriores**, ela só é ativada quando TODAS as dependências forem completadas.

**Exemplo:**

```
Front-end (ACTIVE) ─┐
                    ├─> Testes (BLOCKED → aguardando)
Back-end (ACTIVE) ──┘
```

**O que acontece:**

1. **Front-end completo primeiro:**
   - Developer 1 clica em "Concluir Etapa" no Front-end
   - Sistema vê que Testes depende de Front-end E Back-end
   - Front-end marcado como COMPLETED
   - Testes é criado como BLOCKED (aguardando Back-end)

2. **Back-end completo depois:**
   - Developer 2 clica em "Concluir Etapa" no Back-end
   - Sistema vê que Testes estava BLOCKED aguardando Back-end
   - Back-end marcado como COMPLETED
   - Testes automaticamente muda de BLOCKED para ACTIVE
   - Testes agora aparece no dashboard do time de QA

## Funções Principais

### completeStageAndAdvance(taskId, stageId)

Função principal para completar uma etapa e ativar as próximas.

```typescript
export async function completeStageAndAdvance(taskId: string, stageId: string) {
  // 1. Valida que a etapa está ACTIVE
  // 2. Verifica permissões (admin/manager/assignee)
  // 3. Valida contribuições (artefatos/comentários)
  // 4. Marca etapa atual como COMPLETED
  // 5. Chama activateNextStages() para fork/join automático
  // 6. Retorna { success, completed, activated, blocked }
}
```

**Retorno:**
```typescript
{
  success: true,
  completed: { id: "...", name: "Design" },
  activated: [
    { id: "...", name: "Front-end" },
    { id: "...", name: "Back-end" }
  ],
  blocked: [
    { id: "...", name: "Testes" }
  ]
}
```

### activateNextStages(taskId, completedStageId)

Implementa a lógica core do fork/join.

```typescript
export async function activateNextStages(taskId: string, completedStageId: string) {
  // 1. Marca a etapa completada como COMPLETED
  // 2. Encontra todas as etapas que dependem da etapa completada
  // 3. Para cada etapa dependente:
  //    - Verifica se JÁ existe um TaskActiveStage
  //    - Se BLOCKED, verifica se todas as dependências foram completadas
  //    - Se sim, muda para ACTIVE (JOIN)
  //    - Se não existe:
  //      - Verifica se TODAS as dependências foram completadas
  //      - Se sim, cria como ACTIVE (FORK)
  //      - Se não, cria como BLOCKED
  // 4. Retorna arrays de etapas ativadas e bloqueadas
}
```

### checkAllDependenciesComplete(taskId, stageId)

Valida se todas as dependências de uma etapa foram completadas.

```typescript
export async function checkAllDependenciesComplete(taskId: string, stageId: string): Promise<boolean> {
  // 1. Busca todas as dependências da etapa
  // 2. Para cada dependência:
  //    - Verifica se existe TaskActiveStage com status COMPLETED
  // 3. Retorna true apenas se TODAS as dependências estiverem completas
}
```

Esta é a função que implementa o **AND lógico** do pattern Join.

## Atribuição por Etapa

### claimActiveStage(taskId, stageId)

Permite que um usuário "pegue" uma etapa específica para trabalhar.

```typescript
export async function claimActiveStage(taskId: string, stageId: string) {
  // 1. Valida que a etapa está ACTIVE
  // 2. Verifica que usuário pertence ao time correto
  // 3. Verifica que etapa não está já atribuída
  // 4. Atribui assigneeId ao TaskActiveStage
  // 5. Atualiza status da Task para IN_PROGRESS se necessário
}
```

**Validações:**
- Etapa deve estar ACTIVE (não pode pegar etapas BLOCKED)
- Usuário deve pertencer ao time da etapa
- Etapa não pode estar já atribuída a outro usuário

### unassignActiveStage(taskId, stageId)

Libera uma etapa atribuída, devolvendo-a ao backlog do time.

```typescript
export async function unassignActiveStage(taskId: string, stageId: string) {
  // 1. Valida permissões (admin/manager ou próprio assignee)
  // 2. Remove assigneeId do TaskActiveStage
  // 3. Etapa volta para o backlog do time
}
```

## Dashboard e Visualização

### Modelo Antigo vs Novo

**Antigo (Linear):**
```
Task: "Landing Page"
  Status: IN_PROGRESS
  Current Stage: "Design"
  Assignee: João

Dashboard mostra: 1 card para João
```

**Novo (Paralelo):**
```
Task: "Landing Page"
  Active Stages:
    - Front-end (ACTIVE) → assignee: João
    - Back-end (ACTIVE) → assignee: Maria
    - Testes (BLOCKED) → aguardando Front-end e Back-end

Dashboard mostra:
  - 1 card de Front-end para João
  - 1 card de Back-end para Maria
  - 1 card de Testes (bloqueado) no backlog do time de QA
```

### Queries do Dashboard

#### getMyActiveStages()

Retorna todas as etapas ACTIVE atribuídas ao usuário atual.

```typescript
const myActiveStages = await prisma.taskActiveStage.findMany({
  where: {
    assigneeId: currentUserId,
    status: "ACTIVE",
  },
  include: {
    task: { include: { project: true } },
    stage: { include: { template: true, defaultTeam: true } },
  },
});
```

#### getTeamBacklog(teamId)

Retorna todas as etapas ACTIVE não atribuídas do time.

```typescript
const teamBacklog = await prisma.taskActiveStage.findMany({
  where: {
    assigneeId: null,
    status: "ACTIVE",
    stage: { defaultTeamId: teamId },
  },
  include: {
    task: { include: { project: true } },
    stage: { include: { template: true, defaultTeam: true } },
  },
});
```

## Componentes UI

### AdvanceStageButton

Botão para completar uma etapa e visualizar preview das próximas.

**Features:**
- Mostra preview das etapas que serão ativadas (fork)
- Mostra preview das etapas que ficarão bloqueadas (join)
- Validações automáticas (contribuições, permissões)
- Toast com resumo após conclusão

**Uso:**
```tsx
<AdvanceStageButton
  taskId={task.id}
  currentStageId={activeStage.stageId}
/>
```

### ClaimActiveStageButton

Botão para "pegar" uma etapa específica.

**Features:**
- Valida time do usuário automaticamente
- Desabilitado para etapas BLOCKED
- Feedback visual durante atribuição

**Uso:**
```tsx
<ClaimActiveStageButton
  taskId={task.id}
  stageId={activeStage.stageId}
  isBlocked={activeStage.status === "BLOCKED"}
/>
```

### UnassignActiveStageButton

Botão para liberar uma etapa atribuída.

**Features:**
- Valida permissões (apenas assignee, manager ou admin)
- Confirmação antes de liberar
- Etapa volta para backlog do time

**Uso:**
```tsx
<UnassignActiveStageButton
  taskId={task.id}
  stageId={activeStage.stageId}
  currentAssignee={activeStage.assignee?.name}
/>
```

### StageWorkflowVisualization

Visualização do workflow com indicadores de status.

**Features:**
- Mostra todas as etapas do template
- Indica etapas COMPLETED, ACTIVE, BLOCKED
- Mostra tempo em cada etapa (stageLogs)
- Navegação visual do progresso da tarefa

## Exemplos de Uso

### Exemplo 1: Desenvolvimento de Landing Page

**Workflow Template:**
```
1. Design
2. Front-end (depende de: Design)
3. Back-end (depende de: Design)
4. Testes (depende de: Front-end, Back-end)
5. Deploy (depende de: Testes)
```

**Fluxo de Execução:**

1. **Task criada:**
   - Design → ACTIVE

2. **Designer completa Design:**
   - Design → COMPLETED
   - Front-end → ACTIVE (fork)
   - Back-end → ACTIVE (fork)
   - Testes → BLOCKED (aguardando Front-end E Back-end)

3. **Dev 1 completa Front-end:**
   - Front-end → COMPLETED
   - Testes → ainda BLOCKED (aguardando Back-end)

4. **Dev 2 completa Back-end:**
   - Back-end → COMPLETED
   - Testes → ACTIVE (join - todas dependências completas!)

5. **QA completa Testes:**
   - Testes → COMPLETED
   - Deploy → ACTIVE

### Exemplo 2: Conteúdo com Múltiplas Revisões

**Workflow Template:**
```
1. Redação
2. Revisão Editorial (depende de: Redação)
3. Revisão Técnica (depende de: Redação)
4. Aprovação Final (depende de: Revisão Editorial, Revisão Técnica)
```

**Fluxo de Execução:**

1. **Redator completa Redação:**
   - Redação → COMPLETED
   - Revisão Editorial → ACTIVE (fork)
   - Revisão Técnica → ACTIVE (fork)
   - Aprovação Final → BLOCKED

2. **Editor completa Revisão Editorial:**
   - Revisão Editorial → COMPLETED
   - Aprovação Final → ainda BLOCKED (aguardando Revisão Técnica)

3. **Técnico completa Revisão Técnica:**
   - Revisão Técnica → COMPLETED
   - Aprovação Final → ACTIVE (join!)

## Backward Compatibility

Para manter a compatibilidade com componentes existentes, as queries adicionam **computed properties**:

```typescript
const taskData = await prisma.task.findUnique({
  where: { id: taskId },
  include: {
    activeStages: {
      where: { status: { in: ["ACTIVE", "BLOCKED"] } },
      include: { stage: true },
    },
  },
});

// Adiciona computed properties para compatibilidade
const currentActiveStage = taskData.activeStages.find(as => as.status === "ACTIVE");

const task = {
  ...taskData,
  currentStage: currentActiveStage ? currentActiveStage.stage : null,
  currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
};
```

Desta forma, componentes que ainda usam `task.currentStage` continuam funcionando, mas agora representam **a primeira etapa ativa**.

## Funções Depreciadas

As seguintes funções foram depreciadas e retornam mensagens direcionando para as novas funções:

- `advanceTaskStage()` → Use `completeStageAndAdvance()`
- `getAvailableNextStages()` → Lógica integrada em `completeStageAndAdvance()`
- `claimTask()` → Use `claimActiveStage()`
- `assignTask()` → Use `claimActiveStage()`
- `revertTaskStage()` → Funcionalidade em revisão

## Migração de Dados

⚠️ **Atenção:** Esta mudança requer reset completo do banco de dados.

**Passos:**

1. **Backup (se necessário):**
   ```bash
   # Se houver dados em produção que precisam ser preservados
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Reset do banco:**
   ```bash
   npx prisma migrate reset --force
   ```

3. **Gerar Prisma Client:**
   ```bash
   npx prisma generate
   ```

4. **Seed (opcional):**
   ```bash
   npx prisma db seed
   ```

## Performance e Escalabilidade

### Índices

O modelo `TaskActiveStage` possui índices estratégicos:

```prisma
@@index([taskId])       // Buscar etapas de uma tarefa
@@index([stageId])      // Buscar tarefas em uma etapa
@@index([assigneeId])   // Buscar etapas de um usuário
@@index([status])       // Filtrar por status (ACTIVE, BLOCKED, COMPLETED)
@@unique([taskId, stageId])  // Prevenir duplicação
```

### Queries Otimizadas

- Dashboard queries usam `select` seletivo para reduzir payload
- Include apenas relações necessárias
- Uso de `where` para filtrar no banco, não na aplicação

### Transações

Operações críticas usam transações do Prisma:

```typescript
await prisma.$transaction([
  prisma.taskActiveStage.updateMany({ /* ... */ }),
  prisma.taskStageLog.update({ /* ... */ }),
  prisma.task.update({ /* ... */ }),
]);
```

## Testes

### Casos de Teste Recomendados

**1. Fork Simples:**
- Completar uma etapa que tem 2 dependentes
- Verificar que ambos são criados como ACTIVE

**2. Join Simples:**
- Completar primeira de 2 dependências
- Verificar que próxima etapa fica BLOCKED
- Completar segunda dependência
- Verificar que próxima etapa muda para ACTIVE

**3. Fork + Join Complexo:**
- Workflow: A → (B, C) → D
- Completar A
- Verificar B e C ativos, D bloqueado
- Completar B
- Verificar D ainda bloqueado
- Completar C
- Verificar D ativo

**4. Atribuição:**
- Tentar pegar etapa de outro time (deve falhar)
- Pegar etapa do próprio time (deve suceder)
- Tentar pegar etapa já atribuída (deve falhar)
- Liberar etapa atribuída

## Próximos Passos

### Features Futuras

- [ ] **Retrocesso de Etapa** - Implementar `revertActiveStage()` para revisões
- [ ] **Etapas Opcionais** - Flags para etapas que podem ser puladas
- [ ] **Condicionais** - Ativar etapas baseado em condições (ex: prioridade, tipo)
- [ ] **Notificações** - Alertas quando etapas são ativadas, bloqueadas ou completadas
- [ ] **Métricas** - Tempo médio por etapa, taxa de conclusão, etc.

### Melhorias de UX

- [ ] Drag-and-drop no Kanban para múltiplas etapas
- [ ] Visualização de dependências no card
- [ ] Indicador visual de progresso (ex: "2 de 3 dependências completas")
- [ ] Timeline visual do workflow

---

**Documentação criada em:** Novembro 2024
**Versão do Sistema:** 2.0 - Parallel Workflow
**Última atualização:** 2024-11-06
