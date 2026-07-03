# Design — Envio e registro de artefatos no NAS (Asustor AS3304T v2)

**Data:** 2026-07-02
**Status:** spec revisado (3 rodadas de code-review), aprovado — pendente plano de implementação
**Stack alvo:** Next.js 15 (Vercel) · Prisma 6 · NAS Asustor AS3304T v2 (ADM 4) · agente Node.js no NAS

## Context

Hoje o work-os só registra artefatos como **links** (URLs). O upload de arquivo (Cloudinary/
`addFileArtifact`) foi removido na 2.2.0. A empresa adquiriu um **Asustor AS3304T v2** (já em uso na
LAN) e quer que, **na execução de uma etapa da demanda**, os artefatos sejam enviados/registrados
diretamente no NAS, seguindo o **padrão de pastas e nomes** da empresa, com **dois links** (local na LAN
e web externo), respeitando **segurança/sensibilidade** e **sem diretórios navegáveis** pelo sistema.

Restrições que moldam a arquitetura:

1. **App na nuvem (Vercel), NAS só na LAN** → o servidor não alcança o NAS diretamente.
2. **Limite rígido de 4,5 MB** no body de Vercel Functions → o arquivo **não passa pela Function** e
   **nenhum endpoint cloud faz proxy de bytes**.
3. **Disciplina de nomes:** nomenclatura **imposta pelo sistema**, nunca escolhida pelo usuário.

## Decisões de escopo e política (v1)

- **Upload apenas na LAN** (ou VPN que dê rota privada ao agente — tratada como LAN, sem lógica
  especial). Remoto: só download/share.
- **Agente no próprio NAS** (Container Manager/Docker), gravando no filesystem local do share.
- **Sem `_inbox`** — o agente aceita multi-GB (stream → rename atômico).
- **Nome amigável, sem código.** Rastreabilidade estável: `taskId` + `originalFileName`.
- **Árvore gerenciada nova e isolada** dos arquivos legados já existentes no NAS (legados ficam fora
  dela até v2).
- **Matriz de sensibilidade × contexto:**

  | Sensibilidade    | Link local (SMB) | Download autenticado LAN          | Download autenticado externo (túnel) | Share público                                   |
  | ---------------- | ---------------- | --------------------------------- | ------------------------------------ | ----------------------------------------------- |
  | **INTERNO**      | Sim              | Sim (MEMBER+ c/ acesso à demanda) | **Não**                              | Não                                             |
  | **CLIENTE**      | Sim              | Sim (MEMBER+)                     | **Sim**                              | **Sim** (senha opcional, expiração obrigatória) |
  | **CONFIDENCIAL** | Sim              | Sim (MEMBER+ c/ acesso à demanda) | **Não**                              | Não                                             |

  Fora da LAN: **só CLIENTE**. `CONFIDENCIAL` na v1 **não** adiciona verificação de papel além do acesso
  à demanda — sua proteção é não sair da LAN nem gerar link externo.

- **Acesso SMB:** a **árvore gerenciada é read-only para usuários** (ACL do ADM: traverse+read, sem
  rename/write/delete). O **agente é o único escritor**. Áreas com escrita de usuário ficam **fora** da
  árvore. Acesso monitorado.
- **Antivírus fora da v1** (bloqueio de executáveis mantido); risco de payload em PDF/DOCX/ZIP/SVG
  documentado para v2.
- **Sensibilidade alterável** (MANAGER+); ao mudar **para diferente de CLIENTE**, **shares ativos são
  revogados automaticamente** (auditado).

## Arquitetura — control plane (nuvem) + data plane (agente no NAS)

- **App na nuvem = control plane.** Banco, UI, RBAC, calcula path + nome versionado, emite tokens
  assinados, registra/audita. **Nunca toca no arquivo nem faz proxy de bytes.**
- **Agente (Node.js no NAS) = data plane.** Única peça que toca bytes.
- **NAS e SMB nunca expostos.** Único ponto externo: o agente, via **Cloudflare Tunnel**, exposto
  **somente** para `GET /v1/download`. Restrição em duas camadas: (1) regra do Tunnel por path/método;
  (2) **listener separado** — porta LAN (upload/download/health/reconcile) e porta túnel (só download).

