# NAS PoC — spike de viabilidade (antes de implementar no work-os)

Valida e **metrifica** o caminho `browser (LAN) → agente no NAS → filesystem` + download externo via
Cloudflare Tunnel, com arquivos de tipos/tamanhos/clientes/campanhas variados. Código isolado do
work-os de produção. Ver o plano em `~/.claude/plans/` e o design em
`docs/superpowers/specs/2026-07-02-nas-artifact-storage-design.md`.

**Metas (aprovado/reprovado):** upload LAN **≥ 85 MB/s** no 5 GB · download por túnel **≥ 10 MB/s** ·
túnel só aceita `GET /v1/download`.

## Como vamos tocar (modo tutorado)

Eu escrevo o código; **você executa os comandos SSH / passos de GUI no NAS e no Cloudflare**. SSH está
habilitado (porta 22, conta admin do ADM), então o deploy é por linha de comando; só a criação de
share/usuário/ACL fica na GUI do ADM, onde é mais simples. Cada etapa abaixo é um **checkpoint**: faça,
confira o "resultado esperado" e me diga **ok** ou **cole o erro**. Não avance em cima de etapa não confirmada.

---

## O que já está pronto (feito por mim, testado local)

- `nas-poc/agent/` — agente Node/TS (Fastify), 2 listeners, JWT EdDSA, temp→rename→sha256, download+Range.
  35 testes passando; smoke local ok.
- `scripts/nas-poc-gen-keys.mjs` — gera o par de chaves.
- `scripts/nas-poc-loadtest.mjs` — carga + métricas (CSV em `nas-poc/out/`).
- `nas-poc/docker-compose.yml`, `.env.example`, `agent/cloudflared/config.yml`.

## Passo 0 — Gerar as chaves (na sua máquina de dev)

```bash
node scripts/nas-poc-gen-keys.mjs
```

- Escreve `nas-poc/keys/poc-key-1.private.pem` (fica só com você) e `.public.pem`.
- Imprime a linha `TOKEN_PUBLIC_KEYS=[...]` — **guarde**, vai no env do agente.
- **Resultado esperado:** dois arquivos em `nas-poc/keys/` + a linha impressa.

---

## Fase A1 — Preparar o NAS (ADM 4.x) — GUI

1. **App Central** → instalar **Docker Engine** e **Portainer CE** (instala o Docker junto se faltar).
   - _Resultado:_ ícones do Docker Engine e Portainer no Desktop do ADM.
   - _Se falhar:_ confirme ADM ≥ 4.3.1 (Configurações → ADM Update). Me diga a versão se travar.
2. **Access Control → Shared Folders → Create** → nome **`WorkOS-PoC`**, no `volume1`.
   - _Resultado:_ pasta criada; caminho no sistema `/volume1/WorkOS-PoC`.
3. **Access Control → Local Users** → criar usuário de serviço **`svc-nasagent`**.
   **Local Groups** → criar grupo **`workos-ro`** (coloque nele os colaboradores que só vão ler).
4. Voltar em **Shared Folders → WorkOS-PoC → Access Rights**:
   - `svc-nasagent` = **Read & Write**;
   - grupo `workos-ro` = **Read Only**.
   - Para travar rename/delete, use **ACL avançada (Windows ACL)** na aba do folder (permitir apenas
     _Traverse/Read_).
   - _Resultado:_ só `svc-nasagent` escreve; o resto lê.
5. **Services → Windows/SMB**: ativo. Anote o IP do NAS e os caminhos que a UI vai gerar:
   `\\IP\WorkOS-PoC` (Windows) e `smb://IP/WorkOS-PoC` (macOS).
6. Descobrir o **uid/gid** do `svc-nasagent` (vai no `.env`): no SSH, `id svc-nasagent`.
   - _Resultado:_ um par tipo `uid=1001 gid=100`.

> **Checkpoint A1:** me confirme (a) versão do ADM, (b) que a pasta `WorkOS-PoC` existe, (c) o uid/gid do
> `svc-nasagent`. Com isso eu fecho seu `.env`.

---

## Fase A2 — Build + deploy do agente via SSH

Pré: Fase A1 feita (share `WorkOS-PoC`, usuário `svc-nasagent`, ACL) e SSH habilitado.
(Portainer fica só como painel opcional de monitoramento — ver containers/logs no navegador.)

1. **Descubra o uid/gid do serviço** — no SSH do NAS:
   ```bash
   id svc-nasagent          # anote uid=... gid=...
   ```
2. **Copie o código do PoC para o NAS** — no seu Mac, na raiz do work-os (troque `USUARIO`):
   ```bash
   rsync -av --exclude node_modules --exclude dist --exclude keys --exclude out \
     nas-poc/ USUARIO@192.168.200.216:nas-poc/
   ```
   _Sem rsync no NAS? Use `scp -r nas-poc USUARIO@192.168.200.216:~/`._
3. **Configure o `.env`** — no SSH do NAS:
   ```bash
   cd ~/nas-poc && cp .env.example .env && vi .env    # ou nano
   ```
   Preencha: `NAS_SHARE_PATH=/volume1/WorkOS-PoC`, `AGENT_UID`/`AGENT_GID` (passo 1),
   `POC_HASH_MODE=inline`, `TOKEN_PUBLIC_KEYS=` (a linha do Passo 0). Deixe `TUNNEL_TOKEN` vazio (Fase A4).
