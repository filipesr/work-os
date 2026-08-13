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
> `secure: false` porque o dev é http; em produção o nome ganha o prefixo
> `__Secure-` e exige https.

6. `pnpm e2e`.

## Segurança

`e2e/.auth/` está no `.gitignore`. O arquivo contém uma **credencial de sessão
real** — quem o tiver entra como aquele usuário. Não commitar, não colar em
issue, não anexar em print.
