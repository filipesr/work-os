# Guia de Início Rápido - Sistema de Workflow Paralelo

Este guia mostra como configurar e testar o novo sistema de workflow paralelo (Fork/Join) do Work OS.

## 📋 Pré-requisitos

- Node.js 18+ instalado
- PostgreSQL (recomendamos Neon para desenvolvimento)
- Conta Google (para OAuth)

## 🚀 Setup Inicial

### 1. Clone e Instale Dependências

```bash
git clone <seu-repo>
cd work-os
npm install
```

### 2. Configure Variáveis de Ambiente

Copie o arquivo de exemplo e configure:

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
# Database
DATABASE_URL="postgresql://user:password@host/database"

# NextAuth
AUTH_SECRET="gere-com-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# OAuth Providers
GOOGLE_CLIENT_ID="seu-client-id"
GOOGLE_CLIENT_SECRET="seu-client-secret"

# Cloudinary (opcional)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="seu-cloud-name"
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET="seu-preset"
```

### 3. Setup do Banco de Dados

```bash
# Gerar Prisma Client
npx prisma generate

# Reset e criar o banco com novo schema
npx prisma migrate reset --force

# (Opcional) Popular com dados de exemplo
npx prisma db seed
```

### 4. Build e Start

```bash
# Build da aplicação
npm run build

