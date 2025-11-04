# Parte 5: RBAC (Role-Based Access Control) e Polimento Final

## Visão Geral

Esta parte implementa o controle de acesso baseado em roles (RBAC) e polimento final da aplicação, garantindo que cada usuário tenha acesso apenas às funcionalidades apropriadas para seu role.

## Estrutura de Permissões

### Roles Disponíveis

1. **ADMIN**: Acesso total ao sistema
2. **MANAGER**: Gerencia projetos, clientes e visualiza relatórios
3. **SUPERVISOR**: Gerencia times e atribui tarefas
4. **MEMBER**: Executa tarefas e registra tempo
5. **CLIENT**: (Fora do escopo do MVP - reservado para v2)

### Matriz de Permissões

| Funcionalidade | ADMIN | MANAGER | SUPERVISOR | MEMBER |
|----------------|-------|---------|------------|--------|
| Gerenciar Teams | ✅ | ❌ | ❌ | ❌ |
| Gerenciar Users | ✅ | ❌ | ❌ | ❌ |
| Gerenciar Templates | ✅ | ❌ | ❌ | ❌ |
| Gerenciar Clients | ✅ | ✅ | ❌ | ❌ |
| Gerenciar Projects | ✅ | ✅ | ❌ | ❌ |
| Visualizar Relatórios | ✅ | ✅ | ❌ | ❌ |
| Criar Tasks | ✅ | ✅ | ✅ | ✅ |
| Avançar Stages | ✅ | ✅ | ✅ | ✅ |
| Adicionar Comentários | ✅ | ✅ | ✅ | ✅ |
| Registrar Tempo | ✅ | ✅ | ✅ | ✅ |
| Start/Stop Activity | ✅ | ✅ | ✅ | ✅ |

## Arquivos Criados/Modificados

### Novos Arquivos

1. **lib/permissions.ts**: Utilitários de verificação de permissões
   - `getSessionUser()`: Obtém o usuário autenticado
   - `checkRole()`: Verifica se o usuário tem um dos roles permitidos
   - `requireAdmin()`: Requer role ADMIN
   - `requireManagerOrAdmin()`: Requer MANAGER ou ADMIN
   - `requireMemberOrHigher()`: Requer MEMBER ou superior

2. **components/navbar.tsx**: Componente de navegação com controle de acesso
   - Exibe links condicionalmente baseado no role do usuário
   - Mostra informações do usuário logado

3. **app/(protected)/reports/layout.tsx**: Layout protegido para relatórios
   - Restringe acesso a MANAGER e ADMIN

4. **prisma/seed.ts**: Script de população do banco de dados
   - Cria usuários de teste para cada role
   - Cria teams, clients, projects
   - Cria workflow templates com stages e dependencies
   - Cria tasks de exemplo

### Arquivos Modificados

#### Server Actions Protegidas

1. **lib/actions/template.ts**: Protegido com `requireAdmin()`
2. **lib/actions/stage.ts**: Protegido com `requireAdmin()`
3. **lib/actions/dependency.ts**: Protegido com `requireAdmin()`
4. **lib/actions/task.ts**: Protegido com `requireMemberOrHigher()`
5. **lib/actions/activity.ts**:
   - Start/Stop: `requireMemberOrHigher()`
   - Get Active Logs: `requireManagerOrAdmin()`
6. **lib/actions/reporting.ts**: Já estava protegido com `requireAnyRole()`

#### Páginas Admin Protegidas

1. **app/(protected)/admin/teams/page.tsx**: `requireAdmin()`
2. **app/(protected)/admin/users/page.tsx**: `requireAdmin()`
3. **app/(protected)/admin/clients/page.tsx**: `requireManagerOrAdmin()`
4. **app/(protected)/admin/projects/page.tsx**: `requireManagerOrAdmin()`
5. **app/(protected)/admin/layout.tsx**: `requireManagerOrAdmin()`

#### UI Atualizada

1. **app/page.tsx**: Home page com navegação condicional por role

## Como Usar

### 1. Popular o Banco de Dados

