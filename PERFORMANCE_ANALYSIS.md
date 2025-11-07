# Análise de Performance - Dashboard

## 🔴 Problemas Críticos Identificados

### 1. **Query N+1 em Server Components**

**Problema:**
```typescript
// Cada linha da tabela chama getTranslations() individualmente
async function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const t = await getTranslations("dashboard.priority"); // ❌ Chamado 20+ vezes
  // ...
}

async function ActiveStageRow({ activeStage }: { ... }) {
  const t = await getTranslations("dashboard"); // ❌ Chamado 20+ vezes
  // ...
  <PriorityBadge priority={task.priority} /> // ❌ Mais 1 getTranslations
  // ...
}
```

**Impacto:** Se há 20 active stages, gera **60+ chamadas** de tradução

**Solução:** Passar traduções como props ou usar Client Components com useTranslations

---

### 2. **Queries Pesadas no Dashboard**

**Linha 384-446:**
```typescript
const [myActiveStages, teamBacklogStages, stats] = await Promise.all([
  getMyActiveStages(),        // Query 1: Busca todas minhas stages ativas
  getTeamBacklog(teamId),     // Query 2: Busca backlog do time
  prisma.$transaction(...)    // Query 3: 4 sub-queries para stats
]);
```

**Análise:**
- `getMyActiveStages()`: Provavelmente tem includes profundos (task → project → client, stage → template → defaultTeam)
- `getTeamBacklog()`: Similar ao anterior
- Stats transaction: 4 queries de agregação

**Tempo estimado (sem otimização):**
- getMyActiveStages: 200-500ms
- getTeamBacklog: 200-500ms
- stats transaction: 150-300ms
- **Total: 550-1300ms** (mesmo em paralelo, limitado pela query mais lenta)

---

### 3. **Falta de Indexes no Prisma**

**Queries que precisam de indexes:**
```sql
-- Query em getMyActiveStages()
SELECT * FROM TaskActiveStage
WHERE assigneeId = ? AND status = 'ACTIVE';

-- Query em stats
SELECT COUNT(*) FROM TaskActiveStage
WHERE assigneeId = ? AND status = 'ACTIVE';

-- Query em teamBacklog
SELECT * FROM TaskActiveStage
WHERE stageId IN (...) AND assigneeId IS NULL AND status = 'ACTIVE';
```

**Indexes necessários:**
```prisma
model TaskActiveStage {
  // ...
  @@index([assigneeId, status])
  @@index([stageId, assigneeId, status])
  @@index([status, completedAt]) // Para query de completedThisWeek
}
```

---

### 4. **Falta de Caching**

**O que deveria ser cacheado:**
- ✅ Stats cards (cache de 2-5 minutos)
- ✅ Team backlog (cache de 1 minuto)
- ❌ My active stages (não cachear - precisa ser real-time)

---

## 📊 Comparação de Abordagens

### Opção A: Otimização de Queries + Skeleton Loaders

**Tempo de carregamento:**
- Initial render: 50ms (skeleton aparece imediatamente)
- Data fetch otimizado: 150-300ms
- Total percebido: **150-300ms** ⚡

**Prós:**
- Melhor UX percebida (loading instantâneo)
- Dados reais carregados em segundo plano
- Usuário pode ver estrutura da página imediatamente

**Contras:**
- Mais código (componentes skeleton)
- Layout shift se skeleton não for preciso

---

### Opção B: Apenas Otimização de Queries

**Tempo de carregamento:**
- Tela branca: 150-300ms
- Total percebido: **150-300ms**

**Prós:**
- Menos código
- Sem layout shift

**Contras:**
- Tela branca por 150-300ms
- UX inferior para conexões lentas

---

### Opção C: Streaming com Suspense (Recomendado) ✅

**Tempo de carregamento:**
- Header + skeleton: 10ms
- Stats: +50ms (stream 1)
- My active stages: +100ms (stream 2)
- Team backlog: +100ms (stream 3)
- Total: **260ms** mas progressivo ⚡⚡

**Prós:**
- Melhor UX (progressive loading)
- Usuário vê conteúdo parcial rapidamente
- Aproveita React 18 Suspense
- Sem layout shift (boundaries bem definidos)

