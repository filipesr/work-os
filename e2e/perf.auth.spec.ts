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
  const linhas: { rota: string; ttfb: number; domReady: number; total: number }[] = [];

  for (const rota of ROTAS) {
    // Duas passadas: a primeira aquece cache de query/conexão; medimos a segunda,
    // que representa o uso real de quem navega pelo app.
    await page.goto(rota);
    const t0 = Date.now();
    await page.goto(rota, { waitUntil: "domcontentloaded" });
    const domReady = Date.now() - t0;

    const nav = await page.evaluate(() => {
      const e = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return { ttfb: e.responseStart - e.requestStart, total: e.loadEventEnd - e.startTime };
    });

    linhas.push({
      rota,
      ttfb: Math.round(nav.ttfb),
      domReady,
      total: Math.round(nav.total),
    });
  }

  linhas.sort((a, b) => b.ttfb - a.ttfb);
  console.log("\nrota                            TTFB   DOM   total  (ms)");
  for (const l of linhas) {
    console.log(
      `${l.rota.padEnd(30)} ${String(l.ttfb).padStart(5)} ${String(l.domReady).padStart(5)} ${String(l.total).padStart(6)}`
    );
  }

  // Única asserção: nenhuma tela pode estourar 10s, que já seria quebra e não
  // lentidão. Limiar fino aqui só geraria falha intermitente.
  for (const l of linhas) expect(l.ttfb, `${l.rota} muito lenta`).toBeLessThan(10_000);
});
