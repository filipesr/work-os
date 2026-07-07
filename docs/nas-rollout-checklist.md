# Checklist de rollout do NAS (quando o NameService virar)

Runbook operacional para colocar o upload/registro de artefatos no NAS em produção. Executar
**depois** que o NS de `goonmarketing.com` estiver no Cloudflare. Referências:
`docs/superpowers/specs/2026-07-02-nas-artifact-storage-design.md` (Apêndice C — topologia),
`docs/superpowers/specs/2026-07-06-nas-flow-simplification-design.md` (esquema atual) e
`nas-poc/LOCAL-E2E.md` (§Produção).

> **Estado atual:** todo o lado-nuvem está pronto e testado por unidade. O agente roda em LAN
> (E2E local validado). Só falta a exposição externa (túnel) — que depende do NS — e a configuração
> de produção abaixo. **Nada de código novo é necessário para o rollout.**

## 0. Pré-requisitos

- [ ] NS de `goonmarketing.com` já apontando para o Cloudflare (zona ativa).
- [ ] SSL **por subdomínio** no Cloudflare — cada host abaixo precisa da **própria entrada DNS**
      (o certificado não é wildcard). Ver memória `cloudflare-ssl-per-subdomain`.
- [ ] Share SMB do NAS criado (ex.: `\\NAS\WorkOS`) com a **árvore gerenciada read-only** para
      usuários (ACL do ADM: traverse+read; sem write/rename/delete). O **agente é o único escritor**.
- [ ] Cliente(s) com `folderName` definido (auto-derivado do nome ao salvar) — **único pré-requisito
      de upload** no fluxo atual (não há mais gate de campanha).

## 1. Gates de código (fazer no deploy)

- [ ] **Backfill de tarefas legadas:** a Feature 1 removeu o fallback que recriava linhas de etapa.
      Rodar em **produção** o diagnóstico (abaixo) e, se houver tarefas ativas sem `TaskActiveStage`,
      criar as linhas faltantes **antes** de publicar.

```sql
SELECT t.id FROM "Task" t
LEFT JOIN "TaskActiveStage" tas ON tas."taskId" = t.id
WHERE tas.id IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED','OBSOLETE');
```

- [ ] **Índices únicos parciais de versão NAS** por projeto/cliente (rede de segurança adiada; hoje
      só o `@@unique` de TASK existe). Aplicar via SQL manual se quiser a garantia no banco.

## 2. Env de produção — App (Vercel)

Definir com `vercel env add` (ou dashboard) em **Production**. Nomes exatos (de `lib/nas/config.ts`):

| Env                                | Valor / origem                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `NAS_AGENT_URL_LAN`                | `https://nas-agent-lan.goonmarketing.com` (A → IP privado; split-DNS/hairpin) |
| `NAS_AGENT_URL_TUNNEL`             | `https://nas-agent-download.goonmarketing.com` (Cloudflare Tunnel)            |
| `NEXT_PUBLIC_NAS_AGENT_URL_LAN`    | igual ao `NAS_AGENT_URL_LAN` (healthcheck no browser)                         |
| `NEXT_PUBLIC_NAS_AGENT_URL_TUNNEL` | igual ao `NAS_AGENT_URL_TUNNEL`                                               |
| `NAS_TOKEN_SIGNING_KEY`            | **chave privada Ed25519** (app assina o upload/download token)                |
| `NAS_TOKEN_KID`                    | id da chave (rotação por kid)                                                 |
| `NAS_TOKEN_ISSUER`                 | issuer do JWT (ex.: `work.goonmarketing.com`)                                 |
| `NAS_FINALIZE_SECRET`              | segredo HMAC do finalize — **igual ao `FINALIZE_SECRET` do agente**           |
| `NAS_SHARE_BASE_URL`               | `https://work.goonmarketing.com/api/artifacts/share`                          |
| `NAS_UNC_PREFIX`                   | `\\NAS\WorkOS` (compõe o link local "Abrir pasta")                            |
| `SHARE_TOKEN_PEPPER`               | pepper do HMAC dos tokens de share                                            |
| `NAS_SMB_HOST`, `NAS_SMB_SHARE`    | host/share SMB para os links locais                                           |
| `CRON_SECRET`                      | segredo do cron de reconciliação (§6)                                         |

