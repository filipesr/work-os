import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CALENDAR_MONTH_PATH,
  CALENDAR_WEEK_PATH,
  LEGACY_PATH_REDIRECTS,
  PROTECTED_PATHS,
  isProtectedPath,
  resolveCalendarView,
  resolveLegacyPath,
  resolveRedirectTarget,
} from "@/lib/routes";

/**
 * A guarda que importa aqui não é a de comportamento — é a de SINCRONIA.
 *
 * `PROTECTED_PATHS` é uma lista escrita à mão que precisa acompanhar o grupo de
 * rotas `(protected)`. Quando o calendário saiu de `/reports/calendar` para o
 * grupo de planejamento, deixou o prefixo `/reports` e ninguém acrescentou o
 * novo — o middleware parou de barrar anônimo em três telas de gestão.
 * `/projects`, a evolução pessoal e `/help` estavam no mesmo estado. Cada
 * página ainda chamava seu próprio `require*`, então não houve vazamento; o que
 * se perdeu foi a camada externa e o `callbackUrl`.
 *
 * Renomear as rotas de português para inglês reabriria exatamente o mesmo buraco
 * — é a classe de erro que este teste fecha, não a instância.
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
    expect(isProtectedPath("/planning/coverage")).toBe(true);
    expect(isProtectedPath("/reports/user/abc123")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
  });

  it("deixa passar as rotas públicas", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/auth/signin")).toBe(false);
  });
});

describe("resolveLegacyPath", () => {
  it("leva cada endereço antigo ao atual", () => {
    expect(resolveLegacyPath("/planejamento/calendario")).toBe("/planning/calendar");
    expect(resolveLegacyPath("/planejamento/cobertura")).toBe("/planning/coverage");
    expect(resolveLegacyPath("/planejamento/datas")).toBe("/planning/dates");
    expect(resolveLegacyPath("/minha-evolucao")).toBe("/my-evolution");
    expect(resolveLegacyPath("/reports/calendar")).toBe("/planning/calendar");
  });

  it("casa o caminho mais longo primeiro", () => {
    // A armadilha da ordem: `/planejamento` é prefixo dos três filhos. Se casasse
    // antes, quem salvou a cobertura cairia na raiz do planejamento — um desvio
    // que "funciona" e leva à tela errada, do tipo que ninguém reporta como bug.
    expect(resolveLegacyPath("/planejamento/datas")).not.toBe("/planning/datas");
    expect(resolveLegacyPath("/planejamento/datas")).toBe("/planning/dates");
  });

  it("preserva o que vier depois do segmento renomeado", () => {
    expect(resolveLegacyPath("/planejamento/datas/abc123")).toBe("/planning/dates/abc123");
  });

  it("não mexe em caminho que não mudou de nome", () => {
    expect(resolveLegacyPath("/planning/dates")).toBeNull();
    expect(resolveLegacyPath("/dashboard")).toBeNull();
    // Prefixo parcial não conta: `/reports` continua sendo ele mesmo, só
    // `/reports/calendar` mudou.
    expect(resolveLegacyPath("/reports")).toBeNull();
    expect(resolveLegacyPath("/reports/performance")).toBeNull();
  });

  it("aponta todo destino para uma rota que existe e está protegida", () => {
    // Um destino digitado errado aqui vira 404 depois de um 308 — e 308 é
    // permanente: o navegador guarda o desvio quebrado e nem tenta de novo.
    for (const destino of Object.values(LEGACY_PATH_REDIRECTS)) {
      expect(isProtectedPath(destino), `${destino} não está protegido`).toBe(true);
      const [, primeiro] = destino.split("/");
      expect(
        fs.existsSync(path.join(DIR_PROTEGIDO, primeiro)),
        `${destino} aponta para um segmento que não existe no disco`
      ).toBe(true);
    }
  });

  it("não aponta para um endereço que também é antigo", () => {
    // Encadear 308 custa duas viagens por link e é fácil de criar sem perceber
    // ao renomear duas vezes.
    for (const destino of Object.values(LEGACY_PATH_REDIRECTS)) {
      expect(resolveLegacyPath(destino), `${destino} redireciona de novo`).toBeNull();
    }
  });
});

describe("resolveCalendarView", () => {
  it("escolhe a rota pela visão pedida", () => {
    expect(resolveCalendarView("/planning/calendar", "month")).toBe(CALENDAR_MONTH_PATH);
    expect(resolveCalendarView("/planning/calendar", "week")).toBe(CALENDAR_WEEK_PATH);
  });

  it("sem visão declarada cai na semana", () => {
    // Era o padrão quando as duas dividiam uma rota (`view` ausente = semana);
    // quem tem `/planning/calendar` no favorito continua chegando no mesmo lugar.
    expect(resolveCalendarView("/planning/calendar", null)).toBe(CALENDAR_WEEK_PATH);
    expect(resolveCalendarView("/planning/calendar", "qualquer-coisa")).toBe(CALENDAR_WEEK_PATH);
  });

  it("não mexe nas rotas já separadas", () => {
    // Sem isto o desvio se aplicaria ao próprio destino e viraria laço.
    expect(resolveCalendarView(CALENDAR_WEEK_PATH, null)).toBeNull();
    expect(resolveCalendarView(CALENDAR_MONTH_PATH, "month")).toBeNull();
    expect(resolveCalendarView("/planning/coverage", "month")).toBeNull();
  });
});

describe("resolveRedirectTarget", () => {
  it("resolve renomeação e visão num salto só", () => {
    // O caso que justifica a composição: o endereço é antigo NOS DOIS sentidos
    // — nome em português e visão por query. Em sequência seriam dois 308.
    expect(resolveRedirectTarget("/planejamento/calendario", "month")).toEqual({
      pathname: CALENDAR_MONTH_PATH,
      dropView: true,
    });
    expect(resolveRedirectTarget("/reports/calendar", "month")).toEqual({
      pathname: CALENDAR_MONTH_PATH,
      dropView: true,
    });
    expect(resolveRedirectTarget("/planejamento/calendario", null)).toEqual({
      pathname: CALENDAR_WEEK_PATH,
      dropView: true,
    });
  });

  it("descarta `view` só quando ele decidiu a rota", () => {
    // Numa renomeação comum não há `view` para descartar; apagar parâmetro alheio
    // seria perder filtro de quem salvou o link.
    expect(resolveRedirectTarget("/planejamento/datas", null)).toEqual({
      pathname: "/planning/dates",
      dropView: false,
    });
  });

  it("deixa em paz quem já está no lugar certo", () => {
    expect(resolveRedirectTarget(CALENDAR_WEEK_PATH, null)).toBeNull();
    expect(resolveRedirectTarget(CALENDAR_MONTH_PATH, null)).toBeNull();
    expect(resolveRedirectTarget("/dashboard", null)).toBeNull();
  });

  it("todo destino final é uma rota com página no disco", () => {
    // A garantia que fecha a cadeia: 308 é permanente, então um destino sem
    // página vira 404 que o navegador guarda e nem tenta de novo. Verifica o
    // resultado da composição, não os elos.
    const entradas = [
      ...Object.keys(LEGACY_PATH_REDIRECTS),
      "/planning/calendar",
      ...Object.values(LEGACY_PATH_REDIRECTS),
    ];

    for (const entrada of entradas) {
      for (const view of [null, "month"]) {
        const destino = resolveRedirectTarget(entrada, view)?.pathname ?? entrada;
        // Um segundo passe não pode mover de novo: seria 308 encadeado.
        expect(resolveRedirectTarget(destino, null), `${entrada} desvia duas vezes`).toBeNull();

        const pasta = path.join(DIR_PROTEGIDO, ...destino.split("/").filter(Boolean));
        expect(
          fs.existsSync(path.join(pasta, "page.tsx")),
          `${entrada} (view=${view}) → ${destino}, que não tem page.tsx`
        ).toBe(true);
      }
    }
  });
});
