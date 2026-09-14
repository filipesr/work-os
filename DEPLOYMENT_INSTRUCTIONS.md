# 🚀 Instruções de Deployment - Fix de Visibilidade de Tarefas

## ⚠️ IMPORTANTE: Erros TypeScript Temporários

Os erros TypeScript que aparecem em `app/(protected)/dashboard/page.tsx` são **ESPERADOS** e serão resolvidos automaticamente após rodar os comandos abaixo. Eles ocorrem porque os tipos `TaskStatus` e `TaskPriority` ainda não foram regenerados no Prisma Client.

**NÃO** reverta as mudanças por causa desses erros!

---

## 📋 Passo a Passo de Deployment

### 1. Regenerar Prisma Client

```bash
npx prisma generate
```

Este comando irá:

- Regenerar os tipos TypeScript do Prisma
- Resolver todos os erros de tipo em `dashboard/page.tsx`

### 2. Aplicar Migration (Database Constraint)

#### Se você receber erro P3005 (banco já existe):

```bash
# Fazer baseline da migration existente
npx prisma migrate resolve --applied 20250104160000_add_assignee_team_validation

# Depois aplicar a nova migration
npx prisma migrate deploy
```

#### OU se estiver em desenvolvimento (recomendado):

```bash
npx prisma migrate dev
```

Este comando irá:

- Criar o trigger `validate_task_assignee_team()` no PostgreSQL
- Garantir integridade de dados a nível de banco

### 3. Verificar Status

```bash
npx prisma migrate status
```

Deve mostrar:

```
Database schema is up to date!
```

### 4. Reiniciar Servidor

```bash
npm run dev
# ou
pnpm dev
```

---

## ✅ Validação do Fix

### Teste 1: Criar Nova Tarefa

1. **Admin** cria uma tarefa no template
2. **Verificar**: Tarefa aparece no **"Backlog da Equipe"** do time da primeira etapa
3. **Verificar**: Tarefa **NÃO** aparece em "Minhas Tarefas" do admin

### Teste 2: Pegar Tarefa

1. **Membro do time** clica em **"Pegar Tarefa"** no backlog
2. **Verificar**: Tarefa some do backlog da equipe
3. **Verificar**: Tarefa aparece em **"Minhas Tarefas"** do membro

### Teste 3: Avançar Etapa

1. **Membro atual** avança tarefa para próxima etapa (outro time)
2. **Verificar**: Tarefa some de suas "Minhas Tarefas"
3. **Verificar**: Tarefa aparece no **"Backlog da Equipe"** do novo time

### Teste 4: Validação de Integridade (Database Trigger)

1. **Tentar manualmente** atribuir tarefa a usuário de team errado
2. **Verificar**: Operação **falha** com erro:
   ```
   User {userId} does not belong to the team of the current stage
   ```

### Teste 5: Mudança de Team

1. **Admin** muda usuário de team (com tarefas ativas atribuídas)
2. **Verificar**: Tarefas são **automaticamente desatribuídas**
3. **Verificar**: Tarefas voltam ao backlog do team correto

---

## 📊 O Que Foi Implementado

### ✅ Fase 1: Fix Criação de Tarefas

- **Arquivo**: `lib/actions/task.ts`
- **Mudança**: `assigneeId: null` (linha 87)
- **Impacto**: Tarefas novas aparecem no backlog do team

### ✅ Fase 2: Validações de Backend

- **Arquivo**: `lib/actions/task.ts`
- **Novas funções**:
  - `claimTask()` - Usuário pega tarefa do backlog (com validação)
  - `assignTask()` - Supervisor atribui manualmente (com validação)
- **Modificações**:
  - `advanceTaskStage()` - Reseta assignee ao mudar etapa
- **Arquivo**: `app/(protected)/admin/users/page.tsx`
- **Modificação**:
  - `updateUser()` - Desatribui tarefas ao mudar team

### ✅ Fase 3: Database Constraint

- **Arquivo**: `prisma/migrations/20250104160000_add_assignee_team_validation/migration.sql`
- **Trigger**: `validate_task_assignee_team()`
- **Impacto**: Impossível atribuir tarefa a usuário de team errado

### ✅ Fase 4: Interface do Usuário

- **Arquivo**: `components/tasks/ClaimTaskButton.tsx` (novo)
- **Componente**: Botão "Pegar Tarefa" com loading e error states
- **Arquivo**: `app/(protected)/dashboard/page.tsx`
- **Mudança**: Botão integrado no backlog da equipe

---

## 🔍 Arquivos de Documentação

Documentação técnica criada durante o processo:

1. **`TASK_VISIBILITY_ANALYSIS.md`**
   - Análise do problema original
   - Fluxo de dados atual
   - Solução proposta

2. **`TASK_CREATION_RISK_ANALYSIS.md`**
   - Análise de riscos da mudança
   - Validação de auditoria
   - Casos de uso

3. ~~`ASSIGNEE_TEAM_VALIDATION.md`~~ — **apagado em 2026-09-14.** Descrevia uma regra cujas três
   partes já não existem (`Task.assigneeId`, `User.teamId` e o gatilho `check_task_assignee_team`,
   que foi o defeito que impediu criar demanda de 1º a 10 de setembro). Ver
   `docs/pendencias.md`.
   - Especificação técnica

---

## 🐛 Troubleshooting

### Erro: "Module '@prisma/client' has no exported member 'TaskStatus'"

**Solução**: Rodar `npx prisma generate`

### Erro: "User X does not belong to the team of the current stage"

**Causa**: Trigger funcionando corretamente! Usuário tentou pegar tarefa de team incorreto
**Solução**: Verificar que `User.teamId === TemplateStage.defaultTeamId`

### Tarefa não aparece no dashboard após criação

**Verificar**:

1. `Task.assigneeId` está `null`?
2. `Task.currentStage.defaultTeamId === myTeamId`?
3. `Task.status === 'BACKLOG'`?

### Botão "Pegar Tarefa" não funciona

**Verificar**:

1. Console do navegador para erros JavaScript
2. Network tab para status da requisição
3. Logs do servidor Next.js

---

## 📞 Suporte

Se os erros persistirem após seguir os passos acima:

1. Verificar logs do servidor Next.js
2. Verificar logs do PostgreSQL
3. Confirmar versão do Prisma: `npx prisma --version`
4. Verificar schema: `npx prisma db pull` e comparar com `schema.prisma`

---

## ✨ Resultado Esperado

Após deployment bem-sucedido:

- ✅ Tarefas novas aparecem no backlog do team correto
- ✅ Membros podem pegar tarefas do backlog
- ✅ Tarefas atribuídas aparecem em "Minhas Tarefas"
- ✅ Avançar etapa move tarefa para backlog do próximo time
- ✅ Impossível atribuir tarefa a usuário de team errado
- ✅ Auditoria completa preservada em `TaskStageLog`
- ✅ Zero erros TypeScript
- ✅ Zero warnings no console
