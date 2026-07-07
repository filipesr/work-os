import { describe, it, expect } from "vitest";
import { sniffUpload, SniffError } from "../src/sniff";

const h = (hex: string) => Buffer.from(hex, "hex");

describe("sniffUpload", () => {
  it("bloqueia executável (MZ) mesmo com extensão permitida", () => {
    expect(() => sniffUpload(h("4d5a90000300"), "pdf")).toThrow(SniffError);
    try {
      sniffUpload(h("4d5a90"), "png");
    } catch (e) {
      expect((e as SniffError).code).toBe("EXECUTABLE");
    }
  });

  it("bloqueia ELF e shebang", () => {
    expect(() => sniffUpload(h("7f454c46"), "mp4")).toThrow(/executável/);
    expect(() => sniffUpload(Buffer.from("#!/bin/sh\n"), "jpg")).toThrow(/executável/);
  });

  it("aceita magic correto por extensão", () => {
    expect(() => sniffUpload(h("ffd8ffe000104a4649"), "jpg")).not.toThrow();
    expect(() => sniffUpload(h("89504e470d0a1a0a"), "png")).not.toThrow();
    expect(() => sniffUpload(h("25504446312e37"), "pdf")).not.toThrow();
    expect(() => sniffUpload(h("504b0304140006"), "docx")).not.toThrow();
    expect(() => sniffUpload(Buffer.from('<?xml version="1.0"?><svg'), "svg")).not.toThrow();
    // ftyp box no offset 4 (mp4)
    expect(() => sniffUpload(h("0000001c66747970"), "mp4")).not.toThrow();
  });

  it("rejeita mismatch de assinatura para tipo conhecido", () => {
    // .png declarado, mas bytes de PDF.
    expect(() => sniffUpload(h("25504446"), "png")).toThrow(/não conferem/);
    try {
      sniffUpload(h("ffd8ff"), "pdf");
    } catch (e) {
      expect((e as SniffError).code).toBe("MAGIC_MISMATCH");
    }
  });

  it("é permissivo com formatos exóticos sem assinatura conhecida", () => {
    // .psd/.indd/.cdr não têm matcher → aceita (desde que não seja executável).
    expect(() => sniffUpload(h("38425053"), "psd")).not.toThrow();
    expect(() => sniffUpload(h("00112233"), "indd")).not.toThrow();
    expect(() => sniffUpload(h("deadbeef"), "cr2")).not.toThrow();
  });
});