# Iniciar servidor de desenvolvimento
npm run dev
```

Acesse: http://localhost:3000

## 🧪 Testando o Sistema de Workflow Paralelo

### Teste 1: Fork Simples (Uma etapa ativa múltiplas)

**Objetivo:** Verificar que múltiplas etapas são ativadas simultaneamente.

**Passos:**

1. **Login como Admin:**
   - Acesse http://localhost:3000
   - Faça login com conta Google

2. **Criar Teams:**
   - Navegue até "Admin" → "Teams"
   - Crie 3 teams:
     - "Design"
     - "Front-end"
     - "Back-end"

3. **Criar Usuários:**
   - Navegue até "Admin" → "Users"
   - Atribua você mesmo a um team (ex: "Design")
   - Crie ou convide outros usuários para os outros teams

4. **Criar Workflow Template:**
   - Navegue até "Admin" → "Templates"
   - Clique em "Novo Template"
   - Nome: "Feature Completa"
   - Crie as etapas:

   ```
   Etapa 1: Design
     - Team padrão: Design
     - Ordem: 1

   Etapa 2: Front-end
     - Team padrão: Front-end
     - Ordem: 2
     - Dependência: Design

   Etapa 3: Back-end
     - Team padrão: Back-end
     - Ordem: 3
     - Dependência: Design
   ```

5. **Criar Cliente e Projeto:**
   - Navegue até "Admin" → "Clients"
   - Crie um cliente: "Cliente Teste"
   - Navegue até "Admin" → "Projects"
   - Crie um projeto: "Projeto Teste" (vinculado ao Cliente Teste)

6. **Criar Tarefa:**
   - Navegue até "Admin" → "Tasks" → "Nova Tarefa"
   - Título: "Tela de Login"
   - Projeto: "Projeto Teste"
   - Template: "Feature Completa"
   - Clique em "Criar"

7. **Verificar Estado Inicial:**
   - Navegue até "Dashboard"
   - Você deve ver a tarefa na seção "Backlog do Time" (time de Design)
   - Status da etapa: ACTIVE (Design)

8. **Pegar a Tarefa:**
   - Clique no card da tarefa
   - Clique em "Pegar Etapa"
   - A tarefa agora aparece em "Minhas Etapas Ativas"

9. **Adicionar Contribuição:**
   - Adicione um comentário: "Design finalizado"
   - OU adicione um artefato (link do Figma)

10. **Completar Design (FORK acontece aqui!):**
    - Clique em "Concluir Etapa"
    - Você verá um preview mostrando:
      - ✅ Design será completado
      - 🔵 Front-end será ativado
      - 🔵 Back-end será ativado
    - Clique em "Confirmar"

11. **Verificar Fork:**
    - Navegue até "Projetos" → "Projeto Teste"
    - No Kanban, você deve ver:
      - Coluna "Front-end" com 1 tarefa
      - Coluna "Back-end" com 1 tarefa (a mesma!)
    - Navegue até "Dashboard"
    - Se você mudou seu time para "Front-end", verá o card no backlog
    - Se outro usuário é do time "Back-end", ele verá no backlog dele

**✅ Resultado Esperado:**
- Após completar Design, DUAS etapas foram ativadas simultaneamente
- A mesma tarefa aparece em múltiplas colunas do Kanban
- Diferentes teams veem a tarefa em seus backlogs

---

### Teste 2: Join Simples (Múltiplas etapas sincronizam)

**Objetivo:** Verificar que uma etapa só ativa quando TODAS as dependências são completadas.

**Passos:**

1. **Atualizar Template (adicionar Join):**
   - Navegue até "Admin" → "Templates"
   - Edite "Feature Completa"
   - Adicione uma nova etapa:

   ```
   Etapa 4: Testes
     - Team padrão: QA (crie este team se não existir)
     - Ordem: 4
     - Dependências: Front-end E Back-end (marque ambos!)
   ```

2. **Criar Nova Tarefa:**
   - Crie uma nova tarefa: "Tela de Cadastro"
   - Use o template "Feature Completa" (agora com 4 etapas)

3. **Complete Design:**
   - Pegue a tarefa no time de Design
   - Adicione comentário
   - Complete a etapa
   - **Fork acontece:** Front-end e Back-end ativam
   - **Join em espera:** Testes é criado como BLOCKED

4. **Verificar Bloqueio:**
   - Navegue até "Dashboard"
   - Se você está no time de QA, não verá a tarefa em "Backlog do Time"
   - A tarefa está BLOCKED (aguardando dependências)
   - *(Nota: UI de visualização de bloqueados pode ser implementada)*

5. **Complete Front-end (primeiro):**
   - Mude para time de Front-end
   - Pegue a tarefa
   - Adicione comentário: "Front-end pronto"
   - Complete a etapa
   - **Join ainda não acontece:** Testes continua BLOCKED (aguardando Back-end)

6. **Verificar Join Pendente:**
   - Navegue até o Kanban do projeto
   - Front-end: 0 tarefas (completada)
   - Back-end: 1 tarefa (ainda ativa)
   - Testes: 0 tarefas (ainda bloqueada, não aparece)

7. **Complete Back-end (segundo):**
   - Mude para time de Back-end
   - Pegue a tarefa
   - Adicione comentário: "Back-end pronto"
   - Complete a etapa
   - **JOIN ACONTECE:** Testes automaticamente muda de BLOCKED para ACTIVE!

8. **Verificar Join Completo:**
   - Navegue até "Dashboard" (time de QA)
   - Agora você deve ver a tarefa em "Backlog do Time"!
   - A tarefa apareceu automaticamente após a última dependência ser completada
   - Navegue até o Kanban do projeto
   - Testes: 1 tarefa (agora ativa!)

**✅ Resultado Esperado:**
- Após Front-end completar, Testes continuou bloqueado
- Após Back-end completar, Testes ativou automaticamente (JOIN)
- QA só viu a tarefa depois que ambas as dependências foram satisfeitas

---

### Teste 3: Fork + Join Complexo

**Objetivo:** Testar um workflow com múltiplos forks e joins.

**Workflow:**
```
Design
  ├─> Front-end
  └─> Back-end
       └─> Testes (aguarda Front-end + Back-end)
            └─> Deploy
```

Siga os mesmos passos do Teste 2, mas adicione uma 5ª etapa:

```
Etapa 5: Deploy
  - Team padrão: DevOps
  - Ordem: 5
  - Dependência: Testes
