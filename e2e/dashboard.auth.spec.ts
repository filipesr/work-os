import { test, expect } from "@playwright/test";

/**
 * Testes AUTENTICADOS. Só rodam quando existe `e2e/.auth/state.json`
 * (ver e2e/auth-fixture.md).
 *
 * ⚠️ SOMENTE LEITURA enquanto o e2e apontar para o banco de produção. Abrir
 * telas e conferir que renderizam é seguro; clicar em "criar" geraria dado
 * real. Testes de escrita só depois de haver um banco de teste separado.
 */
test.describe("telas internas (autenticado)", () => {
  test("o dashboard abre sem cair no login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/auth\/signin/);
  });

  test("cobertura semanal renderiza as semanas", async ({ page }) => {
    // A tela que mais iteramos. Verifica o que teste de componente não alcança:
    // que a página inteira monta com dados reais, sem erro de servidor.
    await page.goto("/planning/coverage");
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("datas do calendário renderiza a tabela", async ({ page }) => {
    await page.goto("/planning/dates");
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("os endereços antigos em português redirecionam preservando a query", async ({ page }) => {
    // As rotas passaram de português para inglês. Autenticado é o único lugar
    // onde dá para ver o 308 acontecer: anônimo é barrado pelo middleware antes
    // de chegar ao stub. A query importa tanto quanto o caminho — um favorito
    // do calendário guarda ?view=month, e perder isso abre a tela errada.
    const mudancas: [string, string][] = [
      ["/planejamento/calendario?view=month", "/planning/calendar?view=month"],
      ["/planejamento/cobertura", "/planning/coverage"],
      ["/planejamento/datas", "/planning/dates"],
      ["/minha-evolucao", "/my-evolution"],
      ["/reports/calendar?view=month", "/planning/calendar?view=month"],
    ];

    for (const [antigo, novo] of mudancas) {
      await page.goto(antigo);
      await expect(page, `${antigo} deveria levar a ${novo}`).toHaveURL(
        new RegExp(`${novo.replace(/[?]/g, "\\?")}$`)
      );
    }
  });

  test("nenhuma tela de gestão vaza MISSING_MESSAGE", async ({ page }) => {
    // Os três erros de i18n desta sessão só apareceram ao abrir a página. Os
    // guards estáticos cobrem namespace, chave e prefixo dinâmico; a chave
    // dinâmica com VALOR inexistente só o render revela — é o que este pega.
    //
    // Detectar "chave crua na tela" por regex foi tentado e descartado: um
    // domínio ou nome de arquivo casaria e a falha seria misteriosa.
    const rotas = [
      "/dashboard",
      "/planning/coverage",
      "/planning/dates",
      "/planning/calendar",
      "/reports/performance",
      "/reports/productivity",
      "/admin/users",
      "/admin/clients",
      "/projects",
    ];

    for (const rota of rotas) {
      await page.goto(rota);
      const corpo = (await page.locator("body").innerText()) ?? "";
      expect(corpo, `MISSING_MESSAGE em ${rota}`).not.toContain("MISSING_MESSAGE");
    }
  });
});
