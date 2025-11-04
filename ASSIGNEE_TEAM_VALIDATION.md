# 🛡️ Validação Crítica: assigneeId vs. Team Consistency

**Data**: 2025-11-04  
**Prioridade**: 🔴 **CRÍTICA** - Validação de integridade de dados  
**Questão**: "O assigneeId é usado para o usuário atual da tarefa? Se for, preciso validar que o usuário associado faça parte do time relacionado"

---

## 🎯 Resposta Rápida

**SIM**, você está absolutamente correto! Esta é uma **validação de integridade crítica** que DEVE ser implementada.

### Regra de Negócio Fundamental:

```
Se Task.assigneeId != null:
  → User.teamId DEVE ser igual a Task.currentStage.defaultTeamId
```

---

## 🔍 Cenários de Inconsistência Possíveis

### ❌ Cenário 1: Atribuição Manual Incorreta

```typescript
// Estado do banco
Task {
  id: "task-123",
  assigneeId: "user-copywriter",
  currentStageId: "stage-design" // defaultTeamId = "Designers"
}

User {
  id: "user-copywriter",
  teamId: "Copywriting" // ❌ Time diferente!
}
```

**Problema:**
- ❌ Copywriter atribuído a tarefa de Design
- ❌ Aparece no dashboard do Copywriter
- ❌ Mas ele não tem competência/acesso para executar
- ❌ Time de Designers não vê a tarefa no backlog

---

### ❌ Cenário 2: Usuário Mudou de Time

```typescript
// 1. Situação inicial (OK)
Task {
  assigneeId: "user-john",
  currentStageId: "stage-copy" // defaultTeamId = "Copywriting"
}
User {
  id: "user-john",
  teamId: "Copywriting" // ✅ Correto
}

// 2. Admin muda John de time
User {
  id: "user-john",
  teamId: "Designers" // ❌ Agora está inconsistente!
}

// 3. Task ainda aponta para John, mas ele não é mais Copywriter
Task {
  assigneeId: "user-john", // ❌ John não faz mais parte do time
  currentStageId: "stage-copy"
}
```

**Problema:**
- ❌ John vê tarefa de Copywriting no dashboard dele
- ❌ Mas ele agora é Designer
- ❌ Time de Copywriting acha que tarefa está atribuída
- ❌ Inconsistência de dados

---

## ✅ Solução Arquitetural

### 1. Validação na Função `claimTask()` (Auto-atribuição)

**Arquivo**: [`lib/actions/task.ts`](lib/actions/task.ts) (nova função)

```typescript
/**
 * Atribui uma tarefa não atribuída ao usuário atual
 * ✅ VALIDAÇÃO: Usuário deve pertencer ao time da etapa atual
 */
export async function claimTask(taskId: string) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;
  
  // 1. Buscar tarefa com etapa atual
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { 
      currentStage: { 
        select: { 
          id: true, 
          name: true, 
          defaultTeamId: true 
        } 
      } 
    }
  });
  
  if (!task) {
    return { error: "Tarefa não encontrada" };
  }
  
  if (task.assigneeId !== null) {
    return { error: "Tarefa já está atribuída a outro usuário" };
  }
  
  // 2. ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário pertence ao time correto
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true, team: { select: { name: true } } }
  });
  
  if (!currentUser?.teamId) {
    return { 
      error: "Você não está atribuído a nenhum time. Contate o administrador." 
    };
  }
  
  if (currentUser.teamId !== task.currentStage?.defaultTeamId) {
    return { 
      error: `Esta tarefa pertence ao time "${task.currentStage?.defaultTeam?.name || 'outro'}". Você faz parte do time "${currentUser.team?.name}".` 
    };
  }
  
  // 3. Atribuir tarefa (validação passou)
  await prisma.task.update({
    where: { id: taskId },
    data: { 
      assigneeId: userId,
      status: "IN_PROGRESS" // Opcional: mover de BACKLOG para IN_PROGRESS
    }
  });
  
  revalidatePath(`/dashboard`);
  revalidatePath(`/tasks/${taskId}`);
  
  return { success: true };
}
```

