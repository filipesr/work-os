# Importar para o NAS um artefato registrado por link — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um artefato registrado por link pode ser trazido para dentro do NAS — o app enfileira, o agente da LAN baixa, valida e grava, e a falha volta com motivo e com a chance de corrigir e tentar de novo.

**Architecture:** a Vercel não alcança o agente (IP privado), então o tráfego anda no sentido que já funciona: o agente sai para a nuvem. O app grava o artefato como `NAS_UPLOAD` + `PENDING` + `url` (uma combinação que hoje não existe: upload pelo navegador nasce sem `url`), o agente pergunta o que há pendente por um endpoint assinado com o mesmo HMAC do `finalize`, baixa a origem com travas de rede, entrega os bytes à esteira de gravação que já existe e reporta sucesso ou falha com motivo.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma/PostgreSQL, next-intl v4 (pt-BR + es-ES), vitest + React Testing Library, Fastify (agente, `nas-poc/agent/`, suíte própria com vitest).

**Spec:** `docs/superpowers/specs/2026-09-03-importar-link-para-o-nas-design.md`

## Global Constraints

- **Duas entregas, dois deployables.** `nas-poc/agent/` roda no NAS e **não sobe junto com a Vercel**. Nada nas Tasks 1–9 pode depender de uma versão nova do agente para continuar funcionando; o app precisa seguir correto com o agente antigo rodando (a fila simplesmente não é consumida).
- **i18n obrigatório nos dois locales.** Toda string de UI passa por `t()` e existe em `locales/pt-BR/` **e** `locales/es-ES/`, com espanhol real (não português com sotaque). Há teste de paridade que quebra se faltar chave.
- **Migração versionada, nunca `db push`.** Arquivo em `prisma/migrations/YYYYMMDDHHMMSS_nome/migration.sql`.
- **`prisma migrate dev` está quebrado neste repo** (P3006 — `ActiveStageStatus` foi criado por migração nenhuma). Use `npx prisma migrate deploy` para aplicar e `npx prisma generate` para o client. Está registrado em `docs/pendencias.md`; não tente consertar isso aqui.
- **Arquivo `"use server"` só exporta função async.** Constantes e tipos vão para módulo comum (ex.: `lib/nas/...`), nunca para o arquivo de actions.
- **Trava de servidor antes de trava de tela.** Toda regra nova (só FAILED reedita, só link direto) é recusada pela action/rota; a tela só esconde o que o servidor já recusa. Um teste de cada lado.
- **O agente é a única fronteira de rede.** Nenhuma trava de SSRF vive no app: o app faz a checagem barata (esquema, IP literal privado) para dar mensagem boa, e o agente faz a checagem que vale (resolução de DNS a cada salto).
- **Tipo só de link é regra de servidor.** `FIGMA` e `OUTROS` não recebem arquivo no NAS — nem por upload, nem por importação. A tela não os oferece onde não valem, mas quem recusa é a action; esconder um botão não é uma trava.
- **Nada de `type` novo.** Nenhum código escrito neste plano grava `TaskArtifact.type`. A coluna continua no banco e é lida só para artefato antigo.
- **Commits diretos na `main`** (projeto solo, sem branch/PR), um commit por passo de "Commit" do plano.

---

## File Structure

**Criados (app):**

| Arquivo                                           | Responsabilidade                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/nas/import-source.ts`                        | Puro. Deriva o nome do arquivo da URL, recusa esquema/IP-literal inválido, e define os códigos de falha da importação (compartilhados entre agente, action e i18n). |
| `lib/actions/artifact-import.ts`                  | Server actions da importação: enfileirar e reeditar-em-FAILED. Separado de `artifact.ts` (já com 800 linhas) porque é um fluxo com ciclo próprio.                   |
| `app/api/artifacts/import-queue/route.ts`         | O endpoint que o agente consulta. HMAC igual ao do `finalize`. Reserva itens e devolve à fila os presos.                                                            |
| `components/artifacts/EditFailedImportDialog.tsx` | Diálogo de reedição do import que falhou (nome, tipo de mídia, sensibilidade, URL).                                                                                 |

**Criados (agente, `nas-poc/agent/src/`):**

| Arquivo            | Responsabilidade                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nas-store.ts`     | Gravação de um fluxo de bytes no NAS: tmp → corte por tamanho **durante** → sniff → rename → hash. Extraído do `uploadHandler` para que upload e importação usem a MESMA esteira.  |
| `fetch-source.ts`  | Busca a URL com as travas de rede: esquema, recusa de destino privado a **cada** salto, limite de saltos, timeouts. É o único código de segurança genuinamente novo desta entrega. |
| `import-worker.ts` | O laço: pergunta a fila, baixa, grava, reporta sucesso ou falha.                                                                                                                   |

**Modificados (app):** `prisma/schema.prisma`, `lib/nas/path.ts`, `lib/validations.ts`, `lib/artifacts/unify.ts`, `lib/actions/artifact.ts`, `lib/actions/task.ts`, `app/api/artifacts/finalize/route.ts`, `components/artifacts/AddArtifactForm.tsx`, `components/artifacts/ArtifactRow.tsx`, `components/artifacts/UnifiedArtifactsPanel.tsx`, `components/tasks/ArtifactsList.tsx`, `components/tasks/UploadArtifactForm.tsx`, `locales/{pt-BR,es-ES}/tasks.json`, `locales/{pt-BR,es-ES}/errors.json`.

**Removido:** `components/tasks/ActivityFeed.tsx` — ver Task 2.

**Modificados (agente):** `nas-poc/agent/src/nas-path.ts`, `src/server.ts`, `src/config.ts`.

---

### Task 1: cada tipo de mídia ganha a sua política

Quatro decisões, e nenhuma delas é só rótulo — o valor do enum decide a pasta no NAS, as extensões
aceitas e o teto de tamanho:

| Tipo             | Política                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **FIGMA** (novo) | **Só link.** Nunca recebe arquivo — nem por upload, nem por importação.                                                       |
| **OUTROS**       | **Só link.** Deixa de ser o coringa que aceitava a união de todas as listas.                                                  |
| **LOGOS**        | **Como está hoje** — `svg, ai, eps, pdf, png, cdr`, 200 MB. Arquivo aberto de marca é o que uma agência mais precisa guardar. |
| **SOCIAL_MEDIA** | **Foto e vídeo.** Sai o `pdf` (não é nem um nem outro); entram os formatos que faltavam dos dois conjuntos.                   |

`FOTOS`, `VIDEOS` e `DOCUMENTOS` não mudam.

"Só link" é uma categoria nova no código, não só uma lista vazia: um tipo sem entrada na allowlist
precisa recusar com uma frase que explique — "esse tipo existe só como link" —, e não com "extensão
não permitida", que manda a pessoa procurar o erro no lugar errado.

**Files:**

- Modify: `prisma/schema.prisma` (enum `ArtifactMediaType`)
- Create: `prisma/migrations/20260903120000_artifact_media_type_figma/migration.sql`
- Modify: `lib/nas/path.ts:21-27` (type), `:32-39` (`MEDIA_TYPE_FOLDER`), `:41-85` (`ALLOWLIST`, união, `normalizeExtension`)
- Modify: `lib/validations.ts:84-92` (`artifactMediaTypeEnum`)
- Modify: `nas-poc/agent/src/nas-path.ts:18-24`, `:27-34`, `:36-100` (os mesmos)
- Modify: `components/tasks/UploadArtifactForm.tsx:33` (`MEDIA_TYPES`)
- Modify: `lib/actions/artifact.ts` (`prepareArtifactUpload` recusa tipo só-de-link)
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`, `locales/{pt-BR,es-ES}/errors.json`
- Test: `__tests__/lib/nas/path.test.ts`, `nas-poc/agent/test/nas-path.test.ts`

**Interfaces:**

- Consumes: nada (primeira task).
- Produces, em `lib/nas/path.ts` **e** em `nas-poc/agent/src/nas-path.ts` (as duas cópias andam juntas):

```ts
export type ArtifactMediaType =
  | "VIDEOS"
  | "FOTOS"
  | "DOCUMENTOS"
  | "LOGOS"
  | "SOCIAL_MEDIA"
  | "FIGMA"
  | "OUTROS";
/** Tipos que existem só como link — nunca recebem arquivo no NAS. */
export const LINK_ONLY_MEDIA_TYPES = ["FIGMA", "OUTROS"] as const;
/** Tipos que aceitam arquivo, na ordem em que aparecem na tela. */
export const UPLOADABLE_MEDIA_TYPES = [
  "FOTOS",
  "VIDEOS",
  "DOCUMENTOS",
  "LOGOS",
  "SOCIAL_MEDIA",
] as const;
export type UploadableMediaType = (typeof UPLOADABLE_MEDIA_TYPES)[number];
export function isUploadableMediaType(m: ArtifactMediaType): m is UploadableMediaType;
export const ALLOWLIST: Record<UploadableMediaType, { ext: string[]; maxBytes: number }>;
```

`ALLOWLIST` deixa de ser indexada por `ArtifactMediaType` e passa a ser por `UploadableMediaType`.
Isso é de propósito: o TypeScript passa a **exigir** o estreitamento em cada ponto que consulta um
teto de tamanho, e um caminho que esqueceu de recusar tipo só-de-link deixa de compilar em vez de
falhar em produção.

- [ ] **Step 1: Escrever os testes que falham (app)**

Ao final de `__tests__/lib/nas/path.test.ts`:

```ts
describe("tipos só de link", () => {
  it('recusam arquivo com um motivo próprio, não com "extensão não permitida"', () => {
    for (const t of ["FIGMA", "OUTROS"] as const) {
      expect(() => normalizeExtension("a.png", t)).toThrow(NasPathError);
      try {
        normalizeExtension("a.png", t);
      } catch (e) {
        expect((e as NasPathError).code, t).toBe("MEDIA_TYPE_LINK_ONLY");
      }
    }
  });

  it("OUTROS deixa de ser o coringa que aceitava a união das listas", () => {
    expect(() => normalizeExtension("qualquer.psd", "OUTROS")).toThrow(NasPathError);
  });

  it("isUploadableMediaType separa os dois mundos", () => {
    expect(isUploadableMediaType("FOTOS")).toBe(true);
    expect(isUploadableMediaType("FIGMA")).toBe(false);
    expect(isUploadableMediaType("OUTROS")).toBe(false);
  });
});

describe("LOGOS não muda", () => {
  it("continua aceitando vetor e pdf", () => {
    for (const f of ["marca.svg", "marca.ai", "marca.eps", "marca.pdf", "marca.png", "marca.cdr"]) {
      expect(() => normalizeExtension(f, "LOGOS"), f).not.toThrow();
    }
  });

  it("continua com o teto de 200 MB", () => {
    expect(ALLOWLIST.LOGOS.maxBytes).toBe(200 * 1024 * 1024);
  });
});

describe("SOCIAL_MEDIA é foto e vídeo", () => {
  it("aceita os dois conjuntos", () => {
    for (const f of ["a.jpg", "a.png", "a.webp", "a.gif", "a.mp4", "a.mov", "a.webm"]) {
      expect(() => normalizeExtension(f, "SOCIAL_MEDIA"), f).not.toThrow();
    }
  });

  it("recusa pdf, que não é nem um nem outro", () => {
    expect(() => normalizeExtension("a.pdf", "SOCIAL_MEDIA")).toThrow(/não permitida para o tipo/);
  });
});

describe("a guarda de extensão dupla sobrevive à mudança da união", () => {
  it("continua pegando o disfarce", () => {
    expect(() => normalizeExtension("nota.pdf.exe", "DOCUMENTOS")).toThrow(NasPathError);
    expect(() => normalizeExtension("foto.jpg.png", "FOTOS")).toThrow(/dupla/);
  });
});
```

O último bloco existe porque a união de extensões (que alimenta a guarda de extensão dupla) era
calculada excluindo `OUTROS`. Mexer na allowlist mexe nessa união — e uma guarda de segurança que
afrouxa como efeito colateral de outra mudança é exatamente o tipo de estrago que não dá erro.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/nas/path.test.ts`
Expected: FAIL — não existe `MEDIA_TYPE_LINK_ONLY`, `isUploadableMediaType` nem o tipo `FIGMA`.

- [ ] **Step 3: Reescrever a política no app**

`lib/nas/path.ts`:

```ts
export type ArtifactMediaType =
  | "VIDEOS"
  | "FOTOS"
  | "DOCUMENTOS"
  | "LOGOS"
  | "SOCIAL_MEDIA"
  | "FIGMA"
  | "OUTROS";

/**
 * Tipos que existem SÓ COMO LINK: nunca recebem arquivo no NAS.
 * FIGMA é um endereço vivo numa ferramenta de outra pessoa — copiar bytes de lá guarda uma foto de
 * um desenho que continua mudando. OUTROS era o coringa que aceitava a união de todas as listas;
 * um balde sem regra é onde entra o que ninguém quis classificar.
 */
export const LINK_ONLY_MEDIA_TYPES = ["FIGMA", "OUTROS"] as const;

/** Tipos que aceitam arquivo (upload ou importação), na ordem em que aparecem na tela. */
export const UPLOADABLE_MEDIA_TYPES = [
  "FOTOS",
  "VIDEOS",
  "DOCUMENTOS",
  "LOGOS",
  "SOCIAL_MEDIA",
] as const;

export type UploadableMediaType = (typeof UPLOADABLE_MEDIA_TYPES)[number];

export function isUploadableMediaType(m: ArtifactMediaType): m is UploadableMediaType {
  return (UPLOADABLE_MEDIA_TYPES as readonly string[]).includes(m);
}
```

`MEDIA_TYPE_FOLDER` continua com as sete chaves — `outros/` existe no NAS com arquivos antigos, e
uma pasta que some do mapa quebra a leitura do que já está gravado. A de `FIGMA` nasce inalcançável
e é só completude de tipo:

```ts
export const MEDIA_TYPE_FOLDER: Record<ArtifactMediaType, string> = {
  VIDEOS: "videos",
  FOTOS: "fotos",
  DOCUMENTOS: "documentos",
  LOGOS: "logos",
  SOCIAL_MEDIA: "Social Media",
  // FIGMA e OUTROS são só-de-link: estas duas não recebem arquivo novo. `outros` fica porque já
  // existe no NAS, com o que foi gravado antes desta política.
  FIGMA: "figma",
  OUTROS: "outros",
};
```

A allowlist perde as duas entradas e o `SOCIAL_MEDIA` é reescrito:

```ts
export const ALLOWLIST: Record<UploadableMediaType, { ext: string[]; maxBytes: number }> = {
  FOTOS: {
    ext: ["jpg", "png", "webp", "gif", "tiff", "heic", "raw", "cr2", "nef", "arw"],
    maxBytes: 150 * MB,
  },
  VIDEOS: { ext: ["mp4", "mov", "webm", "mkv"], maxBytes: 5 * GB },
  LOGOS: { ext: ["svg", "ai", "eps", "pdf", "png", "cdr"], maxBytes: 200 * MB },
  DOCUMENTOS: {
    ext: ["pdf", "docx", "xlsx", "pptx", "txt", "zip", "indd", "psd"],
    maxBytes: 200 * MB,
  },
  // Foto e vídeo — o pdf saiu porque não é nem um nem outro.
  SOCIAL_MEDIA: {
    ext: ["jpg", "png", "webp", "gif", "mp4", "mov", "webm"],
    maxBytes: 500 * MB,
  },
};

// União de todas as extensões aceitas — usada pela guarda de extensão dupla.
const ALLOWED_UNION = new Set(Object.values(ALLOWLIST).flatMap((v) => v.ext));
```

`NasPathError` ganha o código novo, e `normalizeExtension` recusa cedo:

```ts
    | "EXT_NOT_ALLOWED_FOR_TYPE"
    | "MEDIA_TYPE_LINK_ONLY"
```

