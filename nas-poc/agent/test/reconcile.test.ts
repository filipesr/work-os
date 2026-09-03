import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkArtifactFiles } from "../src/reconcile";
import { findOrphanTmps } from "../src/server";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "agent-recon-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("checkArtifactFiles", () => {
  it("arquivo presente → exists+sizeBytes; ausente → false/null", async () => {
    const rel = "Cliente/Tarefa ~abc123/institucional/fotos/2026_07_LP_v01.jpg";
    mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(root, rel), Buffer.alloc(1234));

    const res = await checkArtifactFiles(root, [
      { artifactId: "a1", nasPath: rel },
      {
        artifactId: "a2",
        nasPath: "Cliente/Tarefa ~abc123/institucional/fotos/inexistente_v01.jpg",
      },
    ]);

    expect(res).toEqual([
      { artifactId: "a1", exists: true, sizeBytes: 1234 },
      { artifactId: "a2", exists: false, sizeBytes: null },
    ]);
  });

  it("um diretório NÃO conta como arquivo (isFile)", async () => {
    const rel = "Cliente/institucional/fotos";
    mkdirSync(path.join(root, rel), { recursive: true });
    const res = await checkArtifactFiles(root, [{ artifactId: "d", nasPath: rel }]);
    expect(res[0]).toEqual({ artifactId: "d", exists: false, sizeBytes: null });
  });

  it("path traversal/escape → exists false (não vaza fora do root)", async () => {
    const res = await checkArtifactFiles(root, [
      { artifactId: "x", nasPath: "../../etc/passwd" },
      { artifactId: "y", nasPath: "/etc/passwd" },
    ]);
    expect(res).toEqual([
      { artifactId: "x", exists: false, sizeBytes: null },
      { artifactId: "y", exists: false, sizeBytes: null },
    ]);
  });

  it("ignora itens sem artifactId/nasPath", async () => {
    const res = await checkArtifactFiles(root, [
      { artifactId: "", nasPath: "x" },
      { artifactId: "z", nasPath: "" },
    ] as never);
    expect(res).toEqual([]);
  });
});

// Revisão final, item 3: o import grava em `${finalPath}.importing-${artifactId}.tmp`, mas nos
// erros TRATADOS o arquivo já é apagado — o vazamento é quando o processo morre no meio (restart
// de contêiner, reboot do NAS, `kill -9`). Se a varredura só reconhece `.uploading-*.tmp`, um
// `.importing-*.tmp` de até 5 GB fica no disco e NENHUMA limpeza jamais o encontra.
function tornarAntigo(p: string, ageMs: number) {
  const t = new Date(Date.now() - ageMs);
  utimesSync(p, t, t);
}

describe("findOrphanTmps", () => {
  it("reconhece .uploading-*.tmp (upload de navegador), como sempre reconheceu", async () => {
    const p = path.join(root, "arte.png.uploading-jti123.tmp");
    writeFileSync(p, Buffer.alloc(10));
    tornarAntigo(p, 1000);
    const orphans = await findOrphanTmps(root, 500);
    expect(orphans.map((o) => o.path)).toEqual([p]);
  });

  it("reconhece .importing-*.tmp (importação por link) — o padrão que a varredura hoje NÃO pega", async () => {
    const p = path.join(root, "video.mp4.importing-art1.tmp");
    writeFileSync(p, Buffer.alloc(10));
    tornarAntigo(p, 1000);
    const orphans = await findOrphanTmps(root, 500);
    expect(orphans.map((o) => o.path)).toEqual([p]);
  });

  it("não pega tmp jovem demais, nem os dois padrões juntos deixam nada de fora", async () => {
    const velhoUpload = path.join(root, "a.png.uploading-x.tmp");
    const velhoImport = path.join(root, "b.mp4.importing-y.tmp");
    const jovem = path.join(root, "c.png.uploading-z.tmp");
    writeFileSync(velhoUpload, Buffer.alloc(1));
    writeFileSync(velhoImport, Buffer.alloc(1));
    writeFileSync(jovem, Buffer.alloc(1));
    tornarAntigo(velhoUpload, 1000);
    tornarAntigo(velhoImport, 1000);
    // jovem fica com mtime atual (não envelhecido)

    const orphans = await findOrphanTmps(root, 500);
    expect(new Set(orphans.map((o) => o.path))).toEqual(new Set([velhoUpload, velhoImport]));
  });
});