4. **Suba só o agente** (build acontece na NAS) — no SSH:
   ```bash
   docker compose up -d --build agent
   docker compose logs -f agent      # espere: "agent up — LAN 0.0.0.0:8080 ..."  (Ctrl-C p/ sair do log)
   ```

   - _Se `docker compose` não existir:_ tente `docker-compose ...` (v1) — ou me avise; a Docker Engine 28 traz o v2.
   - _Se `EADDRINUSE :8080`:_ algo já usa a 8080 no NAS — me avise que troco a `LAN_PORT` no compose.
   - _Se erro de permissão ao gravar:_ `AGENT_UID/GID` não bate com o dono de `WorkOS-PoC` — reveja A1.
5. **Sanidade** — do NAS ou do seu Mac:
   ```bash
   curl http://192.168.200.216:8080/v1/health
   ```

   - _Esperado:_ `{"ok":true,...,"writable":true,"freeBytes":...,"hashMode":"inline"}`.

> **Checkpoint A2:** me cole a saída do `/v1/health`. Se `writable:false` ou `freeBytes` baixo,
> resolvemos antes de medir.

---

## Fase A3 — Rodar a carga na LAN (métricas reais)

Do seu PC na LAN, apontando para o NAS:

```bash
# smoke rápido primeiro (valida o fluxo):
NAS_POC_PRIVATE_KEY=nas-poc/keys/poc-key-1.private.pem \
AGENT_LAN_URL=http://IP_DO_NAS:8080 PROFILE=smoke node scripts/nas-poc-loadtest.mjs

# depois o real (move GBs — rode na LAN, com espaço livre suficiente):
NAS_POC_PRIVATE_KEY=nas-poc/keys/poc-key-1.private.pem \
AGENT_LAN_URL=http://IP_DO_NAS:8080 PROFILE=full CONCURRENCY=1,2,4 node scripts/nas-poc-loadtest.mjs
```

- _Resultado:_ tabela com MB/s + p50/p95 por tamanho/concorrência, veredito da meta de 85 MB/s, e um CSV
  em `nas-poc/out/`.
- **Se ficar abaixo de 85 MB/s no 5 GB:** rode de novo com o agente em `POC_HASH_MODE=off` — no SSH:
  edite `~/nas-poc/.env` e `docker compose up -d agent` — para ver se o gargalo é o **sha256 na CPU ARM**.
  Isso decide se, na produção, o hash fica inline ou deferido.

> **Checkpoint A3:** me mande o CSV / o resumo impresso. Analisamos juntos e ajustamos os limites do spec.

---

## Fase A4 — Cloudflare Tunnel (expor só o download)

1. Ter um domínio no Cloudflare + **Zero Trust** ativo.
2. Zero Trust → **Networks → Tunnels → Create a tunnel** (Cloudflared) → nomeie → copie o **token**.
3. No SSH: ponha o token em `~/nas-poc/.env` (`TUNNEL_TOKEN=...`) e `docker compose up -d` (sobe o `cloudflared`).
4. Ainda no tunnel → **Public Hostnames → Add**:
   - Subdomain `nas-agent-download`, seu domínio;
   - **Path** `v1/download` (ou regex `^/v1/download` na versão avançada);
   - **Service** `HTTP` → `agent:8081`.
5. **Camada 2 (edge) — WAF só GET:** painel do domínio → **Security → WAF → Custom rules → Create**:
   - Se `(http.host eq "nas-agent-download.SEU_DOMINIO" and http.request.method ne "GET")` → **Block**.
   - _Por quê:_ o ingress do Cloudflare casa path, **não método**. Essa regra + o listener do agente
     (que só monta GET) garantem "só GET".
   - _Resultado:_ DNS `nas-agent-download.SEU_DOMINIO` criado automaticamente (CNAME do tunnel).

> **Checkpoint A4:** me diga o hostname final. Rodo/rodamos o smoke de segurança abaixo.

**Fase A5 — Smoke de segurança (de FORA da LAN, ex.: 4G no celular/tethering):**

```bash
# baixar precisa de um download token — gere apontando o loadtest pro túnel:
AGENT_TUNNEL_URL=https://nas-agent-download.SEU_DOMINIO ... node scripts/nas-poc-loadtest.mjs
# e teste manual os métodos negados:
curl -X PUT  https://nas-agent-download.SEU_DOMINIO/v1/download   # esperado: bloqueado (403/405)
curl -i      https://nas-agent-download.SEU_DOMINIO/v1/health     # esperado: 404
```

- _Resultado esperado:_ `GET /v1/download?token=...` funciona (200/206); `PUT`/`POST`/`/v1/health`
  **negados**.

> **Checkpoint A5:** confirme os 3 resultados (download ok, PUT negado, health 404) e o MB/s do túnel.

---

## Fase D — Windows vs macOS (link local)

Ver `nas-poc/link-format/` (helper + página de teste). Depois de A2 pronto:

- Monte `WorkOS-PoC` **read-only** no Explorer (Windows) e no Finder (macOS); tente criar/renomear um
  arquivo → deve **falhar** (só leitura).
- Abra `nas-poc/link-format/test.html` nos dois SO: ele detecta o SO, deixa você trocar, e mostra o
  caminho no formato certo (`\\...` no Windows, `smb://...` no macOS). Copie e cole no Explorer/Finder →
  deve abrir a pasta.
- Rode o load-test a partir dos dois SO e compare.

---

## Limpeza

- Parar: Portainer → Stacks → `nas-poc` → **Stop/Remove**.
- Chaves e CSVs ficam em `nas-poc/keys/` e `nas-poc/out/` (git-ignored).