```

**Fluxo esperado:**
1. Complete Design → Fork (Front + Back ativam)
2. Complete Front → Join pendente (Testes ainda bloqueado)
3. Complete Back → Join! (Testes ativa)
4. Complete Testes → Deploy ativa

---

## 🎯 Verificações de Sucesso

### Dashboard

- [ ] "Minhas Etapas Ativas" mostra apenas etapas atribuídas a você
- [ ] "Backlog do Time" mostra etapas não atribuídas do seu time
- [ ] Filtro "Minhas Tarefas" funciona corretamente
- [ ] Filtro "Por Time" funciona corretamente
- [ ] Filtros de assignee e prioridade funcionam

### Kanban Board

- [ ] Mostra colunas para todas as etapas do template
- [ ] Tarefa com múltiplas etapas ativas aparece em múltiplas colunas
- [ ] Contadores de tarefas por coluna estão corretos

### Atribuição

- [ ] Consegue pegar etapa do próprio time
- [ ] Não consegue pegar etapa de outro time (erro)
- [ ] Não consegue pegar etapa já atribuída (erro)
- [ ] Consegue liberar etapa atribuída a você
- [ ] Admin consegue liberar qualquer etapa

### Fork/Join

- [ ] Fork: Múltiplas etapas ativam simultaneamente
- [ ] Join: Etapa só ativa quando TODAS as dependências são completadas
- [ ] Preview mostra etapas que serão ativadas/bloqueadas
- [ ] Toast mostra resumo após completar etapa

### Validações

- [ ] Não pode completar etapa sem contribuição (comentário ou artefato)
- [ ] Admin/Manager podem completar sem contribuição
- [ ] Apenas assignee, manager ou admin podem completar etapa

---

## 🐛 Problemas Comuns

### Erro: "Esta função foi depreciada"

**Causa:** Componente usando função antiga.

**Solução:** Atualize para as novas funções:
- `advanceTaskStage()` → `completeStageAndAdvance()`
- `claimTask()` → `claimActiveStage()`
- `assignTask()` → `claimActiveStage()`

### Etapa não aparece no Dashboard após Join

**Causa:** Cache do navegador.

**Solução:**
1. Force refresh (Ctrl+Shift+R)
2. Limpe cache do navegador
3. Verifique no banco de dados: `SELECT * FROM "TaskActiveStage" WHERE status = 'ACTIVE'`

### Não consigo pegar etapa de outro time

**Causa:** Validação de team funcionando corretamente.

**Solução:**
1. Verifique seu teamId: navegue até Account
2. Atribua-se ao team correto em "Admin" → "Users"
3. Faça logout e login novamente

### Tarefa não avança após completar etapa

**Causa:** Dependências não configuradas corretamente.

**Solução:**
1. Navegue até "Admin" → "Templates"
2. Verifique que as dependências estão corretas
3. Lembre-se: Join requer TODAS as dependências

---

## 📊 Queries Úteis para Debug

### Ver todas as etapas ativas de uma tarefa

```sql
SELECT
  tas.status,
  ts.name as stage_name,
  t.title as task_title,
  u.name as assignee_name
FROM "TaskActiveStage" tas
JOIN "TemplateStage" ts ON ts.id = tas."stageId"
JOIN "Task" t ON t.id = tas."taskId"
LEFT JOIN "User" u ON u.id = tas."assigneeId"
WHERE tas."taskId" = 'seu-task-id'
ORDER BY ts.order;
```

### Ver etapas bloqueadas

```sql
SELECT
  t.title as task_title,
  ts.name as stage_name,
  tas.status
FROM "TaskActiveStage" tas
JOIN "Task" t ON t.id = tas."taskId"
JOIN "TemplateStage" ts ON ts.id = tas."stageId"
WHERE tas.status = 'BLOCKED';
```

### Ver dependências de uma etapa

```sql
SELECT
  ts1.name as stage,
  ts2.name as depends_on
FROM "StageDependency" sd
JOIN "TemplateStage" ts1 ON ts1.id = sd."stageId"
JOIN "TemplateStage" ts2 ON ts2.id = sd."dependsOnStageId"
WHERE ts1.name = 'Testes';
```

---

## 🎓 Próximos Passos

Após testar com sucesso:

1. **Explore as Funcionalidades:**
   - Activity Tracking (Start/Stop Task)
   - Time Logging
   - Comentários e Artefatos
   - Visualização de Workflow

2. **Configure seu Workflow Real:**
   - Crie os teams da sua empresa
   - Crie templates baseados nos seus processos
   - Configure dependências que façam sentido

3. **Importe Dados:**
   - Crie seus clientes reais
   - Crie projetos ativos
   - Migre tarefas em andamento

4. **Customize:**
   - Ajuste cores e branding
   - Configure notificações
   - Personalize dashboards

---

## 📚 Documentação Adicional

- [Documentação Completa do Sistema Paralelo](./PARALLEL_WORKFLOW.md)
- [Changelog](./CHANGELOG.md)
- [README Principal](./README.md)
- [Task Flow Examples](./task-flow.md)

---

**Dúvidas ou Problemas?**

Abra uma issue no repositório ou consulte a documentação completa.

**Versão:** 2.0.0
**Data:** 2024-11-06
