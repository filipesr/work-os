# Sentry setup

Hoje o projeto **não tem Sentry instalado**. O code base está preparado pra plugar
quando você decidir ativar — `lib/logger.ts` expõe `logger.captureError(err, ctx)`
e `lib/env.ts` já valida `SENTRY_DSN` opcional. Quando ativar, é troca cirúrgica.

## Passos pra ativar

### 1. Criar projeto no Sentry

1. Acesse https://sentry.io, crie um projeto **Next.js**.
2. Copie o **DSN** (formato `https://xxx@oNNN.ingest.sentry.io/PROJ`).

### 2. Instalar SDK

```bash
pnpm add @sentry/nextjs
```

### 3. Rodar o wizard (opcional, automatiza configs)

```bash
pnpm dlx @sentry/wizard@latest -i nextjs
```

O wizard cria:

- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts` na raiz
- Modifica `next.config.ts` pra usar `withSentryConfig`

### 4. Configurar env vars

```bash
# .env
SENTRY_DSN="https://...@o000000.ingest.sentry.io/0000000"
NEXT_PUBLIC_SENTRY_DSN="https://...@o000000.ingest.sentry.io/0000000"
```

Na Vercel:

```bash
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

### 5. Plugar no logger

Edite `lib/logger.ts` e substitua o corpo de `captureError`:

```ts
import * as Sentry from "@sentry/nextjs";

captureError: (error: unknown, context?: Record<string, unknown>) => {
  console.error(error, context);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
},
```

### 6. Cobrir áreas críticas

Trocar `logger.error` por `logger.captureError` nos catch blocks de:

- `lib/actions/task.ts` — todas as server actions (cada `catch` é um candidate)
- `lib/actions/stage.ts`
- `lib/actions/project.ts`
- `app/api/proxy-image/route.ts`
- `app/[locale]/(tv)/tv/page.tsx`
- Qualquer error boundary (`error.tsx`)

### 7. Filtrar PII (LGPD)

Em `sentry.client.config.ts` e `sentry.server.config.ts`:

```ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // remover email / nome do payload
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    return event;
  },
});
```

### 8. Validar

1. Force um throw em uma server action de teste.
2. Confira no dashboard Sentry que o evento chegou com stack trace.
3. Se for prod-build, conferir que source maps foram enviados (Vercel + Sentry
   integration faz automaticamente quando o `SENTRY_AUTH_TOKEN` está nas env vars).
