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
});