```
[Browser LAN] --(PUT arquivo + uploadToken)--> [Agente NAS :LAN] --(temp→rename)--> [/volume1/share]
      |                                               ^
      | prepare / markUploading (hint) / finalize     | verifica JWT (chave pública do app, por kid)
      v                                               |
[App Vercel: DB, RBAC, tokens, auditoria] ------------+ (agente chama finalize: 1 call autoritativa)
      | download interno: valida RBAC+sensibilidade → 302 p/ agente LAN (rede) ou túnel (só CLIENTE)
      | /api/artifacts/share/[token] --> [Cloudflare Tunnel] --> [Agente :túnel GET /v1/download]
```

**Estados (banco cloud):** `PENDING → UPLOADING → READY` (feliz); `PENDING → EXPIRED`;
`UPLOADING → FAILED`; `FAILED → (novo prepare) → PENDING`. **`STORED` é interno do agente** (arquivo no
disco, finalize pendente) — não é estado do banco. A **única chamada autoritativa** agente→cloud é o
`finalize` (move `PENDING/UPLOADING → READY`). `UPLOADING` é **hint de UX** setado por uma action
autenticada do browser; a fonte de verdade dos estados é o par prepare/finalize.

### Reconciliação tipo × propósito × etapa

| Eixo                                                  | Valores                                                | Papel                                   |
| ----------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| **Tipo de mídia** (`ArtifactMediaType`, enum fixo)    | videos, fotos, documentos, logos, Social Media, outros | → **pasta-folha**                       |
| **Propósito** (`DeliverablePurpose`, tabela editável) | Banner Web, Vídeo, Painel LED, Escada LED…             | → **tag pesquisável**; compõe o nome    |
| **Etapa**                                             | Briefing, Design, Edição…                              | → **proveniência** + `defaultMediaType` |

`SOCIAL_MEDIA` é pasta real → permanece tipo de mídia. **Mapper central** `enum → rótulo de pasta`
(`SOCIAL_MEDIA → "Social Media"`, demais em minúsculas). Regra: `Social Media` = arte final de post;
`FOTOS`/`VIDEOS` = material bruto/genérico.

### Padrão de pastas e nomes (determinístico)

```
Campanha:      {raiz}/{Cliente}/Campanhas/{Ano_Mes_Campanha}/{tipoMidia}/{arquivo}
Institucional: {raiz}/{Cliente}/Institucional/{tipoMidia}/{arquivo}

Nome (campanha):      {Ano_Mes_Campanha}_{Proposito}_{Demanda}_v{NN}.{ext}
Nome (institucional): {Cliente}_{Proposito}_{Demanda}_v{NN}.{ext}
```

- `{Demanda}` = **snapshot** de `toNasSlug(task.title)` no `prepare` (não muda se o título mudar
  depois). Extensão normalizada (lowercase, `jpeg→jpg`), da allowlist (Apêndice D); rejeita extensão
  dupla e sem extensão.
- Limites: cliente ≤64, campaign folder ≤96, filename ≤180, path relativo total ≤240; excedente
  truncado deterministicamente com sufixo de hash. Validar com o `NAS_UNC_PREFIX` real no Explorer/Finder.
- Nome **gerado e selado no token**; usuário não escolhe. Versionamento por
  `(taskId, purposeId, mediaType)`; **nunca reutiliza** número (expiradas/falhas/deletadas contam).

## Modelo de dados (Prisma)

```prisma
enum ArtifactMediaType    { VIDEOS  FOTOS  DOCUMENTOS  LOGOS  SOCIAL_MEDIA  OUTROS }
enum ArtifactTarget       { CAMPANHA  INSTITUCIONAL }
enum ArtifactStorageKind  { LINK  NAS_UPLOAD }
enum ArtifactUploadStatus { PENDING  UPLOADING  READY  FAILED  EXPIRED }   // STORED é interno do agente
enum SensitivityLevel     { INTERNO  CLIENTE  CONFIDENCIAL }
```

- `Client.folderName String @unique` (auto do name; colisão bloqueia + fluxo admin com preview;
  editável até existir artefato NAS).
- `Project`: `campaignSlug`, `campaignYear Int`, `campaignMonth Int` (manuais; ver Apêndice E),
  `nasUploadEnabled Boolean @default(false)`, `nasMetadataReviewedAt`, `nasMetadataReviewedById`.
