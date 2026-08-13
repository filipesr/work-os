# Sessão autenticada nos testes e2e

O app usa **sessões em banco** (`PrismaAdapter`): o cookie `workos.session-token`
guarda apenas um token opaco que aponta para uma linha de `Session`. Isso abre um
caminho melhor que exportar cookie do navegador — dá para **criar a sessão por
script**, sem browser e sem passo manual.

## ⚠️ Antes de tudo: contra qual banco?

`pnpm dev` aponta para o `DATABASE_URL` do `.env`, que hoje é o **Neon de
produção**. Os testes atuais são todos de leitura em rotas anônimas, então não
tocam em nada. **Testes autenticados que clicam em "criar" gerariam dado real.**

Antes de escrever e2e que escrevem, é preciso um banco separado:

```bash
DATABASE_URL="postgres://…banco-de-teste" pnpm dev
```

Enquanto isso não existir, mantenha os e2e autenticados em **leitura apenas**
(abrir tela, conferir que renderiza, checar rótulos).

## Opção A — sessão por script (recomendada)

Sem navegador, sem exportar nada, funciona em CI e não expira no meio da semana.

```bash
pnpm e2e:session          # cria a sessão e grava e2e/.auth/state.json
pnpm e2e                  # os testes autenticados reusam esse estado
```

O script insere uma `Session` com token aleatório para o usuário informado
(`E2E_USER_EMAIL`, padrão: o primeiro ADMIN) e escreve o `storageState` que o
Playwright entende.

## Opção B — exportar o cookie do navegador (manual)

Serve para um teste pontual; expira e precisa ser refeito.

1. Suba o app: `pnpm dev` (porta **3100**).
2. No Firefox, abra `http://localhost:3100` e faça login com o Google.
3. `F12` → aba **Armazenamento** → **Cookies** → `http://localhost:3100`.
4. Ache `workos.session-token` e copie o **valor** (o token opaco).
5. Crie `e2e/.auth/state.json`:

```json
{
  "cookies": [
    {
      "name": "workos.session-token",
      "value": "COLE_O_VALOR_AQUI",
      "domain": "localhost",
      "path": "/",
      "httpOnly": true,
      "secure": false,
      "sameSite": "Lax",
      "expires": -1
    }
  ],
  "origins": []
}
```

> `domain` é `localhost` **sem porta** — cookie não distingue porta.
> O `script` grava **dois** cookies com o mesmo token: `workos.session-token` e
> `__Secure-workos.session-token`. Ver abaixo por quê.

6. `pnpm e2e`.

## Rodar contra um build de produção

Necessário para medir desempenho: em `pnpm dev` cada rota compila sob demanda e o
tempo não significa nada. Duas armadilhas, ambas com o mesmo sintoma enganoso —
a página responde **200** e parece funcionar, porque o casco do streaming sai
antes dos dados; a falha só aparece depois, como `Not Authenticated` no log do
servidor e `net::ERR_ABORTED` no Playwright.

1. **Nome do cookie.** `auth.config.ts` escolhe por `NODE_ENV`, e `next start`
   roda em produção mesmo em localhost — o cookie vira `__Secure-workos.session-token`.
   Por isso a fixture grava os dois nomes: cada servidor lê o que espera.
2. **Host confiável.** Fora da Vercel o Auth.js não confia no host sozinho.

```bash
npm run build
AUTH_TRUST_HOST=true NEXTAUTH_URL=http://localhost:3100 npx next start -p 3100
E2E_BASE_URL=http://localhost:3100 npx playwright test perf --reporter=list
```

## Segurança

`e2e/.auth/` está no `.gitignore`. O arquivo contém uma **credencial de sessão
real** — quem o tiver entra como aquele usuário. Não commitar, não colar em
issue, não anexar em print.