```ts
export function normalizeExtension(originalFileName: string, mediaType: ArtifactMediaType): string {
  if (!isUploadableMediaType(mediaType)) {
    throw new NasPathError(
      "MEDIA_TYPE_LINK_ONLY",
      `o tipo ${mediaType} existe só como link e não recebe arquivo no NAS`
    );
  }
  // … o resto como está hoje, com `ALLOWLIST[mediaType].ext.includes(ext)` direto
  // (o ramo especial de OUTROS desaparece junto com o coringa).
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/nas/path.test.ts`
Expected: PASS

- [ ] **Step 5: Repetir no agente**

As mesmas mudanças em `nas-poc/agent/src/nas-path.ts` — type, `LINK_ONLY_MEDIA_TYPES`,
`UPLOADABLE_MEDIA_TYPES`, `isUploadableMediaType`, `MEDIA_TYPE_FOLDER`, `ALLOWLIST`, união e
`normalizeExtension`. É a mesma política, escrita duas vezes porque são dois deployables; **divergir
aqui é o defeito mais caro desta entrega** — um tipo aceito por um lado e recusado pelo outro
aparece como "falhou" sem explicação para quem usa.

Ao final de `nas-poc/agent/test/nas-path.test.ts`:

```ts
describe("política de tipos (paridade com o app)", () => {
  it("FIGMA e OUTROS recusam arquivo", () => {
    for (const t of ["FIGMA", "OUTROS"] as const) {
      expect(() => normalizeExtension("a.png", t), t).toThrow(NasPathError);
    }
  });

  it("LOGOS continua com vetor e pdf; SOCIAL_MEDIA aceita vídeo e recusa pdf", () => {
    expect(() => normalizeExtension("m.ai", "LOGOS")).not.toThrow();
    expect(() => normalizeExtension("m.pdf", "LOGOS")).not.toThrow();
    expect(() => normalizeExtension("v.mp4", "SOCIAL_MEDIA")).not.toThrow();
    expect(() => normalizeExtension("d.pdf", "SOCIAL_MEDIA")).toThrow(NasPathError);
  });
});
```

Run: `cd nas-poc/agent && npx vitest run test/nas-path.test.ts`
Expected: PASS

- [ ] **Step 6: Migração do enum e o client**

`prisma/migrations/20260903120000_artifact_media_type_figma/migration.sql`:

```sql
-- FIGMA passa a ser tipo de mídia. Ele é SÓ DE LINK (não recebe arquivo no NAS), mas precisa
-- existir no enum porque link de Figma é o rótulo mais usado, e o `type` legado — que o tinha —
-- parou de ser gravado. Aditivo: nenhum dado existente muda.
ALTER TYPE "ArtifactMediaType" ADD VALUE IF NOT EXISTS 'FIGMA';
```

Em `prisma/schema.prisma`, acrescente `FIGMA` ao enum (antes de `OUTROS`).

Run: `npx prisma migrate deploy && npx prisma generate`
**Não use `prisma migrate dev`** — quebrado neste repo (P3006).

Nenhum artefato existente com `mediaType = OUTROS` é tocado: a política nova vale para escrita nova,
e o que já está no NAS continua onde está, com o tipo que tem.

- [ ] **Step 7: O upload deixa de oferecer o que não aceita**

`components/tasks/UploadArtifactForm.tsx:33` passa a usar a lista única, em vez de repetir os nomes:

```ts
import { UPLOADABLE_MEDIA_TYPES } from "@/lib/nas/path";
const MEDIA_TYPES = UPLOADABLE_MEDIA_TYPES;
```

E `prepareArtifactUpload` (`lib/actions/artifact.ts`) recusa no SERVIDOR, antes de qualquer
consulta — a lista da tela é conveniência, não trava:

```ts
if (!isUploadableMediaType(data.mediaType)) {
  return { error: t("mediaTypeLinkOnly") };
}
```

Sem esse estreitamento o `ALLOWLIST[data.mediaType]` logo abaixo nem compila, que é exatamente o
efeito procurado ao tipar a allowlist por `UploadableMediaType`.

- [ ] **Step 8: Textos nos dois locales**

`locales/{pt-BR,es-ES}/tasks.json` → `artifacts.mediaTypes`: `"FIGMA": "Figma"` nos dois (o nome
próprio não se traduz).

`locales/pt-BR/errors.json` → `artifact`:

```json
    "mediaTypeLinkOnly": "Esse tipo existe só como link e não recebe arquivo no NAS."
```

`locales/es-ES/errors.json` → `artifact`:

```json
    "mediaTypeLinkOnly": "Ese tipo existe solo como enlace y no admite archivos en el NAS."
```