- `TemplateStage.defaultMediaType ArtifactMediaType?`
- `DeliverablePurpose { id, label, slug @unique, active, order }` (CRUD admin).
- `TaskArtifact` (mantém `url` só p/ `LINK`): `storageKind`, `uploadStatus`, `mediaType?`, `purposeId?`,
  `target @default(CAMPANHA)`, `sensitivity @default(INTERNO)`, `stageId?`, `nasPath String? @unique`,
  `fileName?`, `originalFileName?`, `mimeType?`, `sizeBytes BigInt?`, `checksum?` (sha256 hex),
  `version?`, `uploadedById?`, `readyAt?`, `failedAt?`, `failedReason?`, `deleteRequestedAt?`,
  `deletedAt?`, `deletedById?`, `agentId?`. `@@unique([taskId, purposeId, mediaType, version])`.
  `localLink` **não é persistido** (derivado). `NAS_UPLOAD` exige `mediaType`+`purposeId` (código +
  índice único parcial onde suportado).
- `ArtifactShareLink { id, artifactId, publicId @unique, tokenHash, passwordHash? (Argon2id),
expiresAt, maxDownloads?, downloadCount, lastDownloadedAt?, createdById, createdByIp?, revokedAt?,
note?, createdAt }`. Token exibido só na criação: `nas_shr_<publicId>_<secret>`; guardamos
  `tokenHash = HMAC-SHA256(secret, SHARE_TOKEN_PEPPER)`, comparação timing-safe.
- `ArtifactAuditLog { id, artifactId?, actorUserId?, eventType, ip?, userAgent?, metadata Json?,
createdAt }`. **IP** obtido de `cf-connecting-ip`/`x-forwarded-for`. Cloud é a **fonte oficial** da
  auditoria; o agente mantém buffer local (SQLite) e reenvia eventos de download com retry.

**Migração (2 fases):** (1) aditivo — gera `folderName`; `campaignYear/Month` de `createdAt` só como
fallback com `nasUploadEnabled=false` até revisão admin; mapeia `ArtifactType`→`ArtifactMediaType`;
existentes viram `LINK/READY`. (2) remove enum antigo após telas/relatórios/testes migrados.

## Fluxos

### Upload (único caminho, LAN) — ver máquina de estados no Apêndice B

```
1. UI faz healthcheck do agente LAN; se indisponível, desabilita upload e explica (exige LAN/VPN).
   Colaborador escolhe arquivo + metadados (mediaType/purposeId obrigatórios, target, sensitivity;
   stageId da etapa; default da etapa). Input SEM `multiple` (upload unitário v1).
2. Cloud prepareArtifactUpload: RBAC → valida extensão/MIME declarado/tamanho (Apêndice D) → exige
   Project.nasUploadEnabled → calcula nasPath+fileName versionado EM TRANSAÇÃO (retry em conflito) →
   cria TaskArtifact (NAS_UPLOAD, PENDING) → emite JWT (Apêndice A) → retorna PREVIEW.
3. Browser: markUploading (hint) → PUT /v1/uploads/{artifactId} ao agente LAN com o JWT.
4. Agente valida JWT (EdDSA por kid + exp + jti não usado no SQLite) → grava
   `{fileName}.uploading-{jti}.tmp` → valida tamanho + sniffing → RENAME atômico → sha256 →
   estado interno STORED → enfileira finalize (SQLite). Cancelamento = disconnect: remove `.tmp`.
5. Agente → finalizeArtifactUpload (HMAC idempotente, retry/backoff persistente até READY). Cloud
   valida que artifactId/checksum/sizeBytes conferem. Falha definitiva → FAILED + failedReason.
```

Reconciliação (Apêndice E): cron cloud expira `PENDING/UPLOADING` vencidos, **nunca** um item cujo
agente reporte STORED/finalize-pendente.

### Download e links (nenhum proxy de bytes na Vercel)

- **Link local (sempre):** derivado de `nasPath` — abre a pasta no Explorer (SMB read-only). Na UI é
  **botão separado** ("Abrir pasta no NAS" / "Copiar caminho") do botão "Baixar arquivo".
