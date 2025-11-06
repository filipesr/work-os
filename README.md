# Work OS - Sistema de Gestão de Operações

Sistema de gestão de operações para agências baseado em Next.js, Prisma, e NextAuth.

## 🚀 Sistema de Workflow Paralelo (Fork/Join) - v2.0

O Work OS implementa um sistema avançado de **workflow paralelo** que permite:

- ✅ **Fork (Divisão):** Múltiplas etapas executam simultaneamente após conclusão de uma etapa
- ✅ **Join (Sincronização):** Etapas aguardam TODAS as dependências antes de ativar
- ✅ **Atribuição por Etapa:** Cada etapa ativa pode ter seu próprio responsável
- ✅ **Dashboard por Etapa:** Uma entrada no dashboard para cada etapa ativa (não por tarefa)
- ✅ **Bloqueio Inteligente:** Etapas aguardando dependências ficam visíveis como BLOCKED

📖 **[Documentação Completa do Sistema Paralelo](./PARALLEL_WORKFLOW.md)**

### Exemplo Prático

**Workflow: Landing Page**
```
Design → Fork(Front-end, Back-end) → Join(Testes) → Deploy
```

**Execução:**
1. Designer completa "Design" → Front-end e Back-end ativam **simultaneamente**
2. Dev 1 completa "Front-end" → Testes fica **bloqueado** (aguardando Back-end)
3. Dev 2 completa "Back-end" → Testes **ativa automaticamente** (join completo!)
4. QA completa "Testes" → Deploy ativa

**Benefícios:** Economiza dias de projeto eliminando esperas desnecessárias.

---

## ✅ Parte 1.1 Completa: Fundação e Schema do Banco de Dados

### O que foi implementado:

#### 1. Projeto Next.js
- ✅ Next.js 15 com App Router
- ✅ TypeScript configurado
- ✅ Tailwind CSS configurado
- ✅ ESLint configurado

#### 2. Schema Completo do Prisma
O schema define toda a arquitetura do sistema com:

**Enums:**
- `UserRole`: ADMIN, MANAGER, SUPERVISOR, MEMBER, CLIENT
- `TaskStatus`: BACKLOG, IN_PROGRESS, PAUSED, COMPLETED, CANCELLED
- `TaskPriority`: LOW, MEDIUM, HIGH, URGENT
- `ArtifactType`: DOCUMENT, IMAGE, VIDEO, FIGMA, OTHER
- `ActiveStageStatus`: ACTIVE, BLOCKED, COMPLETED (novo - sistema paralelo)

**Modelos Principais:**

**Autenticação & Time:**
- `User` - Usuários com roles e relação com times
- `Account`, `Session`, `VerificationToken` - NextAuth models
- `Team` - Times de trabalho

**Cliente & Projeto:**
- `Client` - Clientes
- `Project` - Projetos vinculados a clientes

**Motor de Templates (Workflow Engine):**
- `WorkflowTemplate` - Templates de workflow configuráveis
- `TemplateStage` - Estágios do template (ordem e time padrão)
- `StageDependency` - Dependências entre estágios

**Task & Colaboração:**
- `Task` - Tarefa única que pode ter múltiplas etapas ativas simultaneamente
- `TaskActiveStage` - Relação many-to-many entre Task e TemplateStage (sistema paralelo)
- `TaskComment` - Comentários na tarefa
- `TaskArtifact` - Arquivos/links anexados

**Logs para Relatórios:**
- `TimeLog` - Log de horas trabalhadas (append-only)
- `TaskStageLog` - Log de transições entre estágios (para análise de gargalos)

#### 3. NextAuth.js (Auth.js) Configurado
- ✅ `lib/prisma.ts` - Singleton do PrismaClient
- ✅ `auth.config.ts` - Configuração do NextAuth com:
  - PrismaAdapter configurado
  - Google Provider (exemplo)
  - Session callback estendido com `id`, `role`, `teamId`
- ✅ `auth.ts` - Inicialização do NextAuth
- ✅ `app/api/auth/[...nextauth]/route.ts` - API route handler
- ✅ `lib/auth.ts` - Utilitários de autenticação:
  - `getServerSession()` - Pegar sessão no servidor
  - `hasRole()`, `hasAnyRole()` - Verificar roles
  - `requireAuth()`, `requireRole()` - Guards para proteger rotas
  - `getUserRole()`, `getUserTeamId()` - Helpers
