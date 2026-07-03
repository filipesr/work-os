import { describe, it, expect } from "vitest";
import {
  isChannelAllowed,
  canShare,
  canDownloadExternally,
  transitionRevokesShares,
} from "@/lib/nas/sensitivity";

describe("isChannelAllowed — matriz sensibilidade × contexto", () => {
  it("permite download interno na LAN para toda sensibilidade", () => {
    expect(isChannelAllowed("INTERNO", "lan-download")).toBe(true);
    expect(isChannelAllowed("CLIENTE", "lan-download")).toBe(true);
    expect(isChannelAllowed("CONFIDENCIAL", "lan-download")).toBe(true);
  });

  it("só CLIENTE pode download externo (túnel) e share", () => {
    for (const ch of ["tunnel-download", "share"] as const) {
      expect(isChannelAllowed("CLIENTE", ch)).toBe(true);
      expect(isChannelAllowed("INTERNO", ch)).toBe(false);
      expect(isChannelAllowed("CONFIDENCIAL", ch)).toBe(false);
    }
  });
});

describe("canShare / canDownloadExternally", () => {
  it("são true apenas para CLIENTE", () => {
    expect(canShare("CLIENTE")).toBe(true);
    expect(canShare("INTERNO")).toBe(false);
    expect(canShare("CONFIDENCIAL")).toBe(false);
    expect(canDownloadExternally("CLIENTE")).toBe(true);
    expect(canDownloadExternally("INTERNO")).toBe(false);
    expect(canDownloadExternally("CONFIDENCIAL")).toBe(false);
  });
});

describe("transitionRevokesShares", () => {
  it("revoga shares ao sair de CLIENTE", () => {
    expect(transitionRevokesShares("CLIENTE", "INTERNO")).toBe(true);
    expect(transitionRevokesShares("CLIENTE", "CONFIDENCIAL")).toBe(true);
  });
  it("não revoga quando permanece CLIENTE ou entra em CLIENTE", () => {
    expect(transitionRevokesShares("CLIENTE", "CLIENTE")).toBe(false);
    expect(transitionRevokesShares("INTERNO", "CLIENTE")).toBe(false);
    expect(transitionRevokesShares("INTERNO", "CONFIDENCIAL")).toBe(false);
  });
});
