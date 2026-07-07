import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkArtifactFiles } from "../src/reconcile";

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