> A **chave pública** correspondente ao `NAS_TOKEN_SIGNING_KEY` vai no agente (`TOKEN_PUBLIC_KEYS`,
> por kid). Gerar o par com `scripts/nas-poc-gen-keys.mjs`.

## 3. Env + deploy do Agente (Docker no NAS)

Rodar o agente (`nas-poc/agent`) em container no NAS (Container Manager/Docker), com restart
automático. Envs (de `nas-poc/.env.example`):

| Env                       | Valor / origem                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGIN`          | origem de produção do app (`https://work.goonmarketing.com`) — CORS/health             |
| `CLOUD_FINALIZE_URL`      | `https://work.goonmarketing.com/api/artifacts/finalize`                                |
| `FINALIZE_SECRET`         | **igual ao `NAS_FINALIZE_SECRET` do app**                                              |
| `TOKEN_PUBLIC_KEYS`       | chave(s) pública(s) por `kid` (JWKS-like) — verifica os tokens do app                  |
| `NAS_SHARE_PATH`          | caminho do share no filesystem do container (ex.: `/volume1/WorkOS`)                   |
| `MAX_UPLOAD_BYTES`        | teto de upload (bate com a allowlist do app)                                           |
| `AGENT_UID` / `AGENT_GID` | usuário **dono da árvore** (users = ACL read-only; só o agente escreve)                |
| `TUNNEL_TOKEN`            | token do Cloudflare Tunnel (só se o cloudflared rodar no mesmo compose)                |
| `STATE_DIR`               | estado persistente (jti/fila de finalize/auditoria). Default `{NAS_ROOT}/.agent-state` |
| `RECONCILE_TOKEN`         | auth (Bearer) dos endpoints `/v1/reconcile/*` (LAN). Sem ele → 503                     |
| `TMP_TTL_MS`              | TTL de `.uploading-*.tmp` órfãos p/ o reconcile cleanup (default 24h)                  |

- [ ] Imagem **versionada** em registry (rollback); `version` exposta no `/health`.
- [ ] **Dois listeners:** porta LAN (upload/download/health/reconcile) e porta túnel (**só**
      `GET /v1/download`).
- [ ] Volume do share montado; processo roda como `AGENT_UID:AGENT_GID` dono da árvore.

> **Frente B:** o agente **não muda** — ele grava no `nasPath` que o token manda. O novo esquema de
> pastas (`{cliente}/institucional`, `{cliente}/{projeto|tarefa ~id}/institucional`) é calculado no
> app. O `nas-poc/agent/src/nas-path.ts` (PoC) está desatualizado mas **não é usado em runtime**.

## 4. Cloudflare Tunnel + DNS (por subdomínio)

- [ ] `nas-agent-lan.goonmarketing.com` → **A** para o **IP privado** do NAS (split-DNS/hairpin na
      LAN; VPN com rota privada funciona transparente). Não passa pelo túnel.
- [ ] `nas-agent-download.goonmarketing.com` → **Cloudflare Tunnel** para a porta-túnel do agente,
      **restrito a `GET /v1/download`** (regra do Tunnel por path/método). O `POST /v1/uploads`,
      `GET /v1/health` e `POST /v1/reconcile` ficam **só na LAN**.
- [ ] Cada subdomínio com sua própria entrada DNS (SSL por host).

## 5. TLS

- [ ] Certificado do host **LAN** (`nas-agent-lan…`) via **Let's Encrypt DNS-01** (o host não é
      público; DNS-01 valida sem HTTP-01). TLS terminado no agente ou em proxy reverso no NAS.
