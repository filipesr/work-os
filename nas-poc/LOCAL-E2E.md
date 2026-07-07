# E2E local do upload/download no NAS (sem Cloudflare/NS)

Testa o fluxo completo **navegador → agente (LAN) → filesystem** + **finalize (agente → cloud)** +
**download**, tudo em `http://localhost` — **não** depende da transferência de NS nem de TLS/Tunnel.
Em produção só mudam as URLs (nomes públicos) e o cert; a lógica é a mesma.

## O que já foi validado automaticamente

- **Testes de contrato** (`__tests__/lib/nas/agent-contract.test.ts`): o token que o app assina é
  verificável sob as regras do agente; o HMAC do finalize computado pelo agente é idêntico ao que o
  app espera. (`pnpm test`)
- **Testes do agente** (`nas-poc/agent`): finalize (assinatura/retry), token, path. (`cd nas-poc/agent && npx vitest run`)
- **Smoke manual** (feito uma vez): PUT assinado → `201` + arquivo gravado no caminho determinístico
  → `finalized:true` com HMAC válido no mock do cloud → GET full `200` + Range `206`.

## Passo a passo (tutorado — cada passo, confirme antes de seguir)

### 0. Gerar chaves + env

```bash
node scripts/nas-local-e2e-setup.mjs
```

Gera o par Ed25519 (`nas-poc/keys/local-1.*`), o `nas-poc/agent/run-local.sh` e imprime um bloco de
env. **Cole o bloco no `work-os/.env.local`.** (A chave privada assina no app; a pública verifica no
agente — como em produção, só que por HTTP.)

### 1. Subir o agente (terminal 1)

```bash
bash nas-poc/agent/run-local.sh
# espere: "agent up — LAN 0.0.0.0:8080, TUNNEL 127.0.0.1:8081"
curl -s http://localhost:8080/v1/health   # ok:true, writable:true, kids:["local-1"]
```

### 2. Subir o app (terminal 2)

```bash
pnpm dev      # reinicie se já estava rodando, para carregar o .env.local
```

### 3. Preparar os dados (uma vez, pela tela — MANAGER/ADMIN)

- **Admin › Propósitos de entregável**: cadastre ao menos um (ex.: `Banner Web`).
- **Projeto** (tela do projeto): no card _Armazenamento no NAS_, preencha campanha
  (slug/ano/mês) e marque **Habilitar upload no NAS** → Salvar.
- **Cliente**: confirme que tem _Pasta no NAS_ (gera do nome automaticamente ao salvar).

### 4. Testar na demanda (fluxo das etapas)

- Abra uma demanda do projeto habilitado → seção de artefatos → aba **Upload NAS**.
- O form faz o healthcheck do agente (verde = LAN ok). Escolha arquivo + tipo de mídia + propósito +
  destino/sensibilidade → **Enviar ao NAS**.
- Barra de progresso → "finalizando" → a lista atualiza para **READY**.
- Verifique o arquivo em `nas-poc/local-store/<Cliente>/...` com o nome versionado.

### 5. Download

- Na lista de artefatos, um artefato NAS **Pronto** mostra o botão **Baixar** — ele faz a corrida
  LAN/tunnel e navega para `/api/artifacts/[id]/download?net=…` (302 pro agente; LAN direto, ou
  túnel só para `CLIENTE` fora da LAN).
- **Share público** (só `CLIENTE`): a action `createShareLink` já existe e o endpoint
  `/api/artifacts/share/[token]` funciona (validado por smoke), mas o **botão de share na lista
  ainda não foi construído** — é a cauda restante da Fase 5.

## Produção (quando o NS virar)

Nada muda no código. Ajuste só as env (nomes públicos + cert):

- App: `NAS_AGENT_URL_LAN=https://nas-agent-lan.goonmarketing.com`,
  `NAS_AGENT_URL_TUNNEL=https://nas-agent-download.goonmarketing.com`, `NEXT_PUBLIC_*` idem,
  `NAS_SHARE_BASE_URL=https://workos.goonmarketing.com/api/artifacts/share`.
- Agente: rodar em HTTPS (cert Let's Encrypt DNS-01 do host LAN), `ALLOWED_ORIGIN` = origem de prod,
  `CLOUD_FINALIZE_URL=https://workos.goonmarketing.com/api/artifacts/finalize`, `TUNNEL_TOKEN` do
  Cloudflare. Ver `docs/superpowers/specs/2026-07-02-nas-artifact-storage-design.md` (Apêndice C).