**Contras:**
- Requer React 18+ e Next.js 13+
- Mais complexidade arquitetural

---

## 🎯 Plano de Otimização Recomendado

### Fase 1: Quick Wins (1-2 horas)

1. ✅ **Ajustar navbar** - Remover links duplicados
2. ✅ **Adicionar indexes** - TaskActiveStage
3. ✅ **Otimizar getTranslations** - Passar como props
4. ✅ **Cache de stats** - Redis ou in-memory (2min TTL)

**Impacto esperado:** 550ms → 200ms (64% mais rápido)

---

### Fase 2: Skeleton Loaders (2-3 horas)

1. ✅ Criar `<DashboardSkeleton />` component
2. ✅ Criar `<StatsCardSkeleton />` component
3. ✅ Criar `<TableSkeleton />` component
4. ✅ Implementar Suspense boundaries

**Impacto esperado:** Perceived load time: 200ms → 50ms (75% melhor UX)

---

### Fase 3: Streaming + Advanced Caching (4-6 horas)

1. ✅ Implementar React Server Components streaming
2. ✅ Cache com revalidação (Next.js revalidate)
3. ✅ Implementar incremental static regeneration
4. ✅ Optimistic UI updates

**Impacto esperado:** Progressive loading + cache hits 90%+

---

## 💡 Código de Referência

### Skeleton Loader Example:

```tsx
// components/dashboard/DashboardSkeleton.tsx
export function StatsCardSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-card p-4 rounded-lg border shadow-sm animate-pulse">
          <div className="h-4 bg-muted rounded w-24 mb-2" />
          <div className="h-8 bg-muted rounded w-12" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />
      ))}
    </div>
  );
}
```

### Streaming with Suspense:

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <div>
      <Header />

      <Suspense fallback={<StatsCardSkeleton />}>
        <StatsCards />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <MyActiveStages />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <TeamBacklog />
      </Suspense>
    </div>
  );
}
```

### Cached Stats with Revalidation:

```tsx
// lib/actions/stats.ts
export async function getUserStats(userId: string) {
  return await prisma.taskActiveStage.count({
    where: { assigneeId: userId, status: 'ACTIVE' },
    // Next.js will cache this for 2 minutes
  });
}

// app/dashboard/page.tsx
export const revalidate = 120; // 2 minutes
```

---

## 📈 Resultados Esperados

| Métrica | Antes | Depois Fase 1 | Depois Fase 2 | Depois Fase 3 |
|---------|-------|---------------|---------------|---------------|
| **TTFB** | 550ms | 200ms | 200ms | 50ms (cache) |
| **FCP** | 550ms | 200ms | 50ms | 50ms |
| **LCP** | 600ms | 250ms | 150ms | 100ms |
| **TTI** | 700ms | 300ms | 200ms | 150ms |
| **Perceived Load** | 🔴 550ms | 🟡 200ms | 🟢 50ms | 🟢 50ms |

---

## 🎨 Comparação Visual

### Antes (Tela Branca):
```
[Carregando...] → 550ms → [Dashboard completo]
```

### Depois com Skeleton:
```
[Header + Skeletons] → 50ms → [Stats] → +50ms → [Tables] → +100ms → [Completo]
```

### Depois com Streaming:
```
[Header] → 10ms
[Stats Skeleton] → 20ms → [Stats Reais] → 50ms
[Table Skeleton 1] → 30ms → [Minhas Tarefas] → 100ms
[Table Skeleton 2] → 30ms → [Backlog Time] → 100ms
Total perceived: 10ms (usuário vê algo útil imediatamente)
```

---

## 🚀 Implementação Recomendada

**Para melhor UX com menor esforço:**

1. **Imediatamente:**
   - Ajustar navbar (30min)
   - Adicionar indexes (15min)
   - Otimizar getTranslations (1h)

2. **Esta Sprint:**
   - Implementar skeleton loaders (2-3h)
   - Cache básico de stats (30min)

3. **Próxima Sprint:**
   - Streaming com Suspense (4-6h)
   - Cache avançado com Redis (2-3h)

**ROI:** Alta melhoria de UX com investimento moderado de tempo