- **Download interno:** `/api/artifacts/[id]/download` valida RBAC + matriz → **302** ao agente com
  **download token** curto **reutilizável dentro da janela** (Range-friendly, rate-limited, sem
  one-time); **LAN** → `NAS_AGENT_URL_LAN`; **remoto** → só `CLIENTE` → `NAS_AGENT_URL_TUNNEL`. Stream
  com **Range** (`206/416/Accept-Ranges/Content-Range`).
- **Share externo:** só `CLIENTE`. `/api/artifacts/share/[token]` resolve `publicId`, compara
  `tokenHash` timing-safe, valida senha (Argon2id, rate-limit por IP+token), expiração e `maxDownloads`
  → 302 ao agente via túnel. **`maxDownloads` conta só a requisição inicial sem `Range`** (uma sessão);
  Range subsequentes do mesmo download não contam. Expiração: **default 7 dias, máx 30** (exceção
  MANAGER+). `Content-Disposition`: `filename*=UTF-8` + fallback ASCII (do `fileName` final), sem
  CR/LF/aspas. **SVG servido só como download (nunca inline).**

### Imutabilidade, edição e exclusão

- Após `READY`: `nasPath, fileName, version, mediaType, purposeId, target, taskId, storageKind`
  **imutáveis** (v1). Alteráveis/auditados: `sensitivity` (MANAGER+, revoga shares se sair de CLIENTE),
  `note`.
- **Retry antes de READY** reutiliza mesmo `TaskArtifact`/`nasPath`/`version`, **novo jti**; agente
  limpa `.tmp` anterior.
- **Soft delete (compensável):** `deleteRequestedAt` → **tokens recusados a partir daí** → agente move
  para `_trash` (fora da árvore SMB visível) → cloud confirma `deletedAt`; revoga shares ativos; ação
  idempotente. Restauração = ação **admin** na v1 (undelete + move de volta). Retenção `_trash`: 90 dias.
- `folderName`/`campaignSlug`/`campaignYear`/`campaignMonth` **travam** após existir artefato NAS.

## Segurança (resumo)

- Tokens **JWT EdDSA** com `kid`; agente aceita **múltiplas chaves públicas por kid** (rotação com
  sobreposição; revogação por kid). Upload: `jti` uso único (SQLite). Download: reutilizável na janela.
  Finalize: HMAC com timestamp (janela 5 min), idempotente. Segredos no `lib/env.ts` (zod).
- **CORS não é controle principal** (só AJAX). Segurança real = token + expiração + rate-limit +
  sanitização de path (dentro de `NAS_ROOT`, rejeita `..`/absolutos/reservados).
- **Rate-limit:** endpoint público depende principalmente do **Cloudflare**; agente reforça por IP+token
  (SQLite p/ share/senha). Escrita segura (temp+rename). Antivírus fora da v1.

### RBAC

| Ação                                                                         | Quem                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Preparar/finalizar upload, ver, baixar interno                               | MEMBER+ com acesso à demanda (respeitando a matriz de sensibilidade) |
| Gerar/revogar share (só CLIENTE)                                             | SUPERVISOR+                                                          |
| Alterar sensibilidade                                                        | MANAGER+                                                             |
| Excluir (soft) / restaurar                                                   | Autor (excluir) ou MANAGER+; restaurar = MANAGER+                    |
| Admin de propósitos, `folderName`, campanha, revisão NAS, `defaultMediaType` | MANAGER+                                                             |

## Componentes de software

**Agente no NAS (Node.js/TS + Fastify + SQLite)** — contrato no Apêndice A. Dois listeners (LAN completo;
túnel só download). SQLite: `jti`, fila de finalize, buffer de auditoria. Config: `NAS_ROOT=/volume1/…`,
`TOKEN_PUBLIC_KEYS` (por kid), `ALLOWED_ORIGIN`, `CLOUD_FINALIZE_URL`+secret, portas, TLS. Deploy: Docker
no NAS com restart automático; usuário do processo dono da árvore (users = ACL read-only); imagem
**versionada** (rollback), `version` exposta no `/health`, cloud alerta se abaixo da mínima. Logs JSON.

**work-os (cloud):**