- ✅ `types/next-auth.d.ts` - Type definitions estendidas

### Próximos Passos:

#### 1. Configurar Variáveis de Ambiente
Copie `.env.example` para `.env` e configure:

```bash
cp .env.example .env
```

Edite `.env` com suas credenciais reais:
- `DATABASE_URL` - String de conexão do Neon (PostgreSQL)
- `AUTH_SECRET` - Gere com: `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` - Credenciais OAuth
- Credenciais do Cloudinary

#### 2. Gerar Prisma Client e Criar o Banco

```bash
# Gerar o Prisma Client
npx prisma generate

# Criar as tabelas no banco (desenvolvimento)
npx prisma db push

# OU criar uma migration (recomendado para produção)
npx prisma migrate dev --name init
```

#### 3. Configurar OAuth Providers
No Google Cloud Console:
1. Criar credenciais OAuth 2.0
2. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
3. Copiar Client ID e Secret para o `.env`

#### 4. Testar a Aplicação

```bash
npm run dev
```

Acesse: http://localhost:3000

### Estrutura do Projeto

```
work-os/
├── app/
│   ├── api/auth/[...nextauth]/route.ts  # NextAuth API route
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── auth.ts                          # Auth utilities
│   └── prisma.ts                        # Prisma singleton
├── prisma/
│   └── schema.prisma                    # Complete database schema
├── types/
│   └── next-auth.d.ts                   # Extended NextAuth types
├── auth.config.ts                       # NextAuth configuration
├── auth.ts                              # NextAuth initialization
├── .env                                 # Environment variables (git-ignored)
├── .env.example                         # Environment template
└── package.json
```

### Arquitetura: "Parallel Workflow with Fork/Join Pattern"

A arquitetura implementada usa um modelo avançado onde:
- Uma **Task** não tem sub-tasks, mas pode ter **múltiplas etapas ativas simultaneamente**
- Modelo **many-to-many** (Task ↔ TemplateStage) através de `TaskActiveStage`
- **Fork:** Uma etapa completada pode ativar múltiplas etapas dependentes automaticamente
- **Join:** Uma etapa só ativa quando TODAS suas dependências forem completadas
- Os **logs** (TimeLog, TaskStageLog) são append-only para performance
- Os **Templates** definem workflows reutilizáveis com dependências complexas
- **Atribuição por etapa:** Cada etapa ativa pode ter seu próprio responsável

Este design permite:
- ✅ Workflows paralelos que economizam dias de projeto
- ✅ Sincronização automática de dependências (Join pattern)
- ✅ Visibilidade granular: uma entrada no dashboard por etapa ativa
- ✅ Análise de gargalos (tempo em cada stage)
- ✅ Relatórios de produtividade detalhados
- ✅ RBAC granular (por role, por team, e por etapa)
- ✅ Eliminação de esperas desnecessárias entre equipes

### Status do Projeto

- ✅ **Parte 1:** Fundação e Schema do Banco de Dados
- ✅ **Parte 2:** Motor de Templates e Máquina de Estados (Fork/Join implementado)
- ✅ **Parte 3:** UI Colaborativa (Kanban, Comentários, Artefatos)
- 🔄 **Parte 4:** Motor de Relatórios (Timesheet implementado, Gargalos em progresso)
- 🔄 **Parte 5:** RBAC e Deploy Final (RBAC implementado, Deploy pendente)

**Features Principais Implementadas:**
- ✅ Sistema de Workflow Paralelo (Fork/Join)
- ✅ Dashboard por Etapa com filtros avançados
- ✅ Atribuição e liberação por etapa
- ✅ Activity Tracking (Start/Stop)
- ✅ Time Logging manual
- ✅ Comentários e Artefatos
- ✅ Visualização de workflow
- ✅ Stage dependencies com bloqueio inteligente
- ✅ Validação de contribuições antes de avançar

---

## Scripts Disponíveis

```bash
npm run dev      # Inicia o servidor de desenvolvimento
npm run build    # Build para produção
npm run start    # Inicia o servidor de produção
npm run lint     # Roda o ESLint
```

## Tecnologias

- **Next.js 15** - React framework com App Router
- **TypeScript** - Type safety
- **Prisma** - ORM e schema definition
- **NextAuth.js (Auth.js v5)** - Autenticação
- **Tailwind CSS** - Styling
- **PostgreSQL** - Banco de dados (via Neon)
- **Cloudinary** - Upload de assets
