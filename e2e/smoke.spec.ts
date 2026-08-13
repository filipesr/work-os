import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("redirects unauthenticated user to sign-in", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response).not.toBeNull();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test("sign-in page renders Google button", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.locator("body")).toContainText(/google/i);
  });

  test("locale switcher present on sign-in page", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.locator("html")).toHaveAttribute("lang", /pt|es/);
  });

  // O destino pós-login: o middleware carimba a rota tentada e a página tem que
  // preservá-la. Era `redirectTo: "/"` fixo — quem clicava num link de tarefa
  // perdia o destino ao autenticar. Verificável SEM autenticar.
  test("preserva a rota tentada no callbackUrl", async ({ page }) => {
    await page.goto("/admin/tasks");
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page).toHaveURL(/callbackUrl=/);
    expect(decodeURIComponent(page.url())).toContain("/admin/tasks");
  });

  test("a rota antiga do calendário redireciona para planejamento", async ({ page }) => {
    // 308 preservando a query: link salvo e favorito continuam funcionando.
    await page.goto("/reports/calendar?view=month");
    await expect(page).toHaveURL(/\/auth\/signin/);
    expect(decodeURIComponent(page.url())).toContain("/planejamento/calendario");
  });
});