- Env (`lib/env.ts`): `NAS_AGENT_URL_LAN`, `NAS_AGENT_URL_TUNNEL`, `NAS_TOKEN_SIGNING_KEY`(+kid),
  `NAS_FINALIZE_SECRET`, `NAS_UNC_PREFIX`, `NAS_SHARE_BASE_URL` (base pública de `/api/artifacts/share`),
  `SHARE_TOKEN_PEPPER`, `NAS_ROOT` **separado por ambiente** (prod/staging/dev; não-prod = sandbox root
  ou upload desabilitado).
- Helpers `lib/nas/*` (path/token/links), actions/rotas (prepare, markUploading, finalize,
  createShareLink, revokeShareLink, changeSensitivity, softDelete/restore, download, share, cron
  reconcile). `NAS_AGENT_URL_LAN` é **config pública não-secreta** (o segredo é o token).
- UI: `AddArtifactForm` (arquivo + metadados + preview + healthcheck LAN + estados + retry/cancel,
  unitário); `ArtifactsList` (2 botões: abrir pasta SMB / baixar; share/revoke); `ProjectArtifactsTable`
  (filtros + busca por `originalFileName`); CRUD `DeliverablePurpose`; telas admin de folderName/
  campanha/revisão-NAS/defaultMediaType (travadas após artefato NAS).

## Testes / verificação

- **Vitest:** helpers path/slug/versão; JWT sign/verify + rotação por kid; concorrência de `nextVersion`;
  matriz RBAC e sensibilidade×contexto; share (expiração/senha Argon2id/revogação/maxDownloads com
  Range); extensão/MIME/tamanho/dupla-extensão; imutabilidade pós-READY; revogação de share ao mudar
  sensibilidade; versão nunca reutilizada.
- **Agente:** token expirado/reutilizado/adulterado/kid revogado; upload interrompido (temp não vira
  final); > maxSize; MIME sniff incompatível; Range inválido; nomes acento/emoji/reservado/longo;
  finalize idempotente e **offline → fila SQLite → retry**; disco cheio; agente offline.
- **Segurança do túnel (smoke):** externo `GET /v1/download` (token) OK; `POST /v1/uploads`,
  `GET /v1/health`, `POST /v1/reconcile` **negados**.
- **Campos travados:** folderName/campanha após artefato NAS; metadados de READY.
- **Smoke manual:** agente real — imagem + vídeo grande; pastas/nomes; dois links; share CLIENTE
  senha/expiração; INTERNO/CONFIDENCIAL sem share/externo; soft delete → `_trash` → restore;
  reconciliação; caminho SMB real no Explorer/Finder.

## Sequência de implementação

1. Schema + migration + backfill (fase 1 aditiva, `nasUploadEnabled`/locks).
2. Helpers `lib/nas/*` + testes.
3. Agente no NAS (2 listeners, SQLite, fila de finalize, JWKS por kid) + testes + deploy (Docker, TLS
   DNS-01, cloudflared só download, ACL read-only).
4. Actions/rotas cloud + RBAC + matriz de sensibilidade + auditoria.
5. UI + CRUDs admin + estados + healthcheck LAN.
6. E2E + smoke manual. Depois, fase 2 (remover enum antigo).

## Fora de escopo (v2)

Aprovação do cliente; upload remoto/resumável (tus); upload múltiplo; dedup por checksum + validação de
integridade no download; antivírus (ClamAV); registro em massa de legados; migração automática ao mudar
folderName/campaignSlug; portal do cliente.

---

## Apêndice A — Contrato HTTP do agente

- `GET /v1/health` (LAN; público só na LAN; CORS = origens do app prod/preview) →
  `{ ok, agentId, version, writable, freeBytes, maxUploadBytes }`.
- `PUT /v1/uploads/{artifactId}` (LAN) — `Authorization: Bearer <uploadToken>`,
  `Content-Type: application/octet-stream`, `Content-Length`. Resp `201 { checksum, sizeBytes, storedAt }`.
- `GET /v1/download?token=<downloadToken>` (LAN **e** túnel) — Range; `200/206/416`.
- `GET /v1/reconcile/report` (LAN, auth admin) → `.tmp` órfãos + finais sem registro + fila pendente.
- `POST /v1/reconcile/cleanup` (LAN, auth admin) — remove `.tmp` além do TTL.

