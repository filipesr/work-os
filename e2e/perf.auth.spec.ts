import { test, expect } from "@playwright/test";

/**
 * Medição de tempo das telas principais. NÃO é um teste de regressão com
 * limiar — número de máquina local varia demais para isso virar guarda. Serve
 * para enxergar o perfil e achar o que destoa.
 *
 * Rodar contra um build de produção (`next build && next start`), nunca contra
 * o dev: em dev cada rota compila sob demanda e o número não significa nada.
 */
const ROTAS = [
  "/dashboard",
  "/planning/coverage",
  "/planning/dates",
  "/planning/calendar",
  "/reports/performance",
  "/reports/productivity",
  "/reports/live-activity",
  "/admin/users",
  "/admin/clients",
  "/admin",
  "/projects",
  "/tasks",
];

test("perfil de tempo das telas", async ({ page }) => {
  test.setTimeout(180_000);
  const linhas: { rota: string; ttfb: number; fcp: number; conteudo: number; total: number }[] = [];

  for (const rota of ROTAS) {
    // Duas passadas: a primeira aquece cache de query/conexão; medimos a segunda,
    // que representa o uso real de quem navega pelo app.
    await page.goto(rota);
    const t0 = Date.now();
    await page.goto(rota, { waitUntil: "domcontentloaded" });

    // O `h1` só existe na tela pronta — nenhum dos `loading.tsx` tem heading.
    // É o que separa "apareceu alguma coisa" de "apareceu a tela": a diferença
    // entre FCP e este número é quanto tempo a pessoa passa olhando o esqueleto.
    await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
    const conteudo = Date.now() - t0;

    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return {
        ttfb: nav.responseStart - nav.requestStart,
        fcp: fcp ? fcp.startTime : -1,
        total: nav.loadEventEnd - nav.startTime,
      };
    });

    linhas.push({
      rota,
      ttfb: Math.round(m.ttfb),
      fcp: Math.round(m.fcp),
      conteudo,
      total: Math.round(m.total),
    });
  }

  linhas.sort((a, b) => b.conteudo - a.conteudo);
  console.log("\nrota                            TTFB    FCP  conteúdo  esqueleto   total  (ms)");
  for (const l of linhas) {
    const esqueleto = l.fcp >= 0 ? l.conteudo - Math.round(l.fcp) : -1;
    console.log(
      `${l.rota.padEnd(30)} ${String(l.ttfb).padStart(4)} ${String(l.fcp).padStart(6)} ` +
        `${String(l.conteudo).padStart(9)} ${String(esqueleto).padStart(10)} ${String(l.total).padStart(7)}`
    );
  }

  // Única asserção: nenhuma tela pode estourar 10s, que já seria quebra e não
  // lentidão. Limiar fino aqui só geraria falha intermitente.
  for (const l of linhas) expect(l.conteudo, `${l.rota} muito lenta`).toBeLessThan(10_000);
});
