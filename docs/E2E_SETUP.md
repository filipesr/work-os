# E2E (Playwright) setup

Estrutura criada em `e2e/` + `playwright.config.ts`. Antes do primeiro run:

## Instalação

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

## Scripts

Adicionar ao `package.json`:

```json
"scripts": {
  "e2e": "playwright test",
  "e2e:ui": "playwright test --ui",
  "e2e:install": "playwright install --with-deps chromium"
}
```

## Banco de teste

Os testes assumem que `DATABASE_URL` aponta pra um banco com dados (idealmente
o demo seed). Pra rodar isolado:

```bash
DATABASE_URL=... pnpm demo:reset && pnpm demo:seed
pnpm e2e
```

## Como rodar

```bash
pnpm e2e                 # roda contra dev server (sobe sozinho)
E2E_BASE_URL=https://my-preview.vercel.app pnpm e2e   # contra preview deploy
```

## O que está coberto

`e2e/smoke.spec.ts` — fluxo mínimo de saúde:

- Redirect de `/dashboard` pra `/auth/signin` quando deslogado
- Página de signin renderiza
- HTML tem `lang` válido

## Próximos testes (não escritos ainda)

Fluxo completo com login real precisa de auth mock — sugerir um dos
caminhos:

1. **Sessão fake via cookie**: criar uma rota `/api/test/session` (só em
   `NODE_ENV=test`) que injeta cookie de sessão NextAuth pra um user seed.
2. **Mock Google OAuth**: usar `nock` ou interceptar request no Playwright.
3. **Login direto via API**: `signIn` programático passando credenciais.

Cada um tem trade-offs. Pra piloto interno, opção 1 é a mais barata.

Fluxos prioritários quando auth estiver mockada:

- Criar task → atribuir → completar etapa → ver fork ativado
- Logar tempo manualmente
- Mudar locale (pt-BR ↔ es-ES)