---

### 2. Validação na Função `assignTask()` (Supervisor atribui)

**Arquivo**: [`lib/actions/task.ts`](lib/actions/task.ts) (nova função)

```typescript
/**
 * Supervisor/Admin atribui tarefa manualmente a um usuário
 * ✅ VALIDAÇÃO: Usuário alvo deve pertencer ao time da etapa atual
 */
export async function assignTask(taskId: string, targetUserId: string) {
  const user = await requireMemberOrHigher(); // Quem está atribuindo
  
  // 1. Buscar tarefa e etapa atual
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { 
      currentStage: { 
        select: { 
          defaultTeamId: true,
          defaultTeam: { select: { name: true } }
        } 
      } 
    }
  });
  
  if (!task) {
    return { error: "Tarefa não encontrada" };
  }
  
  // 2. ✅ VALIDAÇÃO CRÍTICA: Verificar se usuário alvo pertence ao time
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { 
      teamId: true, 
      name: true,
      team: { select: { name: true } }
    }
  });
  
  if (!targetUser) {
    return { error: "Usuário não encontrado" };
  }
  
  if (!targetUser.teamId) {
    return { 
      error: `${targetUser.name} não está atribuído a nenhum time.` 
    };
  }
  
  if (targetUser.teamId !== task.currentStage?.defaultTeamId) {
    return { 
      error: `Não é possível atribuir a ${targetUser.name}. Esta tarefa pertence ao time "${task.currentStage?.defaultTeam?.name}", mas ${targetUser.name} faz parte do time "${targetUser.team?.name}".` 
    };
  }
  
  // 3. Atribuir tarefa (validação passou)
  await prisma.task.update({
    where: { id: taskId },
    data: { 
      assigneeId: targetUserId,
      status: "IN_PROGRESS"
    }
  });
  
  revalidatePath(`/dashboard`);
  revalidatePath(`/tasks/${taskId}`);
  
  return { success: true };
}
```

---

### 3. Proteção Contra Mudança de Time

**Arquivo**: [`app/(protected)/admin/users/page.tsx`](app/(protected)/admin/users/page.tsx:24-41)

**Função `updateUser()` atual:**

```typescript
async function updateUser(formData: FormData) {
  "use server"
  await requireAdmin()
  const id = formData.get("id") as string
  const role = formData.get("role") as UserRole
  const teamId = formData.get("teamId") as string | null
  
  await prisma.user.update({
    where: { id },
    data: {
      role,
      teamId: teamId || null,
    },
  })
  
  revalidatePath("/admin/users")
}
```

**✅ Versão com validação:**

```typescript
async function updateUser(formData: FormData) {
  "use server"
  await requireAdmin()
  const id = formData.get("id") as string
  const role = formData.get("role") as UserRole
  const newTeamId = formData.get("teamId") as string | null
  
  // ✅ VALIDAÇÃO: Verificar se usuário tem tarefas atribuídas
  const activeTasks = await prisma.task.findMany({
    where: {
      assigneeId: id,
      status: { in: ["BACKLOG", "IN_PROGRESS", "PAUSED"] }
    },
    include: {
      currentStage: {
        select: { defaultTeamId: true }
      }
    }
  })
  
  // Se está mudando de time E tem tarefas ativas
  if (activeTasks.length > 0) {
    // Verificar se todas as tarefas pertencem ao novo time
    const incompatibleTasks = activeTasks.filter(
      task => task.currentStage?.defaultTeamId !== newTeamId
    )
    
    if (incompatibleTasks.length > 0) {
      // Opção 1: Bloquear mudança
      throw new Error(
        `Não é possível mudar o time. ${activeTasks.length} tarefa(s) ativa(s) atribuída(s) a este usuário. Desatribua as tarefas primeiro.`
      )
      
      // Opção 2: Desatribuir automaticamente
      // await prisma.task.updateMany({
      //   where: {
      //     assigneeId: id,
      //     status: { in: ["BACKLOG", "IN_PROGRESS", "PAUSED"] }
      //   },
      //   data: { assigneeId: null }
      // })
    }
  }
  
  await prisma.user.update({
    where: { id },
    data: {
      role,
      teamId: newTeamId || null,
    },
  })
  
  revalidatePath("/admin/users")
}
```