**JWT upload (EdDSA, kid):** `{ iss, aud:"nas-agent-upload", artifactId, taskId, nasPath, fileName,
maxSize, jti, exp }`. **JWT download:** `{ aud:"nas-agent-download", scope:"download", artifactId,
nasPath, fileName, dispositionName, sensitivity, sub|shareLinkId, exp curto }` (reutilizável na janela).
**Finalize:** `X-NAS-Timestamp` + `X-NAS-Signature = HMAC(timestamp + "." + rawBody)`.

## Apêndice B — Máquina de estados do upload

```
PENDING ─(markUploading)→ UPLOADING ─(finalize OK)→ READY
PENDING ─(TTL sem upload)→ EXPIRED
UPLOADING ─(erro/timeout)→ FAILED ─(novo prepare)→ PENDING
[agente] recebido → grava .tmp → rename → STORED(interno) → finalize(retry até READY)
READY ─(soft delete)→ deleteRequestedAt → (agente move p/ _trash) → deletedAt
```

## Apêndice C — Topologia de rede (placeholders a fixar no deploy)

```
App cloud:       https://workos.exemplo.com            (Vercel)
Agente LAN:      https://nas-agent-lan.exemplo.com     (A → IP privado; split DNS/hairpin; TLS DNS-01)
Agente download: https://nas-agent-download.exemplo.com (Cloudflare Tunnel; só GET /v1/download)
SMB local:       \\NAS\WorkOS  → NAS_UNC_PREFIX
```

TLS terminado no agente ou em proxy reverso no NAS (cert via DNS-01). VPN com rota privada ao hostname
LAN funciona transparentemente. `NAS_AGENT_URL_LAN` é público (não-secreto).

## Apêndice D — Allowlist de arquivos (v1)

`OUTROS` **não** significa "qualquer arquivo" — segue esta allowlist global. Executáveis sempre
bloqueados (`exe/bat/cmd/com/sh/ps1/js/jar/msi/scr/vbs/html`). Coerência tipo×extensão exigida; MIME
declarado validado + sniffing dos primeiros bytes (ZIP-based `docx/xlsx/pptx` tratados como família ZIP).

| Tipo         | Extensões                                        | Máx v1 |
| ------------ | ------------------------------------------------ | ------ |
| FOTOS        | jpg, png, webp, gif, tiff, heic, raw/cr2/nef/arw | 150 MB |
| VIDEOS       | mp4, mov, webm, mkv                              | 5 GB   |
| LOGOS        | svg, ai, eps, pdf, png, cdr                      | 200 MB |
| DOCUMENTOS   | pdf, docx, xlsx, pptx, txt, zip, indd, psd       | 200 MB |
| SOCIAL_MEDIA | jpg, png, mp4, gif, pdf                          | 500 MB |
| OUTROS       | qualquer da allowlist acima                      | 500 MB |

Limites configuráveis por env/admin e limitados adicionalmente pelo espaço livre reportado no `/health`.
`svg` sanitizado e servido só como download.

## Apêndice E — Políticas operacionais

- **Semântica do mês da campanha:** `campaignYear/Month` = **mês de veiculação/entrega** da campanha
  (define a pasta permanente), definidos por MANAGER+ e **obrigatórios** para liberar `nasUploadEnabled`.
- **`_trash`:** fora da árvore SMB visível aos usuários (ou ACL sem leitura); retenção 90 dias; purga
  reportada, nunca apaga arquivo final órfão automaticamente.
- **Órfãos finais:** reconciliação **reporta**; ação manual (vincular a demanda ou quarentena); sem
  auto-delete na v1.
- **Backup/restore:** backup diário do banco **e** snapshot diário do share gerenciado; **reconciliação
  obrigatória pós-restore** (evita divergência banco×NAS). Retenção de `.tmp` por TTL.
- **Update do agente:** imagem versionada em registry, rollback; `/health.version`; cloud avisa se
  abaixo da versão mínima compatível.
- **Rotação de chaves:** agente carrega chaves públicas por `kid` (JWKS-like); rotação com janela de
  sobreposição; kid comprometido é removido.
- **Monitoramento:** Uptime Kuma no `/health`; alerta de pouco espaço em disco; auditoria oficial no
  cloud (agente com buffer + retry).
