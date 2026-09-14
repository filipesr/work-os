import { describe, it, expect } from "vitest";
import {
  mapArtifactRow,
  artifactTypeLabel,
  artifactTypeLabelKey,
  sortRows,
} from "@/lib/artifacts/unify";

describe("mapArtifactRow", () => {
  it("mapeia link de projeto (origin PROJECT, sem tarefa)", () => {
    const row = mapArtifactRow(
      {
        id: "a1",
        title: "Briefing",
        url: "https://x",
        type: "DOCUMENT",
        createdAt: "2026-07-01T00:00:00Z",
      },
      "PROJECT"
    );
    expect(row).toMatchObject({
      id: "a1",
      origin: "PROJECT",
      storageKind: "LINK",
      type: "DOCUMENT",
      taskId: null,
      taskTitle: null,
    });
  });

  it("achata artefato de tarefa com título da tarefa e nome do autor", () => {
    const row = mapArtifactRow(
      {
        id: "a2",
        title: "Arte",
        url: null,
        storageKind: "NAS_UPLOAD",
        uploadStatus: "READY",
        mediaType: "FOTOS",
        fileName: "arte_v01.jpg",
        createdAt: new Date("2026-07-02T00:00:00Z"),
        user: { name: "Fabi", email: "f@x.com" },
      },
      "TASK",
      { id: "t1", title: "Campanha X" }
    );
    expect(row).toMatchObject({
      origin: "TASK",
      storageKind: "NAS_UPLOAD",
      mediaType: "FOTOS",
      fileName: "arte_v01.jpg",
      taskId: "t1",
      taskTitle: "Campanha X",
      userName: "Fabi",
    });
    expect(row.createdAt).toBe("2026-07-02T00:00:00.000Z");
  });

  it("cai para o email quando não há nome", () => {
    const row = mapArtifactRow(
      {
        id: "a3",
        title: "x",
        createdAt: "2026-01-01T00:00:00Z",
        user: { name: null, email: "e@x.com" },
      },
      "CLIENT"
    );
    expect(row.userName).toBe("e@x.com");
  });
});

describe("artifactTypeLabel", () => {
  it("usa mediaType para NAS", () => {
    expect(
      artifactTypeLabel({ storageKind: "NAS_UPLOAD", type: null, mediaType: "SOCIAL_MEDIA" })
    ).toBe("Social Media");
  });
  it("usa ArtifactType para link", () => {
    expect(artifactTypeLabel({ storageKind: "LINK", type: "IMAGE", mediaType: null })).toBe(
      "Imagem"
    );
  });
  it("cai para — quando não há tipo", () => {
    expect(artifactTypeLabel({ storageKind: "LINK", type: null, mediaType: null })).toBe("—");
  });
});

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

  // Os três acima se nomeiam "continua", "segue como antes" porque são NÃO-REGRESSÃO de propósito:
  // produzem o mesmo resultado com a regra velha (storageKind escolhe o campo) e com a nova
  // (mediaType manda). São legítimos — só não provam a mudança. Os dois abaixo provam.

  it("[DISCRIMINA] com os DOIS preenchidos, mediaType vence o type", () => {
    // O caso que a regra existe para resolver, e o único em que os dois caminhos discordam. Um
    // artefato de link pode carregar `type` legado E `mediaType` novo ao mesmo tempo — durante a
    // migração, é o estado normal. Empatar em `type` faria a etiqueta contradizer o campo que a
    // aba passou a pedir.
    const row = { storageKind: "LINK" as const, type: "DOCUMENT", mediaType: "FOTOS" };
    expect(artifactTypeLabelKey(row)).toBe("mediaTypes.FOTOS");
    expect(artifactTypeLabel(row)).toBe("Fotos");
  });

  it("[DISCRIMINA] o storageKind NÃO participa da decisão", () => {
    // Um upload no NAS sem `mediaType` cai no `type`, como qualquer outro. Enquanto a regra fosse
    // "NAS usa mediaType, link usa type", esta linha devolveria null e a tela mostraria travessão
    // para um artefato que sabe dizer o que é.
    const row = { storageKind: "NAS_UPLOAD" as const, type: "IMAGE", mediaType: null };
    expect(artifactTypeLabelKey(row)).toBe("types.image");
    expect(artifactTypeLabel(row)).toBe("Imagem");
  });
});

describe("sortRows", () => {
  it("ordena mais recentes primeiro", () => {
    const rows = [
      mapArtifactRow({ id: "old", title: "o", createdAt: "2026-01-01T00:00:00Z" }, "TASK"),
      mapArtifactRow({ id: "new", title: "n", createdAt: "2026-07-01T00:00:00Z" }, "TASK"),
    ];
    expect(sortRows(rows).map((r) => r.id)).toEqual(["new", "old"]);
  });
});