---

## 🔒 Constraint no Banco de Dados (Ideal)

### Problema:
- Validações em código podem ser burladas
- Acesso direto ao banco ignora validações
- Migrations podem criar inconsistências

### ✅ Solução: Database Trigger

**Arquivo**: Nova migration

```sql
-- prisma/migrations/XXXXX_add_assignee_team_validation/migration.sql

-- Função que valida consistência assignee vs team
CREATE OR REPLACE FUNCTION validate_task_assignee_team()
RETURNS TRIGGER AS $$
BEGIN
  -- Se assigneeId não é null, validar team
  IF NEW."assigneeId" IS NOT NULL THEN
    -- Verificar se usuário pertence ao time correto
    IF NOT EXISTS (
      SELECT 1 
      FROM "User" u
      INNER JOIN "TemplateStage" ts ON ts.id = NEW."currentStageId"
      WHERE u.id = NEW."assigneeId" 
        AND u."teamId" = ts."defaultTeamId"
    ) THEN
      RAISE EXCEPTION 'Usuário % não pertence ao time da etapa atual',
        NEW."assigneeId";
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger no INSERT e UPDATE
CREATE TRIGGER check_task_assignee_team
  BEFORE INSERT OR UPDATE ON "Task"
  FOR EACH ROW
  EXECUTE FUNCTION validate_task_assignee_team();
```

**Vantagens:**
- ✅ Validação a nível de banco
- ✅ Impossível burlar (mesmo via SQL direto)
- ✅ Performance (executado no banco)

---

## 📊 Matriz de Validações

| Operação | Onde validar | Regra |
|----------|--------------|-------|
| **claimTask()** | Backend | `user.teamId === task.currentStage.defaultTeamId` |
| **assignTask()** | Backend | `targetUser.teamId === task.currentStage.defaultTeamId` |
| **updateUser()** | Backend | Bloquear se tem tarefas ativas em outro time |
| **advanceTaskStage()** | Backend | Manter `assigneeId` ou resetar para `null` |
| **INSERT/UPDATE Task** | Database Trigger | Validação a nível de BD |

---

## 🎯 Lógica de assigneeId ao Avançar Etapa

### Cenário: Tarefa avança de "Copy" para "Design"

```typescript
// Estado inicial
Task {
  assigneeId: "copywriter-id",
  currentStageId: "stage-copy" // defaultTeamId = "Copywriting"
}

// Copywriter avança para próxima etapa
await advanceTaskStage("task-123", "stage-design"); // defaultTeamId = "Designers"

// ✅ O QUE FAZER COM assigneeId?
```

### Opção 1: Resetar para `null` (RECOMENDADO)

```typescript
export async function advanceTaskStage(taskId: string, nextStageId: string) {
  // ... validações
  
  await prisma.$transaction(async (tx) => {
    // ... close current log, create new log
    
    // ✅ Resetar assigneeId quando muda de etapa
    await tx.task.update({
      where: { id: taskId },
      data: {
        currentStageId: nextStageId,
        assigneeId: null, // ← Volta para backlog do próximo time
        status: "BACKLOG" // ← Ou manter IN_PROGRESS
      }
    });
  });
}
```

**Vantagens:**
- ✅ Tarefa aparece no backlog do próximo time
- ✅ Sem inconsistências
- ✅ Time decide quem pega

---

### Opção 2: Manter se usuário pertence ao próximo time (Avançado)

```typescript
export async function advanceTaskStage(taskId: string, nextStageId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { 
      assignee: { select: { teamId: true } }
    }
  });
  
  const nextStage = await prisma.templateStage.findUnique({
    where: { id: nextStageId },
    select: { defaultTeamId: true }
  });
  
  // Se usuário atual pertence ao próximo time, manter
  const shouldKeepAssignee = 
    task.assignee?.teamId === nextStage?.defaultTeamId;
  
  await tx.task.update({
    where: { id: taskId },
    data: {
      currentStageId: nextStageId,
      assigneeId: shouldKeepAssignee ? task.assigneeId : null,
      status: shouldKeepAssignee ? "IN_PROGRESS" : "BACKLOG"
    }
  });
}
```