```bash
# Instalar dependências (se ainda não instalado)
npm install

# Executar o seed
npm run db:seed
```

### 2. Usuários de Teste

Após executar o seed, os seguintes usuários estarão disponíveis:

- **Admin**: `admin@work-os.com`
- **Manager**: `manager@work-os.com`
- **Member**: `member@work-os.com`
- **Video Editor**: `video@work-os.com`
- **Copywriter**: `copy@work-os.com`

> **Nota**: Como o sistema usa Google OAuth, você precisará criar contas reais com esses emails ou modificar o seed para usar seus emails reais.

### 3. Testando Permissões

1. **Como ADMIN**:
   - Acesse `/admin/teams` para gerenciar times
   - Acesse `/admin/users` para gerenciar usuários
   - Acesse `/admin/templates` para configurar workflows

2. **Como MANAGER**:
   - Acesse `/admin/clients` para gerenciar clientes
   - Acesse `/admin/projects` para gerenciar projetos
   - Acesse `/reports` para visualizar métricas

3. **Como MEMBER**:
   - Acesse `/admin/tasks` para visualizar tarefas
   - Crie tasks e avance pelos stages
   - Use Start/Stop para rastrear atividade

## Estrutura de Segurança

### Backend (Server Actions)

Todas as Server Actions verificam permissões antes de executar:

```typescript
export async function createTeam(formData: FormData) {
  "use server"
  await requireAdmin()  // ❌ Lança erro se não for ADMIN

  // ... lógica da ação
}
```

### Frontend (Layouts)

Layouts verificam permissões e redirecionam usuários não autorizados:

```typescript
export default async function AdminLayout({ children }) {
  try {
    await requireManagerOrAdmin()
  } catch (error) {
    redirect("/dashboard")  // Redireciona se não tiver permissão
  }

  return <div>{children}</div>
}
```

### UI Condicional

Componentes ocultam elementos que o usuário não pode acessar:

```typescript
{userRole === UserRole.ADMIN && (
  <Link href="/admin/teams">Times</Link>
)}
```

## Workflows de Exemplo

### Simple Video Workflow

1. **Roteiro** (Copywriting Team)
2. **Edição** (Video Team) - *depende de Roteiro*
3. **Revisão** (QC Team) - *depende de Edição*

### Full Production Workflow

1. **Briefing** (Traffic Team)
2. **Criação** (Design Team) - *depende de Briefing*
3. **Aprovação** (QC Team) - *depende de Criação*

## Próximos Passos (v2)

- [ ] Implementar portal do cliente (CLIENT role)
- [ ] Adicionar notificações em tempo real
- [ ] Implementar biblioteca de toast notifications (react-hot-toast)
- [ ] Adicionar loading states com useTransition
- [ ] Implementar empty states em todas as listas
- [ ] Adicionar filtros avançados nos relatórios
- [ ] Implementar dashboard com widgets customizáveis

## Troubleshooting

### Erro: "Access Denied: Insufficient permissions"

Verifique se o usuário tem o role correto no banco de dados:

```sql
SELECT email, role FROM "User";
```

### Seed não funciona

Certifique-se de que:
1. O banco de dados está rodando
2. O arquivo `.env` tem a `DATABASE_URL` correta
3. As migrations foram executadas: `npx prisma migrate dev`

### Navegação não aparece

Verifique se a session está sendo carregada corretamente:
- Certifique-se de que o usuário está autenticado
- Verifique se o role está sendo incluído na session (em `auth.config.ts`)

## Segurança

### Boas Práticas Implementadas

1. ✅ Verificação de permissões no backend (nunca confiar apenas no frontend)
2. ✅ Verificação de permissões no frontend (melhor UX)
3. ✅ Redirecionamento automático para usuários não autorizados
4. ✅ Mensagens de erro claras
5. ✅ Validação de entrada em todas as ações

### Não Implementado (mas recomendado para produção)

- [ ] Rate limiting
- [ ] Logging de ações sensíveis
- [ ] Auditoria de mudanças
- [ ] 2FA (Two-Factor Authentication)
- [ ] Políticas de senha fortes
- [ ] Expiração de sessões
