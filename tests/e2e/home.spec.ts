import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Manage your Traefik proxy services")).toBeVisible();
});


test("Traefik Live page loads", async ({ page }) => {
  await page.goto("/traefik");

  await expect(page.getByRole("heading", { name: "Traefik Live" })).toBeVisible();
  await expect(page.getByText("Live Resources")).toBeVisible();
});