- [ ] O host de download usa o TLS do Cloudflare Tunnel.

## 6. Reconciliação de uploads travados

**Topologia importante:** a Vercel roda na nuvem e o agente fica em **IP privado (LAN)** — a Vercel
**não alcança** o agente. Só o _navegador_ (na LAN) e o _agente_ (saída p/ internet) atravessam a
fronteira. Logo, a recuperação de um upload cujo `finalize` se perdeu é feita **por push do agente**,
não por pull da Vercel.

- [ ] **Push de finalize resiliente (principal):** o agente reenfileira o `finalize` numa fila
      **persistente** (sobrevive a restart) e reintenta até a Vercel responder. É o canal confiável
      (agente → URL pública da Vercel). Ajustar `MAX_ATTEMPTS`/backoff para praticamente não desistir.
- [ ] **Cron de expiração (última rede):** cron do Vercel chamando `/api/cron/nas-reconcile` expira
      `PENDING/UPLOADING` **muito** vencidos (TTL generoso, para não falsear um arquivo que o push
      ainda vai confirmar). Autenticado por `CRON_SECRET`.
- [ ] **Recuperação pelo usuário (UI):** ações **Reenviar** / **Remover** em artefatos não-READY
      (independem de topologia).

### Opção futura — pull-reconcile server-side via túnel (NÃO implementado)

O agente já expõe **`POST /v1/reconcile/status`** (recebe `[{artifactId, nasPath}]`, devolve
`[{artifactId, exists, sizeBytes}]`) — hoje **só no listener LAN** (porta 8080), por segurança. Para
a **Vercel** consultar o agente e reconciliar de forma automática/determinística (arquivo presente →
READY; ausente e vencido → FAILED), seria preciso **expor esse endpoint pelo túnel**:

- Adicionar a rota `POST /v1/reconcile/status` ao listener do **túnel** (porta 8081), hoje restrito a
  `GET /v1/download`, **e** proteger com `RECONCILE_TOKEN` + (idealmente) Cloudflare Access.
- **Trade-off:** aumenta a superfície pública do agente. Por isso fica como opção, não default — o
  push resiliente + a UI já cobrem o caso comum sem abrir mais nada.
- A primitiva (`checkArtifactFiles` / rota LAN) já está pronta e testada; só falta a exposição.

## 7. Verificação pós-deploy (smoke)

- [ ] `GET /v1/health` (LAN) → `ok:true, writable:true, freeBytes`, `version` ≥ mínima.
- [ ] **Upload por escopo** cai na pasta certa (nome vem do ARQUIVO enviado; conferir no
      Explorer/Finder):
  - Cliente → `{cliente}/institucional/{tipoMidia}/{Arquivo}_v01.ext`
  - Projeto → `{cliente}/{projeto ~id}/institucional/{tipoMidia}/{AAAA_MM}_{Arquivo}_v01.ext`
  - Tarefa → `{cliente}/{tarefa ~id}/institucional/{tipoMidia}/{AAAA_MM}_{Arquivo}_v01.ext`
  - **Versão:** reenviar o mesmo nome → `_v02`; nome diferente → artefato novo (`_v01`).
- [ ] **Download interno** LAN (302 → agente) com Range (`206`).
- [ ] **Share CLIENTE** via túnel (senha/expiração); INTERNO/CONFIDENCIAL **sem** share/externo.
- [ ] **Segurança do túnel:** externo `GET /v1/download` OK; `POST /v1/uploads`, `GET /v1/health`,
      `POST /v1/reconcile` **negados**.
- [ ] Caminho SMB real abre no Explorer/Finder (link "Abrir pasta").

## 8. Rollback

- [ ] Imagem do agente versionada → voltar à anterior no Container Manager.
- [ ] App: reverter as env (o app degrada com elegância — a aba Upload NAS mostra "agente não
      encontrado" e o link continua funcionando).