**Uso:**
- Útil se um usuário pode trabalhar em múltiplas etapas
- Exemplo: Designer que também faz Copy

---

## 🚨 Casos Extremos

### Caso 1: Usuário sem Team pega tarefa

```typescript
// ❌ Estado inconsistente
User {
  id: "user-123",
  teamId: null // Sem time!
}

Task {
  assigneeId: "user-123",
  currentStageId: "stage-copy" // defaultTeamId = "Copywriting"
}
```

**Proteção:**

```typescript
if (!currentUser?.teamId) {
  return { 
    error: "Você não está atribuído a nenhum time. Contate o administrador." 
  };
}
```

---

### Caso 2: Etapa sem Team

```typescript
// ❌ TemplateStage sem defaultTeamId
TemplateStage {
  id: "stage-generic",
  defaultTeamId: null // Sem time padrão
}
```

**Solução:**

```typescript
if (!task.currentStage?.defaultTeamId) {
  // Permitir qualquer usuário (tarefa genérica)
  // OU bloquear até admin configurar time
  return { 
    error: "Esta etapa não tem um time padrão configurado. Contate o administrador." 
  };
}
```

---

## ✅ Checklist de Implementação

### Fase 1: Backend Validation (2-3 horas)
- [ ] Criar função [`claimTask()`](lib/actions/task.ts) com validação de team
- [ ] Criar função [`assignTask()`](lib/actions/task.ts) com validação de team
- [ ] Atualizar [`advanceTaskStage()`](lib/actions/task.ts:369) para resetar `assigneeId`
- [ ] Modificar [`updateUser()`](app/(protected)/admin/users/page.tsx:24) com proteção

### Fase 2: Database Constraint (1 hora)
- [ ] Criar migration com trigger de validação
- [ ] Testar violação de constraint
- [ ] Validar mensagens de erro

### Fase 3: UI (1-2 horas)
- [ ] Adicionar botão "Pegar Tarefa" no dashboard
- [ ] Mostrar mensagens de erro claras
- [ ] Adicionar indicador visual de "time incompatível"

### Fase 4: Testes (2-3 horas)
- [ ] Teste: Copywriter não pode pegar tarefa de Design
- [ ] Teste: Admin não pode atribuir tarefa a time errado
- [ ] Teste: Mudança de time desatribui tarefas
- [ ] Teste: Avançar etapa reseta assigneeId
- [ ] Teste: Trigger impede INSERT inconsistente

---

## 🎯 Resumo da Solução

### Validações Implementadas:

1. ✅ **claimTask()**: Valida `user.teamId === currentStage.defaultTeamId`
2. ✅ **assignTask()**: Valida `targetUser.teamId === currentStage.defaultTeamId`
3. ✅ **updateUser()**: Bloqueia mudança de team se tem tarefas ativas
4. ✅ **advanceTaskStage()**: Reseta `assigneeId = null` ao mudar etapa
5. ✅ **Database Trigger**: Validação a nível de BD (ideal)

### Fluxo Correto:

```
1. Admin cria tarefa → assigneeId = null
2. Tarefa aparece no backlog do time correto
3. Copywriter clica "Pegar Tarefa"
   → Validação: Copywriter.teamId === Copywriting ✅
   → assigneeId = copywriter-id
4. Copywriter avança para Design
   → assigneeId = null (reseta)
   → Tarefa no backlog de Designers
5. Designer clica "Pegar Tarefa"
   → Validação: Designer.teamId === Designers ✅
   → assigneeId = designer-id
```

---

**Arquiteto**: Kilo Code  
**Status**: 🔴 **Crítico** - Validação obrigatória  
**Risco de NÃO implementar**: 🔥 **ALTO** - Inconsistências de dados, tarefas atribuídas a times errados