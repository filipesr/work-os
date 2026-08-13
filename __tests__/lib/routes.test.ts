import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PROTECTED_PATHS, isProtectedPath } from "@/lib/routes";

/**
 * A guarda que importa aqui não é a de comportamento — é a de SINCRONIA.
 *
 * `PROTECTED_PATHS` é uma lista escrita à mão que precisa acompanhar o grupo de
 * rotas `(protected)`. Quando o calendário saiu de `/reports/calendar` para
 * `/planejamento/calendario`, ele deixou o prefixo `/reports` e ninguém
 * acrescentou `/planejamento` — o middleware parou de barrar anônimo em três
 * telas de gestão. `/projects`, `/minha-evolucao` e `/help` estavam no mesmo
 * estado. Cada página ainda chamava seu próprio `require*`, então não houve
 * vazamento; o que se perdeu foi a camada externa e o `callbackUrl`.
 *
 * Por isso o teste deriva a expectativa do disco em vez de repetir a lista:
 * uma lista escrita duas vezes envelhece nos dois lugares junto.
 */
const DIR_PROTEGIDO = path.join(process.cwd(), "app", "[locale]", "(protected)");

function segmentosNoDisco(): string[] {
  return fs
    .readdirSync(DIR_PROTEGIDO, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `/${e.name}`)
    .sort();
}

describe("PROTECTED_PATHS", () => {
  it("cobre todo segmento de primeiro nível dentro de (protected)", () => {
    const naLista = new Set<string>(PROTECTED_PATHS);
    const faltando = segmentosNoDisco().filter((s) => !naLista.has(s));

    expect(
      faltando,
      `Segmentos em app/[locale]/(protected)/ ausentes de PROTECTED_PATHS: ` +
        `${faltando.join(", ")}. Sem eles o middleware deixa anônimo chegar até o ` +
        `render da página e não carimba o callbackUrl. Acrescente em lib/routes.ts.`
    ).toEqual([]);
  });

  it("não lista segmento que não existe mais no disco", () => {
    // O outro lado da sincronia: caminho removido do app vira regra morta que
    // sugere proteção onde não há tela. `/tv` é a exceção declarada — mora em
    // `(tv)`, com layout de wallboard próprio.
    const noDisco = new Set(segmentosNoDisco());
    const orfaos = PROTECTED_PATHS.filter((p) => p !== "/tv" && !noDisco.has(p));

    expect(orfaos, `Caminhos protegidos sem rota correspondente: ${orfaos.join(", ")}`).toEqual([]);
  });

  it("casa por prefixo, incluindo as sub-rotas", () => {
    expect(isProtectedPath("/planejamento/cobertura")).toBe(true);
    expect(isProtectedPath("/reports/user/abc123")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
  });

  it("deixa passar as rotas públicas", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/auth/signin")).toBe(false);
  });
});