- [ ] **Step 9: Suíte inteira**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. O `tsc` é o passo que importa aqui: ele lista todos os pontos que consultam
`ALLOWLIST` sem estreitar o tipo. Cada um deles precisa de recusa explícita — nenhum deve ser
resolvido com `as` nem com `!`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(nas): cada tipo de mídia com a sua política, e FIGMA/OUTROS só como link"
```

---

### Task 2: o tipo do artefato passa a sair do mediaType

Hoje o rótulo de tipo só olha `mediaType` quando `storageKind === "NAS_UPLOAD"`. A partir da Task 6 o link também grava `mediaType` e para de gravar `type` — sem esta task, **todo artefato criado daqui em diante apareceria sem tipo**. A regra passa a ser: `mediaType` quando houver, senão `type`.

**Files:**

- Modify: `lib/artifacts/unify.ts:43-50` (`MEDIA_TYPE_LABEL`), `:52-61` (`artifactTypeLabel`), `:78-88` (`artifactTypeLabelKey`)
- Modify: `components/artifacts/ArtifactRow.tsx:91-96` (fallback do `typeLabel`)
- Modify: `components/tasks/ArtifactsList.tsx:30-36`, `:55`, `:120`
- Delete: `components/tasks/ActivityFeed.tsx`
- Test: `__tests__/lib/artifacts-unify.test.ts`

**Interfaces:**

- Consumes: `ArtifactMediaType` com FIGMA (Task 1).
- Produces: `artifactTypeLabelKey(row)` devolve `mediaTypes.<MEDIA>` sempre que `row.mediaType` existir, **independente de `storageKind`**; `types.<type>` só quando não houver `mediaType`.

- [ ] **Step 1: Confirmar que o `ActivityFeed` está morto**

Run: `grep -rn "ActivityFeed" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "\.next"`
Expected: só as duas linhas de dentro do próprio arquivo (a interface e o `export function`).

**Se aparecer qualquer importador, NÃO apague:** remapeie `artifactIcons` e a chave `artifactTypes.<TYPE>` como o `ArtifactsList` desta task, e registre no relatório que o arquivo estava vivo. A spec contou cinco consumidores porque o levantamento não checou importadores; se o grep discordar da spec, o grep manda.

- [ ] **Step 2: Escrever os testes que falham**

Em `__tests__/lib/artifacts-unify.test.ts`:

```ts
describe("rótulo de tipo — mediaType manda, type é o resto", () => {
  it("link novo, com mediaType, mostra o tipo de mídia", () => {
    const row = { storageKind: "LINK" as const, type: null, mediaType: "FIGMA" };
    expect(artifactTypeLabelKey(row)).toBe("mediaTypes.FIGMA");
    expect(artifactTypeLabel(row)).toBe("Figma");
  });

  it("link antigo, só com type, continua mostrando o dele", () => {
    const row = { storageKind: "LINK" as const, type: "DOCUMENT", mediaType: null };
    expect(artifactTypeLabelKey(row)).toBe("types.document");
    expect(artifactTypeLabel(row)).toBe("Documento");
  });

  it("upload no NAS segue como antes", () => {
    const row = { storageKind: "NAS_UPLOAD" as const, type: null, mediaType: "FOTOS" };
    expect(artifactTypeLabelKey(row)).toBe("mediaTypes.FOTOS");
  });

  it("sem tipo nenhum devolve null (a tela mostra travessão)", () => {
    const row = { storageKind: "LINK" as const, type: null, mediaType: null };
    expect(artifactTypeLabelKey(row)).toBeNull();
    expect(artifactTypeLabel(row)).toBe("—");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/artifacts-unify.test.ts`
Expected: FAIL no primeiro caso — devolve `types.…` / `"—"` porque o `storageKind` não é `NAS_UPLOAD`.

- [ ] **Step 4: Trocar a regra**

`lib/artifacts/unify.ts` — acrescente `FIGMA: "Figma",` ao `MEDIA_TYPE_LABEL` e tire a condição de `storageKind` das duas funções:

```ts
/** Rótulo de tipo: `mediaType` quando houver (upload no NAS ou link novo), senão o `type` legado. */
export function artifactTypeLabel(
  row: Pick<UnifiedArtifactRow, "storageKind" | "type" | "mediaType">
): string {
  if (row.mediaType) return MEDIA_TYPE_LABEL[row.mediaType] ?? row.mediaType;
  if (row.type) return ARTIFACT_TYPE_LABEL[row.type] ?? row.type;
  return "—";
}
```

```ts
export function artifactTypeLabelKey(
  row: Pick<UnifiedArtifactRow, "storageKind" | "type" | "mediaType">
): string | null {
  if (row.mediaType) return `mediaTypes.${row.mediaType}`;
  if (row.type) return `types.${row.type.toLowerCase()}`;
  return null;
}
```

`components/artifacts/ArtifactRow.tsx` — o fallback repetia a mesma condição:

```ts
const typeLabel = (row: UnifiedArtifactRow): string => {
  const key = artifactTypeLabelKey(row);
  if (!key) return "—";
  if (t.has(key)) return t(key);
  return row.mediaType ?? row.type ?? "—";
};
```

- [ ] **Step 5: `ArtifactsList` — ícone e rótulo por mediaType**

```ts
import { File, FileText, Figma, Image, Video } from "lucide-react";

// Ícone por tipo de mídia (artefato novo) com queda para o `type` legado (artefato antigo).
const mediaIconConfig = {
  VIDEOS: { icon: Video, color: "text-primary" },
  FOTOS: { icon: Image, color: "text-success" },
  DOCUMENTOS: { icon: FileText, color: "text-primary" },
  LOGOS: { icon: Image, color: "text-success" },
  SOCIAL_MEDIA: { icon: Image, color: "text-success" },
  FIGMA: { icon: Figma, color: "text-pink-500" },
  OUTROS: { icon: File, color: "text-gray-500" },
} as const;

const legacyTypeConfig = {
  DOCUMENT: { icon: FileText, color: "text-primary" },
  IMAGE: { icon: Image, color: "text-success" },
  VIDEO: { icon: Video, color: "text-primary" },
  FIGMA: { icon: Figma, color: "text-pink-500" },
  OTHER: { icon: File, color: "text-gray-500" },
} as const;

const FALLBACK_CONFIG = { icon: File, color: "text-gray-500" } as const;

function artifactIconConfig(a: { mediaType?: string | null; type?: string | null }) {
  if (a.mediaType) {
    return mediaIconConfig[a.mediaType as keyof typeof mediaIconConfig] ?? FALLBACK_CONFIG;
  }
  if (a.type) return legacyTypeConfig[a.type as keyof typeof legacyTypeConfig] ?? FALLBACK_CONFIG;
  return FALLBACK_CONFIG;
}
```

No corpo (linha ~55): `const config = artifactIconConfig(artifact);`

E o rótulo (linha ~120):

```tsx
<span>
  {artifact.mediaType
    ? t(`mediaTypes.${artifact.mediaType}`)
    : artifact.type
      ? t(`types.${artifact.type.toLowerCase()}`)
      : "—"}
</span>
```

Se o tipo da prop não trouxer `mediaType`, acrescente `mediaType?: string | null` à interface e passe o campo no único consumidor (`components/tasks/WorkflowHistoryModal.tsx:168`) — a consulta que alimenta o modal precisa selecionar `mediaType`.

- [ ] **Step 6: Apagar o `ActivityFeed`**

Confirmado morto no Step 1: `git rm components/tasks/ActivityFeed.tsx`

Componente sem importador que precisa ser mantido em duas convenções de tipo é custo puro: ninguém vê o resultado e alguém paga a manutenção.

- [ ] **Step 7: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS nos dois.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(artefatos): o tipo sai do mediaType, com queda para o type legado"
```

---

### Task 3: `lib/nas/import-source.ts` — a leitura da origem, pura

Duas perguntas que aparecem em quatro lugares (enfileirar, reeditar, tela, agente) e que não podem ter quatro respostas: **qual nome de arquivo esta URL promete** e **quais motivos de falha existem**. Módulo puro, sem I/O — a resolução de DNS é do agente (Task 11).

**Files:**

- Create: `lib/nas/import-source.ts`
- Test: `__tests__/lib/nas/import-source.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces:
  - `deriveFileNameFromUrl(rawUrl: string): string | null`
  - `checkImportUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: ImportUrlProblem }`
  - `type ImportUrlProblem = "MALFORMED" | "SCHEME" | "PRIVATE_HOST" | "NO_FILE_NAME"`
  - `IMPORT_FAILURE_CODES` e `type ImportFailureCode` (lista abaixo)

- [ ] **Step 1: Escrever o teste que falha**

Crie `__tests__/lib/nas/import-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveFileNameFromUrl, checkImportUrl } from "@/lib/nas/import-source";

describe("deriveFileNameFromUrl", () => {
  it("pega o último segmento do caminho", () => {
    expect(deriveFileNameFromUrl("https://exemplo.com/a/b/foto.jpg")).toBe("foto.jpg");
  });

  it("ignora query e fragmento", () => {
    expect(deriveFileNameFromUrl("https://exemplo.com/foto.png?download=1#x")).toBe("foto.png");
  });

  it("decodifica o que estiver escapado", () => {
    expect(deriveFileNameFromUrl("https://exemplo.com/arte%20final.pdf")).toBe("arte final.pdf");
  });

  it("devolve null quando o caminho não promete um arquivo", () => {
    expect(deriveFileNameFromUrl("https://drive.google.com/file/d/1a2b3c/view")).toBeNull();
    expect(deriveFileNameFromUrl("https://exemplo.com/")).toBeNull();
    expect(deriveFileNameFromUrl("não é url")).toBeNull();
  });
});

describe("checkImportUrl", () => {
  it("aceita http e https", () => {
    expect(checkImportUrl("https://exemplo.com/a.jpg").ok).toBe(true);
    expect(checkImportUrl("http://exemplo.com/a.jpg").ok).toBe(true);
  });

  it("recusa qualquer outro esquema", () => {
    for (const u of ["ftp://x/a.jpg", "file:///etc/passwd", "data:image/png;base64,AAA"]) {
      const r = checkImportUrl(u);
      expect(r.ok, u).toBe(false);
      if (!r.ok) expect(r.reason, u).toBe("SCHEME");
    }
  });

  it("recusa host que já é um IP privado escrito na URL", () => {
    const hosts = [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.200.216",
      "172.16.3.9",
      "169.254.169.254",
      "localhost",
      "[::1]",
    ];
    for (const h of hosts) {
      const r = checkImportUrl(`http://${h}/a.jpg`);
      expect(r.ok, h).toBe(false);
      if (!r.ok) expect(r.reason, h).toBe("PRIVATE_HOST");
    }
  });

  it("recusa a URL sem nome de arquivo", () => {
    const r = checkImportUrl("https://exemplo.com/pasta/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_FILE_NAME");
  });

  it("NÃO é a trava de verdade: nome público que resolve para IP privado passa aqui", () => {
    // A checagem que vale resolve o DNS e roda no agente (fetch-source.ts). Este módulo só dá
    // mensagem boa cedo — confundir os dois é trancar a porta da frente e deixar a de trás
    // encostada.
    expect(checkImportUrl("https://interno.exemplo.com/a.jpg").ok).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/nas/import-source.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar**

Crie `lib/nas/import-source.ts`:

```ts
// Leitura da origem de uma importação. PURO — sem rede, sem DNS: serve para o app recusar cedo,
// com mensagem útil, o que nem valeria a pena mandar para o agente. A trava de verdade contra
// varredura da LAN resolve o DNS e vive no agente (nas-poc/agent/src/fetch-source.ts), porque só
// lá se sabe para onde um nome público realmente aponta.

export type ImportUrlProblem = "MALFORMED" | "SCHEME" | "PRIVATE_HOST" | "NO_FILE_NAME";

export const IMPORT_FAILURE_CODES = [
  "TOO_LARGE",
  "NOT_A_FILE",
  "EXECUTABLE",
  "SOURCE_UNREACHABLE",
  "SOURCE_REFUSED",
  "PRIVATE_HOST",
  "TOO_MANY_REDIRECTS",
  "TIMEOUT",
  "WRITE_FAILED",
] as const;

export type ImportFailureCode = (typeof IMPORT_FAILURE_CODES)[number];

/** Nome de arquivo que a URL promete, ou null quando o caminho não termina em algo com extensão. */
export function deriveFileNameFromUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const last = u.pathname.split("/").filter(Boolean).pop();
  if (!last) return null;
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* percent-encoding inválido: fica o cru */
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name;
}

// Literais que não precisam de DNS para serem recusados.
const LOCAL_HOSTS = new Set(["localhost", "localhost.localdomain", "ip6-localhost"]);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local (metadata de nuvem)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(h)) return true; // unique-local fc00::/7
  const mapped = /^::ffff:(.+)$/.exec(h);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

export function checkImportUrl(
  rawUrl: string
): { ok: true; url: URL } | { ok: false; reason: ImportUrlProblem } {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "SCHEME" };
  }
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return { ok: false, reason: "PRIVATE_HOST" };
  }
  if (!deriveFileNameFromUrl(rawUrl)) {
    return { ok: false, reason: "NO_FILE_NAME" };
  }
  return { ok: true, url: u };
}
```

Nota para quem implementa: `new URL("http://[::1]/a.jpg").hostname` devolve `"[::1]"` **com** os colchetes — por isso o `isPrivateIpv6` os remove antes de comparar. Se o caso do `[::1]` passar sem esse `replace`, desconfie: provavelmente está passando por outro motivo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/nas/import-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/nas/import-source.ts __tests__/lib/nas/import-source.test.ts
git commit -m "feat(nas): a leitura pura da origem de uma importação"
```

---

### Task 4: a ação que enfileira a importação

O artefato nasce `NAS_UPLOAD` + `PENDING` + `url` — combinação que hoje não existe, porque upload pelo navegador nasce **sem** `url`. É a fila, e ela já cabia no modelo.

O caminho selado (pasta e nome no NAS) é calculado **agora**, no enfileiramento, exatamente como no upload — e é por isso que a importação exige link direto: sem nome de arquivo na URL não há extensão, sem extensão não há pasta nem allowlist, e o agente receberia uma ordem que não sabe cumprir.

**Files:**

- Modify: `lib/actions/artifact.ts:76-95` (`VersionParams`), `:101-186` (`createArtifactWithVersion`), `:194-260` (extrair a resolução do dono de `prepareArtifactUpload`)
- Create: `lib/actions/artifact-import.ts`
- Modify: `lib/validations.ts` (novo `importArtifactSchema`)
- Modify: `lib/nas/import-source.ts` (mapa `URL_PROBLEM_KEY`)
- Modify: `lib/nas/config.ts` (`isNasImportConfigured`)
- Modify: `prisma/schema.prisma` (só o comentário de `TaskArtifact.url`)
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/artifact-import.test.ts`

**Interfaces:**

- Consumes: `checkImportUrl`, `deriveFileNameFromUrl` (Task 3); `ALLOWLIST`/`normalizeExtension` com FIGMA (Task 1).
- Produces:
  - `enqueueArtifactImport(input: unknown): Promise<{ error: string } | { success: true; artifact: { id: string } }>`
  - `resolveArtifactOwner(data)` exportada de `lib/actions/artifact.ts` para reuso na Task 8
  - `createArtifactWithVersion` aceitando `mimeType: string | null`, `sizeBytes: number | null`, `title?: string`, `sourceUrl?: string | null`

- [ ] **Step 1: Escrever os testes que falham**

Crie `__tests__/lib/actions/artifact-import.test.ts` (mesmas convenções de mock de `__tests__/lib/actions/scoped-artifact-actions.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn(),
  requireManagerOrAdmin: vi.fn(),
}));
vi.mock("@/lib/nas/config", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isNasImportConfigured: () => true,
}));

const created: Record<string, unknown>[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: vi.fn().mockResolvedValue({
        id: "t1",
        title: "Post de lançamento",
        project: { client: { folderName: "Cliente Um" } },
      }),
    },
    taskArtifact: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: "a1" });
      }),
      update: vi.fn(),
    },
    artifactAuditLog: { create: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({
        taskArtifact: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn((args: { data: Record<string, unknown> }) => {
            created.push(args.data);
            return Promise.resolve({ id: "a1" });
          }),
          update: vi.fn(),
        },
      })
    ),
  },
  default: {},
}));

import { requireMemberOrHigher } from "@/lib/permissions";
import { enqueueArtifactImport } from "@/lib/actions/artifact-import";

const base = {
  scope: "TASK" as const,
  taskId: "t1",
  title: "Foto do cliente",
  url: "https://exemplo.com/foto.jpg",
  mediaType: "FOTOS" as const,
  sensitivity: "CLIENTE" as const,
};

describe("enqueueArtifactImport", () => {
  beforeEach(() => {
    created.length = 0;
    vi.clearAllMocks();
    vi.mocked(requireMemberOrHigher).mockResolvedValue({ id: "u1", role: "MEMBER" } as never);
  });

  it("cria o artefato na fila: NAS_UPLOAD + PENDING + a origem em url", async () => {
    const res = await enqueueArtifactImport(base);
    expect(res).toMatchObject({ success: true });
    const row = created.at(-1)!;
    expect(row.storageKind).toBe("NAS_UPLOAD");
    expect(row.uploadStatus).toBe("PENDING");
    expect(row.url).toBe("https://exemplo.com/foto.jpg");
    expect(row.mediaType).toBe("FOTOS");
    expect(row.sensitivity).toBe("CLIENTE");
  });

  it("guarda o nome que a pessoa deu, e o nome do arquivo vem da URL", async () => {
    await enqueueArtifactImport(base);
    const row = created.at(-1)!;
    expect(row.title).toBe("Foto do cliente");
    expect(row.originalFileName).toBe("foto.jpg");
  });

  it("sela o caminho no NAS já no enfileiramento", async () => {
    await enqueueArtifactImport(base);
    const row = created.at(-1)!;
    expect(row.nasPath).toContain("/fotos/");
    expect(String(row.fileName)).toMatch(/\.jpg$/);
  });

  it("não grava tamanho nem MIME — ninguém os conhece antes de baixar", async () => {
    await enqueueArtifactImport(base);
    const row = created.at(-1)!;
    expect(row.sizeBytes).toBeNull();
    expect(row.mimeType).toBeNull();
  });

  it("não grava o `type` legado", async () => {
    await enqueueArtifactImport(base);
    expect(created.at(-1)!).not.toHaveProperty("type");
  });

  it("recusa link que não aponta para um arquivo", async () => {
    const res = await enqueueArtifactImport({
      ...base,
      url: "https://drive.google.com/file/d/1a2b/view",
    });
    expect(res).toMatchObject({ error: "importNoFileName" });
  });

  it("recusa destino privado antes de enfileirar", async () => {
    const res = await enqueueArtifactImport({ ...base, url: "http://192.168.200.216/a.jpg" });
    expect(res).toMatchObject({ error: "importPrivateHost" });
  });

  it("recusa tipo que só existe como link", async () => {
    for (const mediaType of ["FIGMA", "OUTROS"] as const) {
      const res = await enqueueArtifactImport({ ...base, mediaType });
      expect(res, mediaType).toMatchObject({ error: "mediaTypeLinkOnly" });
    }
    expect(created).toHaveLength(0);
  });

  it("recusa extensão que o tipo de mídia não aceita", async () => {
    const res = await enqueueArtifactImport({
      ...base,
      url: "https://exemplo.com/filme.mp4",
      mediaType: "FOTOS",
    });
    expect(res).toHaveProperty("error");
    expect(created).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/artifact-import.test.ts`
Expected: FAIL — `lib/actions/artifact-import.ts` não existe.

- [ ] **Step 3: Abrir `createArtifactWithVersion` para tamanho e MIME desconhecidos**

Em `lib/actions/artifact.ts`, no `VersionParams`, troque três campos e acrescente dois:

```ts
  originalFileName: string;
  /** Null na importação: ninguém conhece o MIME antes de baixar. */
  mimeType: string | null;
  /** Null na importação: o tamanho real chega no finalize. */
  sizeBytes: number | null;
  /** Título exibido. Upload usa o nome do arquivo; importação usa o nome que a pessoa deu. */
  title?: string;
  /** Origem dos bytes (importação). Null no upload pelo navegador. */
  sourceUrl?: string | null;
```

E no `data` do `create` (linha ~150), quatro linhas mudam e uma sai:

```ts
            title: params.title ?? params.originalFileName,
            url: params.sourceUrl ?? null,
            mimeType: params.mimeType,
            sizeBytes: params.sizeBytes != null ? BigInt(params.sizeBytes) : null,
```

Apague a linha `type: "OTHER",`: a coluna já tem esse default, e nenhum código novo grava `type` (constraint global). Comportamento idêntico, uma escrita legada a menos.

Em `prepareArtifactUpload`, nenhuma chamada muda — ela já passa `mimeType` e `sizeBytes` não-nulos.

- [ ] **Step 4: Extrair a resolução do dono**

Ainda em `lib/actions/artifact.ts`, tire de `prepareArtifactUpload` o bloco que resolve `folderName`/`ownerName`/`ownerId`/ids (linhas ~215-255) para uma função exportada. Duas ações vão precisar dela (esta e a Task 8), e três cópias divergem na primeira mudança de escopo:

```ts
export interface ArtifactOwnerContext {
  folderName: string;
  ownerName?: string;
  ownerId?: string;
  taskId: string | null;
  projectId: string | null;
  clientId: string | null;
}

export type OwnerErrorKey =
  | "demandNotFound"
  | "projectNotFound"
  | "clientNotFound"
  | "clientWithoutFolder";

/**
 * Resolve a raiz do cliente e o nome/id do dono conforme o escopo. Devolve a CHAVE do erro — quem
 * chama sabe de qual dicionário traduzir (`demandNotFound`/`clientWithoutFolder` vivem em
 * errors.artifact; `projectNotFound`/`clientNotFound`, em errors.common).
 */
export async function resolveArtifactOwner(data: {
  scope: "TASK" | "PROJECT" | "CLIENT";
  taskId?: string | null;
  projectId?: string | null;
  clientId?: string | null;
}): Promise<{ ok: true; ctx: ArtifactOwnerContext } | { ok: false; errorKey: OwnerErrorKey }> {
  if (data.scope === "TASK") {
    const task = await prisma.task.findUnique({
      where: { id: data.taskId ?? "" },
      select: {
        id: true,
        title: true,
        project: { select: { client: { select: { folderName: true } } } },
      },
    });
    if (!task) return { ok: false, errorKey: "demandNotFound" };
    if (!task.project.client.folderName) return { ok: false, errorKey: "clientWithoutFolder" };
    return {
      ok: true,
      ctx: {
        folderName: task.project.client.folderName,
        ownerName: task.title,
        ownerId: task.id,
        taskId: task.id,
        projectId: null,
        clientId: null,
      },
    };
  }
  if (data.scope === "PROJECT") {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId ?? "" },
      select: { id: true, name: true, client: { select: { folderName: true } } },
    });
    if (!project) return { ok: false, errorKey: "projectNotFound" };
    if (!project.client.folderName) return { ok: false, errorKey: "clientWithoutFolder" };
    return {
      ok: true,
      ctx: {
        folderName: project.client.folderName,
        ownerName: project.name,
        ownerId: project.id,
        taskId: null,
        projectId: project.id,
        clientId: null,
      },
    };
  }
  const client = await prisma.client.findUnique({
    where: { id: data.clientId ?? "" },
    select: { id: true, folderName: true },
  });
  if (!client) return { ok: false, errorKey: "clientNotFound" };
  if (!client.folderName) return { ok: false, errorKey: "clientWithoutFolder" };
  return {
    ok: true,
    ctx: {
      folderName: client.folderName,
      taskId: null,
      projectId: null,
      clientId: client.id,
    },
  };
}
```

`prepareArtifactUpload` passa a usar:

```ts
const owner = await resolveArtifactOwner(data);
if (!owner.ok) {
  const msg =
    owner.errorKey === "projectNotFound" || owner.errorKey === "clientNotFound"
      ? tc(owner.errorKey)
      : t(owner.errorKey);
  return { error: msg };
}
const { folderName, ownerName, ownerId, taskId, projectId, clientId } = owner.ctx;
```

A suíte de upload existente é o guarda desta extração: se `npm test` continuar verde, o comportamento não mudou.

- [ ] **Step 5: Schema, mapa de erro e portão de configuração**

`lib/validations.ts`, depois de `prepareArtifactUploadSchema`:

```ts
// enqueueArtifactImport — o artefato nasce NAS_UPLOAD/PENDING com a ORIGEM em `url`. Sem
// originalFileName/mimeType/sizeBytes: o nome sai da URL e o resto só se conhece depois de baixar.
export const importArtifactSchema = z
  .object({
    scope: z.enum(["TASK", "PROJECT", "CLIENT"]).default("TASK"),
    taskId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    title: z.string().min(1, "Nome do artefato é obrigatório").max(200),
    url: z.string().url("URL inválida"),
    mediaType: artifactMediaTypeEnum,
    sensitivity: sensitivityEnum.default("INTERNO"),
    stageId: z.string().optional(),
  })
  .refine(
    (d) =>
      (d.scope === "TASK" && !!d.taskId) ||
      (d.scope === "PROJECT" && !!d.projectId) ||
      (d.scope === "CLIENT" && !!d.clientId),
    { message: "Escopo requer o id do dono correspondente.", path: ["scope"] }
  );

export type ImportArtifactInput = z.infer<typeof importArtifactSchema>;
```

`lib/nas/import-source.ts`, ao final (constante não pode morar em arquivo `"use server"`):

```ts
/** Chave de i18n (em `errors.artifact`) para cada recusa de URL. */
export const URL_PROBLEM_KEY: Record<ImportUrlProblem, string> = {
  MALFORMED: "importMalformedUrl",
  SCHEME: "importSchemeNotAllowed",
  PRIVATE_HOST: "importPrivateHost",
  NO_FILE_NAME: "importNoFileName",
};
```

`lib/nas/config.ts`:

```ts
/** True quando o agente consegue perguntar a fila de importação (mesmo segredo do finalize). */
export function isNasImportConfigured(): boolean {
  return Boolean(env.NAS_FINALIZE_SECRET);
}
```

Sem o segredo, o agente não pergunta nada e a linha ficaria PENDING para sempre — enfileirar seria prometer o que não vai acontecer.

- [ ] **Step 6: A ação**

Crie `lib/actions/artifact-import.ts`:

```ts
"use server";

// Importação de um artefato registrado por link para dentro do NAS. Aqui só se ENFILEIRA: o
// artefato nasce NAS_UPLOAD/PENDING com a origem em `url`, e quem baixa é o agente da LAN — a
// Vercel não alcança o NAS, então o tráfego anda no sentido que já funciona (agente -> nuvem).

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireMemberOrHigher, requireManagerOrAdmin } from "@/lib/permissions";
import { importArtifactSchema } from "@/lib/validations";
import { checkImportUrl, deriveFileNameFromUrl, URL_PROBLEM_KEY } from "@/lib/nas/import-source";
import { isNasImportConfigured } from "@/lib/nas/config";
import { NasPathError, isUploadableMediaType, normalizeExtension } from "@/lib/nas/path";
import { createArtifactWithVersion, resolveArtifactOwner } from "@/lib/actions/artifact";

export async function enqueueArtifactImport(input: unknown) {
  const t = await getTranslations("errors.artifact");
  const tc = await getTranslations("errors.common");
  try {
    const parsed = importArtifactSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    // RBAC igual ao do upload: tarefa = membro+; projeto/cliente = MANAGER+.
    const user =
      data.scope === "TASK" ? await requireMemberOrHigher() : await requireManagerOrAdmin();

    if (!isNasImportConfigured()) return { error: t("importNotConfigured") };

    // Tipo só de link não vira arquivo. A recusa é aqui, com a frase certa — o formulário
    // desabilita o botão, mas o botão não é a trava.
    if (!isUploadableMediaType(data.mediaType)) return { error: t("mediaTypeLinkOnly") };

    const check = checkImportUrl(data.url);
    if (!check.ok) return { error: t(URL_PROBLEM_KEY[check.reason]) };

    const originalFileName = deriveFileNameFromUrl(data.url) as string;
    try {
      normalizeExtension(originalFileName, data.mediaType);
    } catch (e) {
      if (e instanceof NasPathError) return { error: e.message };
      throw e;
    }

    const owner = await resolveArtifactOwner(data);
    if (!owner.ok) {
      const isCommon = owner.errorKey === "projectNotFound" || owner.errorKey === "clientNotFound";
      return { error: isCommon ? tc(owner.errorKey) : t(owner.errorKey) };
    }
    const { folderName, ownerName, ownerId, taskId, projectId, clientId } = owner.ctx;

    const artifact = await createArtifactWithVersion({
      scope: data.scope,
      taskId,
      projectId,
      clientId,
      userId: user.id as string,
      folderName,
      ownerName,
      ownerId,
      mediaType: data.mediaType,
      purposeId: null,
      purposeLabel: "",
      originalFileName,
      mimeType: null,
      sizeBytes: null,
      sensitivity: data.sensitivity,
      stageId: data.stageId,
      title: data.title.trim(),
      sourceUrl: data.url.trim(),
    });

    await prisma.artifactAuditLog.create({
      data: {
        artifactId: artifact.id,
        eventType: "IMPORT_ENQUEUED",
        metadata: { url: data.url, mediaType: data.mediaType },
      },
    });

    if (taskId) {
      revalidatePath(`/tasks/${taskId}`);
      revalidatePath(`/admin/tasks/${taskId}`);
    }
    if (projectId) revalidatePath(`/admin/projects/${projectId}`);
    if (clientId) revalidatePath(`/admin/clients/${clientId}`);

    return { success: true as const, artifact: { id: artifact.id } };
  } catch (error) {
    console.error("enqueueArtifactImport error:", error);
    return { error: t("importFailed") };
  }
}
```

`createArtifactWithVersion` precisa deixar de ser privada: troque `async function` por `export async function` em `lib/actions/artifact.ts`. Ela vive em arquivo `"use server"` e é async — o contrato do Next continua respeitado.

- [ ] **Step 7: Comentário do `url` no schema**

`prisma/schema.prisma`, no `TaskArtifact`:

```prisma
  url       String? // o link (LINK) ou a ORIGEM de onde os bytes vieram (NAS_UPLOAD importado)
```

É procedência, e continua útil depois de READY: responde "de onde veio este arquivo?" seis meses depois. Só comentário — sem migração.

- [ ] **Step 8: Textos de erro nos dois locales**

`locales/pt-BR/errors.json` → `artifact`:

```json
    "importNotConfigured": "A importação para o NAS não está configurada neste ambiente.",
    "importMalformedUrl": "O endereço informado não é uma URL válida.",
    "importSchemeNotAllowed": "Só é possível importar de endereços http ou https.",
    "importPrivateHost": "Esse endereço aponta para dentro da rede e não pode ser importado.",
    "importNoFileName": "O link precisa apontar direto para o arquivo (terminando no nome dele, com extensão). Links de pasta ou de visualização não servem.",
    "importFailed": "Não foi possível enfileirar a importação."
```

`locales/es-ES/errors.json` → `artifact` (espanhol real, não português com sotaque):

```json
    "importNotConfigured": "La importación al NAS no está configurada en este entorno.",
    "importMalformedUrl": "La dirección indicada no es una URL válida.",
    "importSchemeNotAllowed": "Solo se puede importar desde direcciones http o https.",
    "importPrivateHost": "Esa dirección apunta al interior de la red y no se puede importar.",
    "importNoFileName": "El enlace debe apuntar directamente al archivo (terminando en su nombre, con extensión). Los enlaces de carpeta o de vista previa no sirven.",
    "importFailed": "No se ha podido poner la importación en cola."
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/artifact-import.test.ts && npm test`
Expected: PASS nos dois — a suíte inteira é o guarda da extração do Step 4.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(nas): a ação que põe um link na fila de importação"
```

---

### Task 5: a aba de link ganha a forma da aba de upload

Nome na primeira linha, tipo de mídia e sensibilidade na segunda, ações na terceira — os mesmos rótulos da aba de upload. Uma tela só para aprender, e o "Importar" não cobra um segundo formulário de quem já preencheu o primeiro.

A sensibilidade **vale para link também**: é a etiqueta do artefato e é o que vai definir o que o cliente enxerga. Hoje nenhum caminho de criação de link a grava — todos caem no padrão `INTERNO` —, e é isso que esta task conserta daqui para frente.

**Files:**

- Modify: `components/artifacts/AddArtifactForm.tsx` (o formulário inteiro do modo link)
- Modify: `lib/actions/task.ts:2116-2160` (`addLinkArtifact`)
- Modify: `lib/actions/artifact.ts:594-628` (`addScopedLinkArtifact`)
- Modify: `lib/validations.ts:131-158` (`scopedLinkArtifactSchema`)
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`
- Test: `__tests__/components/AddArtifactForm.test.tsx` (criar), `__tests__/lib/actions/scoped-artifact-actions.test.ts` (estender)

**Interfaces:**

- Consumes: `enqueueArtifactImport` (Task 4); `artifactMediaTypeEnum` com FIGMA (Task 1).
- Produces:
  - `addLinkArtifact(taskId: string, title: string, url: string, mediaType: ArtifactMediaType, sensitivity: SensitivityLevel)`
  - `addScopedLinkArtifact({ scope, projectId, clientId, title, url, mediaType, sensitivity })`
  - ambas gravam `mediaType` + `sensitivity` e **não** gravam `type`.

- [ ] **Step 1: Escrever os testes que falham (ações)**

Em `__tests__/lib/actions/scoped-artifact-actions.test.ts`, dentro do `describe("addScopedLinkArtifact")`:

```ts
it("grava mediaType e sensibilidade, e não grava o type legado", async () => {
  const { prisma } = await import("@/lib/prisma");
  await addScopedLinkArtifact({
    scope: "CLIENT",
    clientId: "c1",
    title: "Manual da marca",
    url: "https://exemplo.com/manual.pdf",
    mediaType: "DOCUMENTOS",
    sensitivity: "CLIENTE",
  });
  const data = vi.mocked(prisma.taskArtifact.create).mock.calls.at(-1)![0].data;
  expect(data.mediaType).toBe("DOCUMENTOS");
  expect(data.sensitivity).toBe("CLIENTE");
  expect(data).not.toHaveProperty("type");
  expect(data.storageKind).toBe("LINK");
  expect(data.uploadStatus).toBe("READY");
});

it("exige o tipo de mídia", async () => {
  const res = await addScopedLinkArtifact({
    scope: "CLIENT",
    clientId: "c1",
    title: "x",
    url: "https://exemplo.com/a.pdf",
    sensitivity: "INTERNO",
  });
  expect(res).toHaveProperty("error");
});
```

Um link continua `LINK`/`READY`: ele não tem bytes nossos, então não passa por fila nenhuma. Só o **import** nasce `NAS_UPLOAD`/`PENDING`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/scoped-artifact-actions.test.ts`
Expected: FAIL — a ação ainda grava `type` e ignora `mediaType`/`sensitivity`.

- [ ] **Step 3: Trocar o schema e as duas ações**

`lib/validations.ts` — no `scopedLinkArtifactSchema`, troque a linha do `type` por:

```ts
    mediaType: artifactMediaTypeEnum,
    sensitivity: sensitivityEnum.default("INTERNO"),
```

e apague o `linkArtifactTypeEnum` se ele ficar sem uso (`grep -rn "linkArtifactTypeEnum" lib` antes de apagar).

`lib/actions/artifact.ts`, em `addScopedLinkArtifact`: destruture `mediaType, sensitivity` no lugar de `type` e troque o `data` do create:

```ts
      data: {
        scope,
        projectId: projectId ?? null,
        clientId: clientId ?? null,
        title: title.trim(),
        url: url.trim(),
        mediaType,
        sensitivity,
        userId: user.id as string,
        storageKind: "LINK",
        uploadStatus: "READY",
      },
```

`lib/actions/task.ts`, em `addLinkArtifact`: troque o parâmetro `type` por dois e o `data` do create:

```ts
export async function addLinkArtifact(
  taskId: string,
  title: string,
  url: string,
  mediaType: ArtifactMediaType,
  sensitivity: SensitivityLevel = "INTERNO"
) {
```

```ts
      data: {
        taskId,
        userId,
        title: title.trim(),
        url: url.trim(),
        mediaType,
        sensitivity,
      },
```

Importe os dois tipos de `@prisma/client`. O resto da função (validações de título/URL, `include`, `revalidatePath`) fica como está.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/scoped-artifact-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Escrever o teste do formulário**

Crie `__tests__/components/AddArtifactForm.test.tsx`, no estilo dos testes de componente já existentes em `__tests__/components/`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addLink = vi.fn().mockResolvedValue({ success: true });
const enqueue = vi.fn().mockResolvedValue({ success: true, artifact: { id: "a1" } });

vi.mock("@/lib/actions/task", () => ({ addLinkArtifact: addLink }));
vi.mock("@/lib/actions/artifact", () => ({ addScopedLinkArtifact: vi.fn() }));
vi.mock("@/lib/actions/artifact-import", () => ({ enqueueArtifactImport: enqueue }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/tasks/UploadArtifactForm", () => ({
  UploadArtifactForm: () => <div>upload</div>,
}));

import { AddArtifactForm } from "@/components/artifacts/AddArtifactForm";
// … envolver com o provider de i18n usado pelos outros testes de componente deste repo.

describe("AddArtifactForm — aba de link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tem nome, tipo de mídia e sensibilidade, com os rótulos da aba de upload", () => {
    renderForm();
    expect(screen.getByLabelText(/tipo de mídia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sensibilidade/i)).toBeInTheDocument();
  });

  it("adicionar manda mediaType e sensibilidade", async () => {
    renderForm();
    await preencher({ nome: "Foto", url: "https://exemplo.com/foto.jpg" });
    await userEvent.click(screen.getByRole("button", { name: /adicionar/i }));
    await waitFor(() =>
      expect(addLink).toHaveBeenCalledWith(
        "t1",
        "Foto",
        "https://exemplo.com/foto.jpg",
        expect.any(String),
        expect.any(String)
      )
    );
  });

  it("importar para o NAS usa a mesma resposta do formulário", async () => {
    renderForm();
    await preencher({ nome: "Foto", url: "https://exemplo.com/foto.jpg" });
    await userEvent.click(screen.getByRole("button", { name: /importar para o nas/i }));
    await waitFor(() =>
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "TASK",
          taskId: "t1",
          title: "Foto",
          url: "https://exemplo.com/foto.jpg",
        })
      )
    );
    expect(addLink).not.toHaveBeenCalled();
  });

  it("importar fica desabilitado quando o tipo só existe como link", async () => {
    renderForm();
    await preencher({ nome: "Tela", url: "https://figma.com/file/abc" });
    await escolherTipo("Figma");
    expect(screen.getByRole("button", { name: /importar para o nas/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^adicionar$/i })).toBeEnabled();
    expect(screen.getByText(/só como link/i)).toBeInTheDocument();
  });

  it("os dois botões ficam desabilitados sem nome ou sem URL", async () => {
    renderForm();
    expect(screen.getByRole("button", { name: /^adicionar$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /importar para o nas/i })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run __tests__/components/AddArtifactForm.test.tsx`
Expected: FAIL — não existem os campos nem o botão de importar.

- [ ] **Step 7: Reescrever o modo link do formulário**

Em `components/artifacts/AddArtifactForm.tsx`: troque o estado `type` por `mediaType`/`sensitivity`, apague `TYPE_OPTIONS` e o import de `ArtifactType`, e substitua o bloco do modo link. As listas e os rótulos são os mesmos da aba de upload (`tasks.upload.*`), de propósito:

```tsx
import { LINK_ONLY_MEDIA_TYPES, UPLOADABLE_MEDIA_TYPES } from "@/lib/nas/path";

// A aba de LINK oferece os sete: link de Figma é justamente o que FIGMA existe para classificar.
// O que muda é o que se pode IMPORTAR — daí a lista dos só-de-link, logo abaixo.
const MEDIA_TYPES = [...UPLOADABLE_MEDIA_TYPES, ...LINK_ONLY_MEDIA_TYPES];
const SENSITIVITIES = ["INTERNO", "CLIENTE", "CONFIDENCIAL"];
```

```tsx
const [mediaType, setMediaType] = useState("DOCUMENTOS");
const [sensitivity, setSensitivity] = useState("INTERNO");

const camposOk = Boolean(title.trim() && url.trim());
// FIGMA e OUTROS existem só como link: importar não é uma opção, e a tela precisa dizer isso ANTES
// do clique. Um botão que só recusa depois de apertado ensina que o sistema é aleatório.
const soLink = (LINK_ONLY_MEDIA_TYPES as readonly string[]).includes(mediaType);

const validarUrl = (): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    toast.error(t("invalidUrl"));
    return false;
  }
};

const handleAddLink = () => {
  if (!camposOk) return toast.error(t("requiredFields"));
  if (!validarUrl()) return;
  startTransition(async () => {
    const res =
      scope === "TASK"
        ? await addLinkArtifact(
            ownerIds.taskId as string,
            title,
            url,
            mediaType as ArtifactMediaType,
            sensitivity as SensitivityLevel
          )
        : await addScopedLinkArtifact({
            scope,
            projectId: scope === "PROJECT" ? ownerIds.projectId : undefined,
            clientId: scope === "CLIENT" ? ownerIds.clientId : undefined,
            title,
            url,
            mediaType,
            sensitivity,
          });
    finalizar(res, t("addedSuccess"));
  });
};

const handleImport = () => {
  if (!camposOk) return toast.error(t("requiredFields"));
  if (!validarUrl()) return;
  startTransition(async () => {
    const res = await enqueueArtifactImport({
      scope,
      taskId: ownerIds.taskId,
      projectId: ownerIds.projectId,
      clientId: ownerIds.clientId,
      title,
      url,
      mediaType,
      sensitivity,
    });
    finalizar(res, t("importQueued"));
  });
};

const finalizar = (res: { error?: string } | undefined, sucesso: string) => {
  if (res && "error" in res && res.error) return toast.error(res.error);
  setTitle("");
  setUrl("");
  setMediaType("DOCUMENTOS");
  setSensitivity("INTERNO");
  toast.success(sucesso);
  router.refresh();
};
```

E o corpo, nas três linhas prometidas:

```tsx
<div className="space-y-3">
  <div className="space-y-2">
    <Label htmlFor="link-title" className="text-sm">
      {t("name")}
    </Label>
    <Input
      id="link-title"
      type="text"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      placeholder={t("titleInputPlaceholder")}
      disabled={isPending}
    />
  </div>

  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor="link-mediaType" className="text-sm">
        {tUpload("mediaTypeLabel")}
      </Label>
      <Select value={mediaType} onValueChange={setMediaType} disabled={isPending}>
        <SelectTrigger id="link-mediaType">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEDIA_TYPES.map((m) => (
            <SelectItem key={m} value={m}>
              {t(`mediaTypes.${m}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-2">
      <Label htmlFor="link-sensitivity" className="text-sm">
        {tUpload("sensitivityLabel")}
      </Label>
      <Select value={sensitivity} onValueChange={setSensitivity} disabled={isPending}>
        <SelectTrigger id="link-sensitivity">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SENSITIVITIES.map((s) => (
            <SelectItem key={s} value={s}>
              {tUpload(`sensitivities.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>

  <div className="space-y-2">
    <Label htmlFor="link-url" className="text-sm">
      {t("url")}
    </Label>
    <Input
      id="link-url"
      type="url"
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      placeholder={t("urlPlaceholder")}
      disabled={isPending}
    />
  </div>

  <p className="text-xs text-muted-foreground">{t("importHint")}</p>

  <div className="flex flex-wrap items-center gap-2">
    <Button type="button" onClick={handleAddLink} disabled={isPending || !camposOk}>
      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {tCommon("buttons.add")}
    </Button>
    <Button
      type="button"
      variant="outline"
      onClick={handleImport}
      disabled={isPending || !camposOk || soLink}
    >
      <Download className="mr-2 h-4 w-4" />
      {t("importToNas")}
    </Button>
  </div>

  {soLink && <p className="text-xs text-muted-foreground">{t("importLinkOnlyType")}</p>}
</div>
```

Acrescente `const tUpload = useTranslations("tasks.upload");` e os imports de `Label`, `Button` e `Download` (lucide-react).

- [ ] **Step 8: Textos nos dois locales**

`locales/pt-BR/tasks.json` → `artifacts`:

```json
    "importToNas": "Importar para o NAS",
    "importQueued": "Na fila: o agente vai buscar o arquivo e avisar quando estiver no NAS.",
    "importLinkOnlyType": "Figma e Outros existem só como link — esses tipos não recebem arquivo no NAS.",
    "importHint": "Adicionar guarda só o link — o arquivo continua na origem. Importar traz uma cópia para o NAS, e para isso o link precisa apontar direto para o arquivo. A sensibilidade vale nos dois casos: é ela que define o que o cliente enxerga."
```

`locales/es-ES/tasks.json` → `artifacts`:

```json
    "importToNas": "Importar al NAS",
    "importQueued": "En cola: el agente buscará el archivo y avisará cuando esté en el NAS.",
    "importLinkOnlyType": "Figma y Otros existen solo como enlace: esos tipos no admiten archivos en el NAS.",
    "importHint": "Añadir guarda solo el enlace: el archivo sigue en su origen. Importar trae una copia al NAS, y para eso el enlace debe apuntar directamente al archivo. La sensibilidad vale en ambos casos: es la que define lo que ve el cliente."
```

O `importHint` não é enfeite. Sem ele, "Adicionar" e "Importar" parecem duas palavras para a mesma coisa, e a diferença entre elas — o arquivo ser nosso ou de outra pessoa — é a razão inteira desta entrega.

- [ ] **Step 9: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Se algum outro chamador de `addLinkArtifact` aparecer no `tsc`, ajuste-o para a assinatura nova.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(artefatos): a aba de link com a forma da de upload, e o botão de importar"
```

---

### Task 6: o endpoint que o agente consulta

O agente pergunta o que há para importar. Mesmo HMAC com timestamp do `finalize` — nenhuma autenticação nova: o canal agente→app já existe, já está assinado e já está em produção.

Como só existe um agente, reservar trabalho é simples: ele marca o que pegou como `UPLOADING` com carimbo de tempo, e um item preso volta para a fila. Esse carimbo é a única coluna nova da entrega.

**Files:**

- Modify: `prisma/schema.prisma` (`TaskArtifact.importClaimedAt`)
- Create: `prisma/migrations/20260903130000_artifact_import_claimed_at/migration.sql`
- Create: `app/api/artifacts/import-queue/route.ts`
- Modify: `lib/nas/config.ts` (`IMPORT_LEASE_MS`, `IMPORT_QUEUE_MAX`)
- Test: `__tests__/lib/nas/import-queue.test.ts`

**Interfaces:**

- Consumes: `verifyFinalizeSignature`, `getFinalizeSecret` (já existem); `ALLOWLIST` com FIGMA (Task 1); artefatos criados pela Task 4.
- Produces: `POST /api/artifacts/import-queue` → `{ items: Array<{ artifactId, url, nasPath, fileName, mediaType, maxBytes }> }`. O agente (Task 11) consome exatamente esta forma.

- [ ] **Step 1: A coluna do carimbo**

`prisma/schema.prisma`, no `TaskArtifact`, junto dos campos de NAS:

```prisma
  // Reserva da importação: quando o agente pegou este item. Um item preso em UPLOADING por mais
  // que IMPORT_LEASE_MS volta para a fila (agente reiniciado no meio do download).
  importClaimedAt DateTime?
```

`prisma/migrations/20260903130000_artifact_import_claimed_at/migration.sql`:

```sql
-- Reserva da fila de importação. Nulo em toda linha existente: nenhum upload de navegador é
-- afetado (eles nascem sem `url`, e a fila só olha NAS_UPLOAD + PENDING + url não-nulo).
ALTER TABLE "TaskArtifact" ADD COLUMN "importClaimedAt" TIMESTAMP(3);
```

Run: `npx prisma migrate deploy && npx prisma generate`

Em `lib/nas/config.ts`:

```ts
// Reserva da fila de importação. Generosa de propósito: um vídeo grande numa origem lenta pode
// levar horas, e devolver à fila um download que ainda está andando é pior que esperar.
export const IMPORT_LEASE_MS = 2 * 60 * 60 * 1000; // 2h
export const IMPORT_QUEUE_MAX = 10;
```

- [ ] **Step 2: Escrever os testes que falham**

Crie `__tests__/lib/nas/import-queue.test.ts` (`// @vitest-environment node` no topo, como em `agent-contract.test.ts`). Mock do prisma e do segredo; chame o handler `POST` diretamente com uma `Request` assinada:

```ts
function assinada(body: object, secret = "s3cr3t") {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request("http://localhost/api/artifacts/import-queue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nas-timestamp": ts,
      "x-nas-signature": computeFinalizeSignature(secret, ts, raw),
    },
    body: raw,
  });
}
```

Os casos:

```ts
it("recusa quem não assina", async () => {
  const res = await POST(
    new Request("http://localhost/x", { method: "POST", body: "{}" }) as never
  );
  expect(res.status).toBe(401);
});

it("entrega o pendente com o caminho selado e o teto do tipo", async () => {
  // artefato: NAS_UPLOAD, PENDING, url != null, mediaType FOTOS
  const res = await POST(assinada({ agentId: "a1" }) as never);
  const json = await res.json();
  expect(json.items).toHaveLength(1);
  expect(json.items[0]).toMatchObject({
    artifactId: "art1",
    url: "https://exemplo.com/foto.jpg",
    maxBytes: 150 * 1024 * 1024, // ALLOWLIST.FOTOS
  });
});

it("NÃO entrega upload de navegador parado em PENDING (url nulo)", async () => {
  // Este é o caso que estraga tudo em silêncio: o agente tentaria baixar `null`, e um upload
  // que só esperava os bytes do navegador seria marcado como falho.
  const res = await POST(assinada({ agentId: "a1" }) as never);
  expect((await res.json()).items).toHaveLength(0);
});

it("não entrega o mesmo item duas vezes", async () => {
  await POST(assinada({ agentId: "a1" }) as never);
  const res2 = await POST(assinada({ agentId: "a1" }) as never);
  expect((await res2.json()).items).toHaveLength(0);
});

it("devolve à fila o item preso em UPLOADING além da reserva", async () => {
  // importClaimedAt = agora - 3h, com IMPORT_LEASE_MS = 2h
  const res = await POST(assinada({ agentId: "a1" }) as never);
  expect((await res.json()).items).toHaveLength(1);
});

it("respeita o teto de itens por chamada", async () => {
  const res = await POST(assinada({ agentId: "a1", limit: 3 }) as never);
  expect((await res.json()).items.length).toBeLessThanOrEqual(3);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/nas/import-queue.test.ts`
Expected: FAIL — a rota não existe.

- [ ] **Step 4: Implementar a rota**

Crie `app/api/artifacts/import-queue/route.ts`:

```ts
// Fila de importação (agente -> nuvem). O agente PERGUNTA o que há para baixar; a Vercel nunca
// alcança o NAS, então o pedido parte sempre de dentro da rede. Autenticado pelo MESMO HMAC do
// finalize (timestamp + corpo cru), sem sessão.
//
// Reserva: o que sai daqui vai para UPLOADING com carimbo. Item preso além de IMPORT_LEASE_MS
// volta para PENDING — é a recuperação do agente que reiniciou no meio de um download.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFinalizeSecret, IMPORT_LEASE_MS, IMPORT_QUEUE_MAX } from "@/lib/nas/config";
import { verifyFinalizeSignature } from "@/lib/nas/token";
import { ALLOWLIST, isUploadableMediaType, type ArtifactMediaType } from "@/lib/nas/path";

export async function POST(request: NextRequest) {
  let secret: string;
  try {
    secret = getFinalizeSecret();
  } catch {
    return NextResponse.json({ error: "NAS finalize não configurado" }, { status: 503 });
  }

  const timestamp = request.headers.get("x-nas-timestamp") ?? "";
  const signature = request.headers.get("x-nas-signature") ?? "";
  const rawBody = await request.text();
  const v = verifyFinalizeSignature(secret, timestamp, rawBody, signature);
  if (!v.ok) {
    return NextResponse.json({ error: "assinatura inválida", reason: v.reason }, { status: 401 });
  }

  let body: { agentId?: string; limit?: number } = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const limit = Math.min(Math.max(1, Number(body.limit) || IMPORT_QUEUE_MAX), IMPORT_QUEUE_MAX);

  const now = new Date();

  // 1. Devolve à fila o que ficou preso (agente reiniciado no meio do download).
  await prisma.taskArtifact.updateMany({
    where: {
      storageKind: "NAS_UPLOAD",
      uploadStatus: "UPLOADING",
      url: { not: null },
      importClaimedAt: { lt: new Date(now.getTime() - IMPORT_LEASE_MS) },
    },
    data: { uploadStatus: "PENDING", importClaimedAt: null },
  });

  // 2. Reserva. `url: { not: null }` é o que separa importação de upload de navegador — um upload
  // parado em PENDING espera bytes que o navegador vai mandar, e o agente não tem o que baixar.
  const candidatos = await prisma.taskArtifact.findMany({
    where: {
      storageKind: "NAS_UPLOAD",
      uploadStatus: "PENDING",
      url: { not: null },
      deletedAt: null,
      nasPath: { not: null },
      mediaType: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  if (candidatos.length === 0) return NextResponse.json({ items: [] });

  const ids = candidatos.map((c) => c.id);
  await prisma.taskArtifact.updateMany({
    where: { id: { in: ids }, uploadStatus: "PENDING" },
    data: { uploadStatus: "UPLOADING", importClaimedAt: now, agentId: body.agentId ?? null },
  });

  // Relê só o que ESTE pedido reservou (o carimbo é a prova), em vez de assumir que a reserva
  // pegou tudo: entre a leitura e a escrita alguém pode ter mexido na linha.
  const reservados = await prisma.taskArtifact.findMany({
    where: { id: { in: ids }, uploadStatus: "UPLOADING", importClaimedAt: now },
    select: { id: true, url: true, nasPath: true, fileName: true, mediaType: true },
  });

  // Uma linha com tipo só-de-link não deveria existir na fila (a action recusa), mas a fila é lida
  // por OUTRO deployable: se aparecer, sai da lista em vez de derrubar a resposta inteira.
  const items = reservados.flatMap((a) => {
    const m = a.mediaType as ArtifactMediaType | null;
    if (!m || !isUploadableMediaType(m)) return [];
    return [
      {
        artifactId: a.id,
        url: a.url as string,
        nasPath: a.nasPath as string,
        fileName: a.fileName as string,
        mediaType: m,
        maxBytes: ALLOWLIST[m].maxBytes,
      },
    ];
  });
  return NextResponse.json({ items });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/nas/import-queue.test.ts && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(nas): o endpoint onde o agente pergunta o que importar"
```

---

### Task 7: o finalize passa a aceitar falha com motivo

Hoje o `finalize` só sabe dizer "pronto". Sem o motivo, a reedição vira tentativa e erro: a pessoa troca o link quando o problema era o tipo declarado, falha igual, e conclui que a funcionalidade não presta.

**Files:**

- Modify: `app/api/artifacts/finalize/route.ts`
- Test: `__tests__/lib/nas/finalize-failure.test.ts`

**Interfaces:**

- Consumes: `ImportFailureCode` (Task 3).
- Produces: `POST /api/artifacts/finalize` aceita `{ artifactId, failed: true, reason: string, detail?: string }` → grava `uploadStatus: "FAILED"`, `failedAt`, `failedReason` e limpa `importClaimedAt`. O corpo de sucesso não muda.

- [ ] **Step 1: Escrever os testes que falham**

`__tests__/lib/nas/finalize-failure.test.ts`, no mesmo molde assinado da Task 6:

```ts
it("grava o motivo e deixa o artefato em FAILED", async () => {
  const res = await POST(assinada({ artifactId: "art1", failed: true, reason: "TOO_LARGE" }));
  expect(res.status).toBe(200);
  const data = updateArgs();
  expect(data.uploadStatus).toBe("FAILED");
  expect(data.failedReason).toBe("TOO_LARGE");
  expect(data.failedAt).toBeInstanceOf(Date);
  expect(data.importClaimedAt).toBeNull();
});

it("não ressuscita como falho um artefato já pronto", async () => {
  // artefato em READY
  const res = await POST(assinada({ artifactId: "art1", failed: true, reason: "TIMEOUT" }));
  expect(res.status).toBe(409);
});

it("é idempotente: repetir a falha não é erro", async () => {
  // artefato já em FAILED
  const res = await POST(assinada({ artifactId: "art1", failed: true, reason: "TIMEOUT" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, idempotent: true });
});

it("corta um motivo absurdamente longo em vez de recusar", async () => {
  const res = await POST(assinada({ artifactId: "art1", failed: true, reason: "X".repeat(5000) }));
  expect(res.status).toBe(200);
  expect(String(updateArgs().failedReason).length).toBeLessThanOrEqual(200);
});

it("o sucesso continua como hoje", async () => {
  const res = await POST(assinada({ artifactId: "art1", checksum: "abc", sizeBytes: 10 }));
  expect(res.status).toBe(200);
  expect(updateArgs().uploadStatus).toBe("READY");
});
```

O caso do motivo longo não é preciosismo: o motivo vem de fora (mensagem de erro de uma origem que não controlamos) e vai para uma coluna de texto que a tela renderiza.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/nas/finalize-failure.test.ts`
Expected: FAIL — a rota ignora `failed` e responde 409 em FAILED.

- [ ] **Step 3: Implementar**

Em `app/api/artifacts/finalize/route.ts`, depois do parse do corpo, acrescente `failed` e `reason` à desestruturação e trate a falha **antes** do caminho de sucesso:

```ts
const { artifactId, checksum, sizeBytes, agentId, failed, reason, detail } = body;
if (!artifactId) return NextResponse.json({ error: "artifactId obrigatório" }, { status: 400 });
```

```ts
// --- Falha reportada pelo agente -----------------------------------------------------------
// Um import que falhou nunca virou arquivo. O motivo é gravado para a tela explicar o que houve
// e a pessoa corrigir o que estava errado (Task 8) — sem ele, a reedição é adivinhação.
if (failed) {
  if (artifact.uploadStatus === "FAILED") {
    return NextResponse.json({ ok: true, idempotent: true });
  }
  if (artifact.uploadStatus === "READY") {
    return NextResponse.json({ error: "artefato já está pronto" }, { status: 409 });
  }
  const motivo = String(reason ?? "WRITE_FAILED").slice(0, 200);
  await prisma.$transaction(async (tx) => {
    await tx.taskArtifact.update({
      where: { id: artifactId },
      data: {
        uploadStatus: "FAILED",
        failedAt: new Date(),
        failedReason: motivo,
        importClaimedAt: null,
        agentId: agentId ?? null,
      },
    });
    await tx.artifactAuditLog.create({
      data: {
        artifactId,
        eventType: "IMPORT_FAILED",
        metadata: { reason: motivo, detail: detail ? String(detail).slice(0, 500) : null },
      },
    });
  });
  return NextResponse.json({ ok: true });
}
```

Ajuste também o tipo declarado de `body` para incluir `failed?: boolean; reason?: string; detail?: string`.

O bloco vai **depois** da busca do artefato e **antes** do `if (artifact.uploadStatus === "READY")` de sucesso — senão o guarda de estado terminal responde 409 e a falha nunca é gravada.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/nas/finalize-failure.test.ts && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(nas): o finalize aceita falha com motivo"
```

---

### Task 8: editar o import que falhou e tentar de novo

**Editar só existe em FAILED.** Um artefato READY tem bytes gravados; trocar a origem depois faria a procedência mentir sobre um arquivo que existe. Um import que falhou nunca virou arquivo — não há histórico a reescrever.

**A reedição reabre todos os campos**, não só a URL: quem declarou FOTOS para um vídeo de 300 MB é recusado pelo teto do TIPO declarado, e corrigir só o link não resolveria.

**Files:**

- Modify: `lib/actions/artifact-import.ts` (`retryArtifactImport`)
- Modify: `lib/validations.ts` (`retryImportSchema`)
- Modify: `lib/artifacts/unify.ts` (`failedReason` na linha unificada)
- Create: `components/artifacts/EditFailedImportDialog.tsx`
- Modify: `components/artifacts/ArtifactRow.tsx`, `components/artifacts/UnifiedArtifactsPanel.tsx`
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`
- Test: `__tests__/lib/actions/artifact-import.test.ts` (estender), `__tests__/components/ArtifactRow.test.tsx`

**Interfaces:**

- Consumes: `resolveArtifactOwner` (Task 4); `checkImportUrl`/`deriveFileNameFromUrl` (Task 3); `failedReason` gravado pela Task 7.
- Produces: `retryArtifactImport(artifactId: string, input: unknown)` → devolve o artefato para `PENDING` com os campos corrigidos e o caminho reselado.

- [ ] **Step 1: Escrever os testes de servidor que falham**

Em `__tests__/lib/actions/artifact-import.test.ts`:

```ts
describe("retryArtifactImport", () => {
  it("devolve o artefato para a fila e limpa a falha", async () => {
    // artefato: NAS_UPLOAD, FAILED, url != null
    const res = await retryArtifactImport("art1", {
      title: "Foto certa",
      url: "https://exemplo.com/foto.png",
      mediaType: "FOTOS",
      sensitivity: "CLIENTE",
    });
    expect(res).toMatchObject({ success: true });
    const data = updateArgs();
    expect(data.uploadStatus).toBe("PENDING");
    expect(data.failedReason).toBeNull();
    expect(data.failedAt).toBeNull();
    expect(data.importClaimedAt).toBeNull();
  });

  it("resela o caminho quando o tipo de mídia muda", async () => {
    await retryArtifactImport("art1", {
      title: "Vídeo",
      url: "https://exemplo.com/filme.mp4",
      mediaType: "VIDEOS",
      sensitivity: "INTERNO",
    });
    const data = updateArgs();
    expect(data.nasPath).toContain("/videos/");
    expect(String(data.fileName)).toMatch(/\.mp4$/);
    expect(data.originalFileName).toBe("filme.mp4");
  });

  it("aceita reenviar sem mudar nada (falha passageira de rede)", async () => {
    const res = await retryArtifactImport("art1", {
      title: "Foto",
      url: "https://exemplo.com/foto.jpg",
      mediaType: "FOTOS",
      sensitivity: "INTERNO",
    });
    expect(res).toMatchObject({ success: true });
  });

  it("recusa em READY — pelo SERVIDOR, não só escondendo o botão", async () => {
    // artefato em READY
    const res = await retryArtifactImport("art1", { …válido });
    expect(res).toMatchObject({ error: expect.any(String) });
  });

  it("recusa em PENDING (já está na fila)", async () => {
    const res = await retryArtifactImport("art1", { …válido });
    expect(res).toHaveProperty("error");
  });

  it("recusa um artefato que não é importação (upload sem url)", async () => {
    // NAS_UPLOAD, FAILED, url = null
    const res = await retryArtifactImport("art1", { …válido });
    expect(res).toHaveProperty("error");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/artifact-import.test.ts`
Expected: FAIL — `retryArtifactImport` não existe.

- [ ] **Step 3: O schema**

`lib/validations.ts`:

```ts
// retryArtifactImport — a reedição reabre TODOS os campos: a falha nem sempre é do link (um vídeo
// declarado como FOTOS é recusado pelo teto do tipo, e trocar só a URL não resolveria).
export const retryImportSchema = z.object({
  title: z.string().min(1, "Nome do artefato é obrigatório").max(200),
  url: z.string().url("URL inválida"),
  mediaType: artifactMediaTypeEnum,
  sensitivity: sensitivityEnum.default("INTERNO"),
});
```

- [ ] **Step 4: A ação**

Em `lib/actions/artifact-import.ts`:

```ts
export async function retryArtifactImport(artifactId: string, input: unknown) {
  const t = await getTranslations("errors.artifact");
  const tc = await getTranslations("errors.common");
  try {
    const parsed = retryImportSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    const atual = await prisma.taskArtifact.findUnique({
      where: { id: artifactId },
      select: {
        id: true,
        scope: true,
        taskId: true,
        projectId: true,
        clientId: true,
        storageKind: true,
        uploadStatus: true,
        url: true,
        version: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!atual || atual.deletedAt) return { error: t("notFound") };

    const user =
      atual.scope === "TASK" ? await requireMemberOrHigher() : await requireManagerOrAdmin();
    void user;

    // A trava vive AQUI, não na tela: um artefato READY tem bytes gravados, e trocar a origem
    // depois faria a procedência mentir sobre um arquivo que existe.
    if (atual.storageKind !== "NAS_UPLOAD" || !atual.url) return { error: t("importOnlyImports") };
    if (atual.uploadStatus !== "FAILED") return { error: t("importOnlyFailed") };

    const check = checkImportUrl(data.url);
    if (!check.ok) return { error: t(URL_PROBLEM_KEY[check.reason]) };
    const originalFileName = deriveFileNameFromUrl(data.url) as string;
    try {
      normalizeExtension(originalFileName, data.mediaType);
    } catch (e) {
      if (e instanceof NasPathError) return { error: e.message };
      throw e;
    }

    const owner = await resolveArtifactOwner(atual);
    if (!owner.ok) {
      const isCommon = owner.errorKey === "projectNotFound" || owner.errorKey === "clientNotFound";
      return { error: isCommon ? tc(owner.errorKey) : t(owner.errorKey) };
    }

    // Resela o caminho: mudar o tipo de mídia muda a pasta, e mudar a URL muda a extensão.
    // A versão e a data de criação são as MESMAS — é o mesmo artefato tentando de novo, não um
    // novo; número de versão nunca se reusa nem se gasta à toa.
    const built = buildNasPath({
      scope: atual.scope,
      client: owner.ctx.folderName,
      ownerName: owner.ctx.ownerName,
      ownerId: owner.ctx.ownerId,
      mediaType: data.mediaType,
      originalFileName,
      version: atual.version,
      uploadDate: atual.createdAt,
    });

    try {
      await prisma.taskArtifact.update({
        where: { id: artifactId },
        data: {
          title: data.title.trim(),
          url: data.url.trim(),
          mediaType: data.mediaType,
          sensitivity: data.sensitivity,
          originalFileName,
          fileKey: fileBaseToken(originalFileName),
          nasPath: built.relPath,
          fileName: built.fileName,
          uploadStatus: "PENDING",
          failedAt: null,
          failedReason: null,
          importClaimedAt: null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { error: t("importPathTaken") };
      }
      throw e;
    }

    await prisma.artifactAuditLog.create({
      data: {
        artifactId,
        eventType: "IMPORT_RETRIED",
        metadata: { url: data.url, mediaType: data.mediaType },
      },
    });

    if (atual.taskId) {
      revalidatePath(`/tasks/${atual.taskId}`);
      revalidatePath(`/admin/tasks/${atual.taskId}`);
    }
    if (atual.projectId) revalidatePath(`/admin/projects/${atual.projectId}`);
    if (atual.clientId) revalidatePath(`/admin/clients/${atual.clientId}`);

    return { success: true as const };
  } catch (error) {
    console.error("retryArtifactImport error:", error);
    return { error: t("importFailed") };
  }
}
```

Novas chaves em `errors.artifact` (pt-BR / es-ES):

```json
"importOnlyFailed": "Só é possível editar uma importação que falhou." /
"importOnlyFailed": "Solo se puede editar una importación que ha fallado."
"importOnlyImports": "Este artefato não é uma importação." /
"importOnlyImports": "Este artefacto no es una importación."
"importPathTaken": "Já existe um artefato com esse nome nesta pasta do NAS." /
"importPathTaken": "Ya existe un artefacto con ese nombre en esa carpeta del NAS."
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/artifact-import.test.ts`
Expected: PASS

- [ ] **Step 6: O motivo chega até a tela**

`lib/artifacts/unify.ts`: acrescente `failedReason: string | null` ao `UnifiedArtifactRow`, ao `RawArtifact` e ao retorno de `mapArtifactRow` (`failedReason: a.failedReason ?? null`). Confira, com `grep -rn "mapArtifactRow" app lib`, que **toda** consulta que alimenta o painel seleciona `failedReason` — um campo que o mapa lê e a consulta não traz vira `undefined` silencioso, e a tela mostra falha sem motivo, que é o defeito que esta entrega existe para não ter.

Chaves de motivo em `tasks.artifacts` (pt-BR):

```json
    "nasFailure": {
      "TOO_LARGE": "O arquivo é maior que o limite do tipo declarado.",
      "NOT_A_FILE": "O link devolveu uma página, não um arquivo.",
      "EXECUTABLE": "O conteúdo é um executável e foi bloqueado.",
      "SOURCE_UNREACHABLE": "A origem não respondeu.",
      "SOURCE_REFUSED": "A origem recusou o download (o link pode exigir login).",
      "PRIVATE_HOST": "O endereço aponta para dentro da rede.",
      "TOO_MANY_REDIRECTS": "O link redirecionou vezes demais.",
      "TIMEOUT": "A origem demorou demais para responder.",
      "WRITE_FAILED": "Não foi possível gravar o arquivo no NAS."
    },
    "editImport": "Editar e tentar de novo",
    "editImportTitle": "Corrigir a importação"
```

es-ES (espanhol real):

```json
    "nasFailure": {
      "TOO_LARGE": "El archivo supera el límite del tipo declarado.",
      "NOT_A_FILE": "El enlace ha devuelto una página, no un archivo.",
      "EXECUTABLE": "El contenido es un ejecutable y se ha bloqueado.",
      "SOURCE_UNREACHABLE": "El origen no ha respondido.",
      "SOURCE_REFUSED": "El origen ha rechazado la descarga (puede que el enlace exija iniciar sesión).",
      "PRIVATE_HOST": "La dirección apunta al interior de la red.",
      "TOO_MANY_REDIRECTS": "El enlace ha redirigido demasiadas veces.",
      "TIMEOUT": "El origen ha tardado demasiado en responder.",
      "WRITE_FAILED": "No se ha podido guardar el archivo en el NAS."
    },
    "editImport": "Editar y volver a intentarlo",
    "editImportTitle": "Corregir la importación"
```

- [ ] **Step 7: O teste de tela que falha**

Em `__tests__/components/ArtifactRow.test.tsx`:

```tsx
it("importação que falhou mostra o motivo e o botão de editar", () => {
  renderRow({ storageKind: "NAS_UPLOAD", uploadStatus: "FAILED", url: "https://x/a.jpg", failedReason: "TOO_LARGE" });
  expect(screen.getByText(/maior que o limite/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /editar e tentar de novo/i })).toBeInTheDocument();
});

it("upload comum que falhou continua com reenviar, sem editar", () => {
  renderRow({ storageKind: "NAS_UPLOAD", uploadStatus: "FAILED", url: null });
  expect(screen.queryByRole("button", { name: /editar e tentar de novo/i })).toBeNull();
  expect(screen.getByRole("button", { name: /reenviar/i })).toBeInTheDocument();
});

it("importação pronta não oferece editar", () => {
  renderRow({ storageKind: "NAS_UPLOAD", uploadStatus: "READY", url: "https://x/a.jpg" });
  expect(screen.queryByRole("button", { name: /editar e tentar de novo/i })).toBeNull();
});

it("motivo desconhecido cai no texto cru em vez de sumir", () => {
  renderRow({ …falhou, failedReason: "MOTIVO_NOVO_DO_AGENTE" });
  expect(screen.getByText("MOTIVO_NOVO_DO_AGENTE")).toBeInTheDocument();
});
```

O último caso é o que impede a tela de emudecer quando uma versão nova do agente inventar um código que o app ainda não traduz — e agente e app **não sobem juntos**, então isso vai acontecer.

- [ ] **Step 8: A tela**

Em `components/artifacts/ArtifactRow.tsx`, no bloco de ações (linha ~160):

```tsx
const isImport = isNas && a.url != null;
const importFalhou = isImport && a.uploadStatus === "FAILED";
const motivo = (code: string) => (t.has(`nasFailure.${code}`) ? t(`nasFailure.${code}`) : code);
```

```tsx
          {isNas && a.uploadStatus !== "READY" && a.origin === scope && (
            <>
              {importFalhou ? (
                <button
                  type="button"
                  onClick={() => onEditImport(a.id)}
                  disabled={isPending}
                  className="text-xs font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
                >
                  {t("editImport")}
                </button>
              ) : (
                <button type="button" onClick={() => onReenviar(a.id)} …>
                  {reenviarBusy === a.id ? t("reenviarPending") : t("reenviar")}
                </button>
              )}
              <button type="button" onClick={() => onRemoveFailed(a.id)} …>
                {t("remove")}
              </button>
            </>
          )}
```

E o motivo, no corpo da linha, quando `a.uploadStatus === "FAILED" && a.failedReason`:

```tsx
{
  a.uploadStatus === "FAILED" && a.failedReason && (
    <p className="mt-1 text-xs text-destructive">{motivo(a.failedReason)}</p>
  );
}
```

**Decisão registrada:** uma importação que falhou troca "reenviar" por "editar", em vez de mostrar os dois. "Reenviar" abre um seletor de arquivo local — e quem registrou o link está, por hipótese, fora da LAN. Oferecer as duas portas é oferecer uma porta que a pessoa não alcança, ao lado da que resolve. Quem estiver na rede e tiver o arquivo em mãos usa a aba de upload, que é onde isso mora.

- [ ] **Step 9: O diálogo**

Crie `components/artifacts/EditFailedImportDialog.tsx`: um `Dialog` com os MESMOS quatro campos e rótulos da aba de link (nome; tipo de mídia + sensibilidade; URL), pré-preenchido com os valores atuais do artefato, que chama `retryArtifactImport(artifactId, valores)`, mostra `toast.error(res.error)` na falha e `router.refresh()` no sucesso. Acima dos campos, o motivo da falha em `text-destructive` — a pessoa precisa ver o que corrigir enquanto corrige.

Ligue em `components/artifacts/UnifiedArtifactsPanel.tsx`: estado `const [editandoImport, setEditandoImport] = useState<UnifiedArtifactRow | null>(null)`, passe `onEditImport` para o `ArtifactRow` e renderize o diálogo quando houver linha selecionada.

- [ ] **Step 10: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(nas): editar a importação que falhou e mandar de volta para a fila"
```

---

> **As Tasks 9 a 11 mudam o AGENTE** (`nas-poc/agent/`), que roda no NAS e **não sobe com a Vercel**. Elas têm suíte própria: `cd nas-poc/agent && npx vitest run`. Nada nelas pode quebrar o `PUT /v1/uploads/:artifactId`, que é o caminho de upload em produção hoje.

### Task 9: uma esteira de gravação só, usada pelo upload e pela importação

A spec diz que "a importação não escreve trava nenhuma: ela herda todas". Herdar é usar o mesmo código — não reescrever um parecido. Duas cópias do corte por tamanho e do sniffing divergem no dia em que alguém apertar uma delas, e a que ficar frouxa não vai avisar.

O `uploadHandler` **não tem teste nenhum hoje** (a suíte do agente cobre config, finalize, nas-path, reconcile, sniff, store e token — não o servidor). Extrair a esteira dá a ela a primeira cobertura, e é por isso que esta task vem antes das outras duas.

**Files:**

- Create: `nas-poc/agent/src/nas-store.ts`
- Modify: `nas-poc/agent/src/server.ts:70-205` (`uploadHandler` passa a chamar a esteira)
- Test: `nas-poc/agent/test/nas-store.test.ts`

**Interfaces:**

- Consumes: `sniffUpload`/`SniffError` (já existe).
- Produces:

```ts
export type StoreFailureCode = "TOO_LARGE" | "EXECUTABLE" | "MAGIC_MISMATCH" | "WRITE_FAILED";
export class StoreError extends Error { constructor(public code: StoreFailureCode, message: string) }
export interface StoreStreamInput {
  source: AsyncIterable<Uint8Array>;
  finalPath: string;
  tmpPath: string;
  maxBytes: number;
  ext: string;
  hashMode: "inline" | "deferred" | "off";
}
export interface StoreStreamResult { bytes: number; checksum: string | null }
export async function storeStreamToNas(input: StoreStreamInput): Promise<StoreStreamResult>
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `nas-poc/agent/test/nas-store.test.ts` (use `mkdtemp` em `os.tmpdir()`, como os outros testes do agente que tocam disco):

```ts
async function* bytes(...chunks: Buffer[]) {
  for (const c of chunks) yield c;
}
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

it("grava, devolve o tamanho e o sha256", async () => {
  const r = await storeStreamToNas({
    source: bytes(PNG, Buffer.alloc(10)),
    finalPath: `${dir}/a.png`,
    tmpPath: `${dir}/a.png.tmp`,
    maxBytes: 1000,
    ext: "png",
    hashMode: "inline",
  });
  expect(r.bytes).toBe(PNG.length + 10);
  expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
  expect(existsSync(`${dir}/a.png`)).toBe(true);
});

it("corta DURANTE o fluxo e não deixa arquivo para trás", async () => {
  // 3 pedaços de 100 bytes com teto de 150: o erro precisa vir antes do terceiro.
  let entregues = 0;
  async function* fonte() {
    for (let i = 0; i < 3; i++) {
      entregues++;
      yield Buffer.alloc(100);
    }
  }
  await expect(
    storeStreamToNas({ source: fonte(), …, maxBytes: 150, ext: "png", hashMode: "off" })
  ).rejects.toMatchObject({ code: "TOO_LARGE" });
  expect(entregues).toBeLessThan(3); // parou no meio, não depois de baixar tudo
  expect(existsSync(finalPath)).toBe(false);
  expect(existsSync(tmpPath)).toBe(false);
});

it("recusa executável disfarçado e não publica", async () => {
  await expect(
    storeStreamToNas({ source: bytes(Buffer.from("4d5a9000", "hex")), …, ext: "png" })
  ).rejects.toMatchObject({ code: "EXECUTABLE" });
  expect(existsSync(finalPath)).toBe(false);
});

it("recusa bytes que não conferem com a extensão", async () => {
  await expect(
    storeStreamToNas({ source: bytes(Buffer.from("<html>")), …, ext: "png" })
  ).rejects.toMatchObject({ code: "MAGIC_MISMATCH" });
});

it("hashMode off não calcula checksum", async () => {
  const r = await storeStreamToNas({ …, hashMode: "off" });
  expect(r.checksum).toBeNull();
});
```

O `expect(entregues).toBeLessThan(3)` é o coração: um teste que só verificasse `rejects` passaria igual se a implementação baixasse os 5 GB inteiros antes de reclamar do limite de 150 MB — que é exatamente o jeito de derrubar o NAS pelo caminho de quem tentava protegê-lo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nas-poc/agent && npx vitest run test/nas-store.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Extrair a esteira**

Crie `nas-poc/agent/src/nas-store.ts` movendo, **sem mudar o comportamento**, o miolo do `uploadHandler`: `mkdir` do diretório, laço de escrita com corte por tamanho, sniff dos primeiros 256 bytes lidos do tmp, `rename` atômico, checksum conforme o modo. O `safeUnlink` e o `hashFile` que hoje moram no fim do `server.ts` vêm junto (exporte-os daqui e importe no `server.ts`, ou duplique-os aqui e apague de lá — não deixe as duas cópias).

A ordem é a de hoje e não pode mudar: **grava no tmp → confere o tamanho durante → sniff → só então publica**. Publicar antes do sniff é publicar um arquivo mal-rotulado por alguns milissegundos, e é a diferença entre uma trava e um aviso.

- [ ] **Step 4: Religar o `uploadHandler`**

No `server.ts`, o corpo entre o `mkdir` e o `rename` vira uma chamada:

```ts
let stored;
try {
  stored = await storeStreamToNas({
    source: req.raw as AsyncIterable<Uint8Array>,
    finalPath,
    tmpPath,
    maxBytes,
    ext: path.extname(claims.fileName).slice(1).toLowerCase(),
    hashMode: cfg.hashMode,
  });
} catch (err) {
  if (err instanceof StoreError) {
    if (err.code === "TOO_LARGE") return reply.code(413).send({ error: "too_large", maxSize });
    await audit.append({ event: "rejected_sniff", artifactId: claims.artifactId, code: err.code });
    return reply.code(415).send({ error: err.code, message: err.message });
  }
  req.log.warn({ err: (err as Error).message, tmpPath }, "upload aborted");
  return reply.code(499).send({ error: "aborted" });
}
```

Os códigos HTTP são os de hoje (413 / 415 / 499) e a auditoria continua com o mesmo `event`. O resto do handler (finalize inline, fila de retry, resposta 201 com `msWrite`/`msHash`) fica como está — troque `bytes` por `stored.bytes` e `checksum` por `stored.checksum`.

- [ ] **Step 5: Rodar tudo (o agente inteiro)**

Run: `cd nas-poc/agent && npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add nas-poc/agent
git commit -m "refactor(agente): uma esteira de gravação só, com teste"
```

---

### Task 10: `fetch-source.ts` — as travas de rede

O único código genuinamente novo de segurança da entrega. O agente vive **dentro** da rede: fazê-lo buscar uma URL que um usuário digitou é abrir uma porta para varrer a LAN de fora — pedir `http://192.168.200.1/` e ler a resposta pelo que o sistema gravar ou reportar.

**Files:**

- Create: `nas-poc/agent/src/fetch-source.ts`
- Test: `nas-poc/agent/test/fetch-source.test.ts`

**Interfaces:**

- Consumes: nada do agente.
- Produces:

```ts
export type FetchFailureCode =
  | "PRIVATE_HOST" | "SOURCE_UNREACHABLE" | "SOURCE_REFUSED"
  | "TOO_MANY_REDIRECTS" | "TIMEOUT" | "TOO_LARGE" | "NOT_A_FILE";
export class FetchSourceError extends Error { constructor(public code: FetchFailureCode, message: string) }
export function isPrivateAddress(ip: string): boolean;
export interface FetchSourceDeps {
  lookup?: (host: string) => Promise<string[]>;   // injetável: os testes não tocam DNS
  fetchImpl?: typeof fetch;                        // injetável: os testes não tocam rede
}
export async function fetchSource(
  rawUrl: string,
  opts: { maxBytes: number; maxRedirects?: number; connectTimeoutMs?: number } & FetchSourceDeps
): Promise<{ body: AsyncIterable<Uint8Array>; finalUrl: string }>;
```

- [ ] **Step 1: Escrever os testes que falham**

Crie `nas-poc/agent/test/fetch-source.test.ts`:

```ts
describe("isPrivateAddress", () => {
  it("recusa toda a família privada", () => {
    const privados = [
      "127.0.0.1",
      "127.53.1.2",
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.254",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.0.1",
      "192.168.200.216",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:192.168.0.1",
    ];
    for (const ip of privados) expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("aceita público", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "93.184.216.34", "2606:2800::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
```

`172.32.0.1` e `172.15.0.1` são os vizinhos da faixa `172.16–31`: é onde um `startsWith("172.")` ingênuo bloqueia demais e um teste sem vizinhos não percebe.

```ts
describe("fetchSource", () => {
  const ok = () => new Response(new ReadableStream(), { status: 200 });

  it("recusa esquema que não seja http/https", async () => {
    await expect(fetchSource("file:///etc/passwd", base)).rejects.toMatchObject({
      code: "PRIVATE_HOST",
    });
  });

  it("recusa quando o DNS aponta para dentro da rede", async () => {
    const lookup = async () => ["192.168.200.216"];
    const fetchImpl = vi.fn();
    await expect(
      fetchSource("https://parece-publico.com/a.jpg", { ...base, lookup, fetchImpl })
    ).rejects.toMatchObject({ code: "PRIVATE_HOST" });
    expect(fetchImpl).not.toHaveBeenCalled(); // nem chegou a bater na porta
  });

  it("recusa quando QUALQUER endereço do nome é privado", async () => {
    // Um nome com dois A records, um público e um privado, é o truque mais barato que existe.
    const lookup = async () => ["93.184.216.34", "10.0.0.5"];
    await expect(fetchSource("https://x.com/a.jpg", { ...base, lookup })).rejects.toMatchObject({
      code: "PRIVATE_HOST",
    });
  });

  it("reconfere a cada salto: público que redireciona para dentro é recusado", async () => {
    const lookup = async (h: string) => (h === "publico.com" ? ["93.184.216.34"] : ["10.0.0.5"]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://interno.local/a.jpg" } })
    );
    await expect(
      fetchSource("https://publico.com/a.jpg", { ...base, lookup, fetchImpl })
    ).rejects.toMatchObject({ code: "PRIVATE_HOST" });
  });

  it("para depois do limite de saltos", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://outro.com/a.jpg" } })
    );
    await expect(
      fetchSource("https://x.com/a.jpg", { ...base, maxRedirects: 2, fetchImpl })
    ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // original + 2 saltos
  });

  it("recusa cedo quando o Content-Length já estoura o teto", async () => {
    const fetchImpl = async () =>
      new Response(new ReadableStream(), {
        status: 200,
        headers: { "content-length": "999999999" },
      });
    await expect(
      fetchSource("https://x.com/a.jpg", { ...base, maxBytes: 1000, fetchImpl })
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("traduz o status da origem", async () => {
    for (const [status, code] of [
      [403, "SOURCE_REFUSED"],
      [404, "SOURCE_REFUSED"],
      [500, "SOURCE_UNREACHABLE"],
    ] as const) {
      const fetchImpl = async () => new Response(null, { status });
      await expect(
        fetchSource("https://x.com/a.jpg", { ...base, fetchImpl })
      ).rejects.toMatchObject({ code });
    }
  });

  it("traduz o estouro de tempo", async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    };
    await expect(fetchSource("https://x.com/a.jpg", { ...base, fetchImpl })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it("devolve o corpo quando está tudo certo", async () => {
    const r = await fetchSource("https://x.com/a.jpg", { ...base, fetchImpl: ok });
    expect(r.finalUrl).toBe("https://x.com/a.jpg");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nas-poc/agent && npx vitest run test/fetch-source.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar**

Crie `nas-poc/agent/src/fetch-source.ts`. O laço resolve o DNS, recusa destino privado, bate na porta com `redirect: "manual"` e **repete a conferência a cada salto** — o primeiro pode ser público e o segundo apontar para dentro:

```ts
// Busca a origem de uma importação. Esta é a fronteira: o agente vive DENTRO da rede, e buscar
// uma URL que um usuário digitou é, sem trava, uma ferramenta de varredura da LAN operada de fora.
//
// LIMITAÇÃO CONHECIDA (registrada de propósito): conferimos o DNS e depois o `fetch` resolve de
// novo — uma resposta com TTL curtíssimo pode devolver um endereço na primeira consulta e outro na
// segunda (DNS rebinding). Fechar isso exigiria fixar o IP resolvido e falar TLS com SNI manual,
// o que quebra a verificação de certificado do jeito ingênuo. Fica anotado como o buraco que esta
// versão NÃO fecha, em vez de fingir que fecha.

import { lookup as dnsLookup } from "node:dns/promises";

export type FetchFailureCode =
  | "PRIVATE_HOST"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_REFUSED"
  | "TOO_MANY_REDIRECTS"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "NOT_A_FILE";

export class FetchSourceError extends Error {
  constructor(
    public code: FetchFailureCode,
    message: string
  ) {
    super(message);
    this.name = "FetchSourceError";
  }
}

export function isPrivateAddress(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true; // multicast e reservados
    return false;
  }
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80")) return true;
  if (/^f[cd]/.test(host)) return true;
  const mapped = /^::ffff:(.+)$/.exec(host);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

async function defaultLookup(host: string): Promise<string[]> {
  const all = await dnsLookup(host, { all: true });
  return all.map((a) => a.address);
}

export interface FetchSourceDeps {
  lookup?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

export async function fetchSource(
  rawUrl: string,
  opts: {
    maxBytes: number;
    maxRedirects?: number;
    connectTimeoutMs?: number;
  } & FetchSourceDeps
): Promise<{ body: AsyncIterable<Uint8Array>; finalUrl: string }> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const timeout = opts.connectTimeoutMs ?? 15_000;
  const lookup = opts.lookup ?? defaultLookup;
  const doFetch = opts.fetchImpl ?? fetch;

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      throw new FetchSourceError("PRIVATE_HOST", `URL inválida: ${current}`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new FetchSourceError("PRIVATE_HOST", `esquema não permitido: ${u.protocol}`);
    }

    const host = u.hostname.toLowerCase();
    // Literal já resolvido, ou nome — os dois passam pela mesma régua.
    const enderecos = isPrivateAddress(host) ? [host] : await lookup(host).catch(() => null);
    if (!enderecos || enderecos.length === 0) {
      throw new FetchSourceError("SOURCE_UNREACHABLE", `não foi possível resolver ${host}`);
    }
    // UM endereço privado basta para recusar: um nome com dois A records, um público e um
    // privado, é o truque mais barato que existe.
    if (enderecos.some(isPrivateAddress)) {
      throw new FetchSourceError("PRIVATE_HOST", `${host} aponta para dentro da rede`);
    }

    let res: Response;
    try {
      res = await doFetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      const err = e as Error;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new FetchSourceError("TIMEOUT", `a origem não respondeu em ${timeout}ms`);
      }
      throw new FetchSourceError("SOURCE_UNREACHABLE", err.message);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new FetchSourceError("SOURCE_UNREACHABLE", "redirecionamento sem destino");
      }
      current = new URL(location, current).toString();
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      throw new FetchSourceError("SOURCE_UNREACHABLE", `a origem respondeu ${res.status}`);
    }
    if (!res.ok) {
      throw new FetchSourceError("SOURCE_REFUSED", `a origem respondeu ${res.status}`);
    }

    const declarado = Number(res.headers.get("content-length") ?? "0");
    if (declarado && declarado > opts.maxBytes) {
      throw new FetchSourceError("TOO_LARGE", `origem declara ${declarado} bytes`);
    }
    if (!res.body) throw new FetchSourceError("SOURCE_UNREACHABLE", "resposta sem corpo");

    return { body: res.body as unknown as AsyncIterable<Uint8Array>, finalUrl: current };
  }
  throw new FetchSourceError("TOO_MANY_REDIRECTS", `mais de ${maxRedirects} redirecionamentos`);
}
```

O `Content-Length` é uma **cortesia**, não a trava: a origem pode mentir ou omitir. O corte que vale acontece durante a escrita, na esteira da Task 9.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nas-poc/agent && npx vitest run test/fetch-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add nas-poc/agent
git commit -m "feat(agente): as travas de rede da busca da origem"
```

---

### Task 11: o laço que importa

Junta as três peças: pergunta a fila, baixa com as travas, grava na esteira e reporta — sucesso ou falha com motivo.

**Files:**

- Create: `nas-poc/agent/src/import-worker.ts`
- Modify: `nas-poc/agent/src/config.ts` (`cloudImportQueueUrl`, `importPollMs`)
- Modify: `nas-poc/agent/src/finalize.ts` (`callFinalize` aceitando falha)
- Modify: `nas-poc/agent/src/server.ts` (`main()` liga o laço)
- Test: `nas-poc/agent/test/import-worker.test.ts`, `nas-poc/agent/test/config.test.ts` (estender)

**Interfaces:**

- Consumes: `fetchSource` (Task 10), `storeStreamToNas` (Task 9), `callFinalize` (existente), o endpoint da Task 6.
- Produces: `runImportRound(cfg, deps): Promise<{ processados: number; falhas: number }>` — uma rodada, com tudo injetável, para que o teste não toque rede nem relógio.

- [ ] **Step 1: `callFinalize` aprende a reportar falha**

Em `nas-poc/agent/src/finalize.ts`, o payload ganha a variante de falha:

```ts
export type FinalizePayload =
  | { artifactId: string; checksum: string | null; sizeBytes: number }
  | { artifactId: string; failed: true; reason: string; detail?: string };
```

O corpo de `callFinalize` não muda: ele já serializa `{ ...payload, agentId }`. Acrescente um caso ao `test/finalize.test.ts` afirmando que o corpo assinado carrega `failed: true` e o `reason`.

- [ ] **Step 2: Config**

Em `nas-poc/agent/src/config.ts`, no `AgentConfig` e no `loadConfig`:

```ts
  // Fila de importação (agente -> nuvem). Sem a URL, o laço nem começa: o agente antigo continua
  // servindo upload normalmente, que é o que permite publicar app e agente em dias diferentes.
  cloudImportQueueUrl?: string;
  importPollMs: number;
```

```ts
    cloudImportQueueUrl: process.env.CLOUD_IMPORT_QUEUE_URL || undefined,
    importPollMs: num("IMPORT_POLL_MS", 60_000),
```

Acrescente ao `test/config.test.ts` um caso: sem `CLOUD_IMPORT_QUEUE_URL`, `cloudImportQueueUrl` é `undefined` e `importPollMs` tem o padrão.

- [ ] **Step 3: Escrever os testes que falham**

Crie `nas-poc/agent/test/import-worker.test.ts`. Tudo injetado — nada de rede, disco ou relógio de verdade:

```ts
const item = {
  artifactId: "art1",
  url: "https://exemplo.com/foto.jpg",
  nasPath: "Cliente/Institucional/fotos/a_v01.jpg",
  fileName: "a_v01.jpg",
  mediaType: "FOTOS",
  maxBytes: 150 * 1024 * 1024,
};

it("baixa, grava e reporta sucesso", async () => {
  const finalize = vi.fn().mockResolvedValue({ ok: true });
  const r = await runImportRound(cfg, {
    pedirFila: async () => [item],
    fetchSource: async () => ({ body: corpo(), finalUrl: item.url }),
    storeStreamToNas: async () => ({ bytes: 42, checksum: "abc" }),
    callFinalize: finalize,
  });
  expect(r.processados).toBe(1);
  expect(finalize).toHaveBeenCalledWith(
    expect.anything(),
    { artifactId: "art1", checksum: "abc", sizeBytes: 42 },
    expect.anything()
  );
});

it("reporta falha com o código quando a origem é privada", async () => {
  const finalize = vi.fn().mockResolvedValue({ ok: true });
  await runImportRound(cfg, {
    pedirFila: async () => [item],
    fetchSource: async () => { throw new FetchSourceError("PRIVATE_HOST", "x"); },
    storeStreamToNas: vi.fn(),
    callFinalize: finalize,
  });
  expect(finalize).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ artifactId: "art1", failed: true, reason: "PRIVATE_HOST" }),
    expect.anything()
  );
});

it("reporta falha da esteira com o código dela (arquivo maior que o teto)", async () => {
  // StoreError TOO_LARGE -> reason TOO_LARGE
});

it("um erro inesperado vira WRITE_FAILED, e não um item preso para sempre", async () => {
  // storeStreamToNas lança Error("disco cheio") -> finalize com reason WRITE_FAILED
});

it("não processa o mesmo artefato duas vezes ao mesmo tempo", async () => {
  // duas rodadas concorrentes com o MESMO item: fetchSource é chamado uma vez só.
});

it("uma falha não impede o item seguinte", async () => {
  // dois itens, o primeiro estoura: o segundo é processado e finalizado.
});

it("sem URL de fila configurada, a rodada não faz nada", async () => {
  const pedirFila = vi.fn();
  await runImportRound({ ...cfg, cloudImportQueueUrl: undefined }, { pedirFila, … });
  expect(pedirFila).not.toHaveBeenCalled();
});
```

Os dois últimos são os que separam um laço de um laço confiável: um item ruim no meio da migração do Trello não pode parar a fila, e um agente sem a variável nova não pode explodir.

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd nas-poc/agent && npx vitest run test/import-worker.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 5: Implementar**

Crie `nas-poc/agent/src/import-worker.ts`:

```ts
// O laço da importação: pergunta à nuvem o que há para baixar, baixa com as travas de rede,
// entrega os bytes à MESMA esteira do upload e reporta. Sai sempre daqui para lá — a Vercel não
// alcança o NAS.
//
// Um item que falha é reportado com motivo e sai da frente: numa migração inteira do Trello, um
// link quebrado no meio não pode parar a fila.

import path from "node:path";
import { safeResolve, type AgentConfig } from "./config.js";
import { fetchSource, FetchSourceError } from "./fetch-source.js";
import { storeStreamToNas, StoreError } from "./nas-store.js";
import { callFinalize, finalizeSignature } from "./finalize.js";

export interface ImportItem {
  artifactId: string;
  url: string;
  nasPath: string;
  fileName: string;
  mediaType: string;
  maxBytes: number;
}

const emAndamento = new Set<string>();

/** Pergunta a fila com o mesmo HMAC do finalize. */
export async function pedirFila(cfg: AgentConfig): Promise<ImportItem[]> {
  if (!cfg.cloudImportQueueUrl || !cfg.finalizeSecret) return [];
  const body = JSON.stringify({ agentId: cfg.agentId });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await fetch(cfg.cloudImportQueueUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nas-timestamp": timestamp,
      "x-nas-signature": finalizeSignature(cfg.finalizeSecret, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: ImportItem[] };
  return json.items ?? [];
}

function motivoDe(err: unknown): string {
  if (err instanceof FetchSourceError) return err.code;
  if (err instanceof StoreError) return err.code;
  return "WRITE_FAILED";
}

export interface ImportDeps {
  pedirFila: (cfg: AgentConfig) => Promise<ImportItem[]>;
  fetchSource: typeof fetchSource;
  storeStreamToNas: typeof storeStreamToNas;
  callFinalize: typeof callFinalize;
}

export async function runImportRound(
  cfg: AgentConfig,
  deps: ImportDeps
): Promise<{ processados: number; falhas: number }> {
  if (!cfg.cloudImportQueueUrl || !cfg.finalizeSecret) return { processados: 0, falhas: 0 };
  const finalizeCfg = {
    url: cfg.cloudFinalizeUrl as string,
    secret: cfg.finalizeSecret,
    agentId: cfg.agentId,
  };

  const itens = (await deps.pedirFila(cfg)).filter((i) => !emAndamento.has(i.artifactId));
  let processados = 0;
  let falhas = 0;

  for (const item of itens) {
    emAndamento.add(item.artifactId);
    try {
      const finalPath = safeResolve(cfg.nasRoot, item.nasPath);
      const { body } = await deps.fetchSource(item.url, {
        maxBytes: Math.min(item.maxBytes, cfg.maxUploadBytes),
      });
      const stored = await deps.storeStreamToNas({
        source: body,
        finalPath,
        tmpPath: `${finalPath}.importing-${item.artifactId}.tmp`,
        maxBytes: Math.min(item.maxBytes, cfg.maxUploadBytes),
        ext: path.extname(item.fileName).slice(1).toLowerCase(),
        hashMode: cfg.hashMode,
      });
      await deps.callFinalize(
        finalizeCfg,
        { artifactId: item.artifactId, checksum: stored.checksum, sizeBytes: stored.bytes },
        { retries: 3 }
      );
      processados++;
    } catch (err) {
      falhas++;
      await deps.callFinalize(
        finalizeCfg,
        {
          artifactId: item.artifactId,
          failed: true,
          reason: motivoDe(err),
          detail: (err as Error).message,
        },
        { retries: 3 }
      );
    } finally {
      emAndamento.delete(item.artifactId);
    }
  }
  return { processados, falhas };
}

/** Liga o laço. Sem URL de fila, não faz nada — é o que permite agente antigo e app novo. */
export function startImportWorker(
  cfg: AgentConfig,
  log: { warn: (o: unknown, m: string) => void }
) {
  if (!cfg.cloudImportQueueUrl || !cfg.finalizeSecret || !cfg.cloudFinalizeUrl) return null;
  const deps: ImportDeps = { pedirFila, fetchSource, storeStreamToNas, callFinalize };
  const timer = setInterval(() => {
    void runImportRound(cfg, deps).catch((e) =>
      log.warn({ err: (e as Error).message }, "rodada de importação falhou")
    );
  }, cfg.importPollMs);
  timer.unref?.();
  return timer;
}
```

Em `server.ts`, dentro de `main()`, junto de onde o worker de finalize é iniciado: `startImportWorker(cfg, app.log);`

- [ ] **Step 6: Rodar o agente inteiro**

Run: `cd nas-poc/agent && npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add nas-poc/agent
git commit -m "feat(agente): o laço que importa um link para o NAS"
```

---

### Task 12: publicar o agente e fechar a documentação

O app sozinho não entrega isto. Sem uma versão nova do agente no NAS, a fila enche e ninguém a consome — e o sintoma para quem usa é o pior possível: "importei e nunca chegou".

**Files:**

- Modify: `docs/nas-rollout-checklist.md`
- Modify: `docs/pendencias.md`

- [ ] **Step 1: O passo de publicação**

Acrescente ao `docs/nas-rollout-checklist.md` uma seção "Importação de link (2026-09)" com: as duas variáveis novas do agente (`CLOUD_IMPORT_QUEUE_URL` apontando para `https://workos.goonmarketing.com/api/artifacts/import-queue`, e `IMPORT_POLL_MS` opcional); o lembrete de que `FINALIZE_SECRET` já existe e é o mesmo; e como confirmar que o laço subiu (uma importação de teste sai de PENDING em menos de um ciclo de `IMPORT_POLL_MS`).

Anote também a **ordem segura**: publicar o app primeiro é inofensivo (a fila só acumula); publicar o agente primeiro também é (ele pergunta e recebe lista vazia). Não há ordem obrigatória — o que não pode é parar no meio e achar que acabou.

- [ ] **Step 2: As limitações que ficam**

Em `docs/pendencias.md`, na seção "Limitações conhecidas", acrescente:

- **A importação não fecha DNS rebinding.** O agente confere o DNS e o `fetch` resolve de novo; entre as duas consultas, uma resposta com TTL curtíssimo pode trocar o endereço. Fechar exigiria fixar o IP e falar TLS com SNI manual. O que a trava atual cobre — literal privado, nome que resolve para privado, e a reconferência a cada redirecionamento — é a maior parte do risco real; isto é o que ela não cobre.
- **Só link direto.** Link de visualização do Drive ou do Trello devolve HTML e morre em `NOT_A_FILE`, com motivo na tela. Traduzir link de fornecedor ficou fora de propósito: é código que o fornecedor muda sem avisar.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(nas): publicar o agente e as limitações que a importação deixa em aberto"
```

---

## Self-Review

**Cobertura da spec.** Cada seção do desenho tem task: o app enfileira e o agente puxa (4, 6, 11); a fila cabendo no modelo sem coluna de estado nova (4, 6 — a única coluna é o carimbo de reserva, que a própria spec pede ao falar em "carimbo de tempo"); as travas herdadas da esteira existente (9); o risco novo de varredura da LAN (10); a aba de link com a forma da de upload (5); a sensibilidade valendo para link (5); o `type` parando de ser gravado com os consumidores ajustados (2, 4, 5); FIGMA no `ArtifactMediaType` (1); a falha com motivo (7); a reedição só em FAILED (8); e a publicação do agente (12).

**Divergências da spec, decididas aqui e declaradas:**

1. **A spec diz "nenhuma coluna nova" e este plano acrescenta `importClaimedAt`.** A mesma spec pede, dois parágrafos abaixo, que o agente marque o que pegou "com carimbo de tempo" — e não existe carimbo sem coluna. A frase descrevia o estado da fila (que de fato cabia no modelo), não a reserva.
2. **A spec conta cinco consumidores do `type`; um deles (`ActivityFeed`) não tem importador.** A Task 2 manda conferir com `grep` antes de apagar, e manda remapear em vez de apagar se o grep discordar.
3. **A política por tipo (Task 1) não estava na spec** — veio na revisão: FIGMA e OUTROS só como link, SOCIAL_MEDIA sem `pdf`, LOGOS intacto. Duas consequências assumidas: `OUTROS` deixa de aceitar upload, então um arquivo que hoje entraria por ele passa a precisar de tipo de verdade; e artefato antigo com `mediaType = OUTROS` fica como está, porque a política vale para escrita nova.
4. **A importação que falhou troca "reenviar" por "editar", em vez de mostrar os dois** (Task 8, Step 8), com a justificativa no próprio plano.

**Placeholders:** não há "TBD" nem "trate os erros adequadamente". Onde o plano descreve markup em vez de escrevê-lo (o diálogo da Task 8, Step 9), ele nomeia os campos, os rótulos, a ação chamada e o comportamento em erro e em sucesso.

**Consistência de tipos:** `createArtifactWithVersion` passa a receber `mimeType: string | null`, `sizeBytes: number | null`, `title?`, `sourceUrl?` (Task 4) e é chamada com essa forma nas Tasks 4 e 5. `resolveArtifactOwner` devolve `{ ok, ctx | errorKey }` e é consumida com essa forma nas Tasks 4 e 8. A forma dos itens da fila é a mesma na Task 6 (produtora) e na Task 11 (consumidora): `artifactId, url, nasPath, fileName, mediaType, maxBytes`. Os códigos de falha do agente (`FetchFailureCode`, `StoreFailureCode`) são um subconjunto de `IMPORT_FAILURE_CODES` (Task 3), que é o mesmo conjunto das chaves `tasks.artifacts.nasFailure.*` (Task 8) — e o teste do "motivo desconhecido" garante que um código novo do agente apareça cru em vez de sumir.
