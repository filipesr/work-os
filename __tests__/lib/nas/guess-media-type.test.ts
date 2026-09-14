import { describe, it, expect, vi } from "vitest";

// `guessMediaType` é função pura, mas mora ao lado das chamadas de upload — e o módulo delas puxa
// next-auth, que não carrega sob jsdom. O mock existe só para o import do arquivo passar; nada
// aqui chama server action nenhuma.
vi.mock("@/lib/actions/artifact", () => ({
  markUploading: vi.fn(),
  prepareArtifactUpload: vi.fn(),
}));

import { guessMediaType } from "@/lib/nas/upload-client";

/** Os valores que o banco aceita — `enum ArtifactMediaType` em prisma/schema.prisma. */
const TIPOS_VALIDOS = new Set([
  "VIDEOS",
  "FOTOS",
  "DOCUMENTOS",
  "LOGOS",
  "SOCIAL_MEDIA",
  "FIGMA",
  "OUTROS",
]);

describe("guessMediaType", () => {
  it("é PALPITE: o que não conhece vira null, não um tipo qualquer", () => {
    // O null é o contrato, e cada chamador decide o que fazer com ele — `useNasReupload` usa
    // DOCUMENTOS para produzir a recusa certa, o formulário deixa a pessoa escolher. Devolver um
    // tipo inventado aqui tiraria essa decisão de quem a tem.
    expect(guessMediaType("contrato.xyz")).toBeNull();
    expect(guessMediaType("sem-extensao")).toBeNull();
    expect(guessMediaType("termina-em-ponto.")).toBeNull();
    expect(guessMediaType("")).toBeNull();
  });

  it("a extensão é lida sem diferenciar caixa", () => {
    // Câmera e celular entregam `.JPG`, `.MOV`, `.PNG` em maiúsculas o tempo todo. Sem a
    // normalização, o palpite falharia justamente nos arquivos que mais chegam.
    expect(guessMediaType("foto.JPG")).toBe("FOTOS");
    expect(guessMediaType("video.MOV")).toBe("VIDEOS");
    expect(guessMediaType("Arte.PnG")).toBe("FOTOS");
  });

  it("vale o ÚLTIMO segmento, não o primeiro ponto do nome", () => {
    // "relatorio.final.pdf" é documento, não um arquivo de extensão "final". E um nome que
    // contenha um ponto no meio é o caso comum, não a exceção.
    expect(guessMediaType("relatorio.final.pdf")).toBe("DOCUMENTOS");
    expect(guessMediaType("campanha.v2.mp4")).toBe("VIDEOS");
  });

  it("um arquivo oculto não é confundido com extensão", () => {
    // ".gitignore" não tem extensão — tem nome começando com ponto. Tratá-lo como extensão
    // "gitignore" é inofensivo aqui só porque ela é desconhecida; o teste fixa isso como esperado.
    expect(guessMediaType(".gitignore")).toBeNull();
  });

  it("[GUARD] todo tipo que a tabela devolve existe no enum do banco", () => {
    // Este é o teste que não pode faltar. A tabela é uma lista escrita à mão, e um valor com erro
    // de digitação ("FOTO" em vez de "FOTOS") não falha aqui nem no tsc — falha no INSERT, em
    // produção, com o arquivo já enviado ao NAS. Varre todas as extensões conhecidas.
    const amostra = [
      "a.mp4",
      "a.mov",
      "a.webm",
      "a.mkv",
      "a.jpg",
      "a.jpeg",
      "a.png",
      "a.webp",
      "a.gif",
      "a.tiff",
      "a.tif",
      "a.heic",
      "a.raw",
      "a.cr2",
      "a.nef",
      "a.arw",
      "a.svg",
      "a.ai",
      "a.eps",
      "a.cdr",
      "a.pdf",
      "a.docx",
      "a.xlsx",
      "a.pptx",
      "a.txt",
      "a.zip",
      "a.indd",
      "a.psd",
    ];
    for (const nome of amostra) {
      const tipo = guessMediaType(nome);
      expect(tipo, `${nome} não devia devolver null — está na tabela`).not.toBeNull();
      expect(TIPOS_VALIDOS, `${nome} → ${tipo} não é valor do enum`).toContain(tipo);
    }
  });

  it("[GUARD] o palpite nunca devolve um tipo que é só de LINK", () => {
    // FIGMA e OUTROS existem para artefatos sem arquivo. Se um deles entrasse na tabela de
    // extensões, o upload seria recusado pelo servidor com uma mensagem sobre TIPO — e a pessoa,
    // que nunca escolheu tipo nenhum, procuraria o erro no lugar errado.
    const amostra = ["a.mp4", "a.jpg", "a.pdf", "a.svg", "a.psd", "a.zip"];
    for (const nome of amostra) {
      expect(["FIGMA", "OUTROS"]).not.toContain(guessMediaType(nome));
    }
  });
});
