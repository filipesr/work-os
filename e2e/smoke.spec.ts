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

  test("a rota antiga do calendário leva ao endereço atual antes do login", async ({ page }) => {
    // O 308 vive no MIDDLEWARE, antes da checagem de sessão. Então o anônimo é
    // primeiro levado ao endereço atual e só depois ao login — o callbackUrl que
    // ele traz de volta já é o novo. Feito na página seria o contrário: o
    // callbackUrl guardaria o endereço defunto e o desvio custaria um render
    // inteiro do layout autenticado antes de quicar.
    await page.goto("/reports/calendar?view=month");
    await expect(page).toHaveURL(/\/auth\/signin/);
    const url = decodeURIComponent(page.url());
    expect(url).toContain("/planning/calendar");
    expect(url).not.toContain("/reports/calendar");
  });
});
