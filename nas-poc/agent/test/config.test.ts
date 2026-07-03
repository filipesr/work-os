import { describe, it, expect } from "vitest";
import path from "node:path";
import { safeResolve } from "../src/config.js";
import { sanitizeDisposition, resolveRange } from "../src/server.js";

const ROOT = path.resolve("/data");

describe("safeResolve", () => {
  it("resolves a normal relative path inside the root", () => {
    expect(safeResolve(ROOT, "Cliente/Campanhas/2026_07_X/videos/f.mov")).toBe(
      path.join(ROOT, "Cliente/Campanhas/2026_07_X/videos/f.mov")
    );
  });
  it("rejects traversal", () => {
    expect(() => safeResolve(ROOT, "../etc/passwd")).toThrow(/\.\.|escapa/);
    expect(() => safeResolve(ROOT, "a/../../b")).toThrow(/\.\.|escapa/);
  });
  it("rejects absolute paths", () => {
    expect(() => safeResolve(ROOT, "/etc/passwd")).toThrow(/absoluto/);
  });
  it("rejects empty", () => {
    expect(() => safeResolve(ROOT, "")).toThrow(/vazio/);
  });
});

describe("resolveRange", () => {
  it("parses a normal range", () => {
    expect(resolveRange("bytes=0-99", 1000)).toEqual({ satisfiable: true, start: 0, end: 99 });
  });
  it("clamps a too-large end to size-1 (not 416)", () => {
    expect(resolveRange("bytes=0-1048575", 65536)).toEqual({
      satisfiable: true,
      start: 0,
      end: 65535,
    });
  });
  it("handles a suffix range", () => {
    expect(resolveRange("bytes=-500", 1000)).toEqual({ satisfiable: true, start: 500, end: 999 });
  });
  it("is unsatisfiable when start >= size", () => {
    expect(resolveRange("bytes=2000-3000", 1000).satisfiable).toBe(false);
  });
  it("is unsatisfiable for a malformed header", () => {
    expect(resolveRange("bytes=abc", 1000).satisfiable).toBe(false);
    expect(resolveRange("bytes=-", 1000).satisfiable).toBe(false);
  });
});

describe("sanitizeDisposition", () => {
  it("emits UTF-8 + ASCII fallback, no CR/LF/quotes", () => {
    const d = sanitizeDisposition('Relat"ório\r\n.pdf');
    expect(d).not.toMatch(/[\r\n]/);
    expect(d).toContain("filename=");
    expect(d).toContain("filename*=UTF-8''");
    expect(d).not.toContain('"Relat"ório');
  });
});
