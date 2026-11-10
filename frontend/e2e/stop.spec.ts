import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { FRESNEL, fresnelFeedback } from "./mock-questions";

test.use({ baseURL: "http://127.0.0.1:3101" });

const composer = "Ask about a concept, a formula, or a numerical problem";
const stopped = "Stopped before the answer finished.";

async function startFresnel(page: Page) {
  await page.goto("/ask");
  await page.getByPlaceholder(composer).fill(FRESNEL);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(fresnelFeedback())).toBeVisible({ timeout: 20_000 });
}

async function expectStopped(page: Page) {
  await expect(page.getByRole("article").getByText(stopped)).toBeVisible();
  await expect(page.getByText(fresnelFeedback())).toBeVisible();
  await expect(page.getByPlaceholder(composer)).toBeEnabled();
  await page.getByPlaceholder(composer).fill("What is Lenz's law?");
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeEnabled();
}

test("Stop keeps the parts that already arrived", async ({ page }) => {
  test.setTimeout(60_000);
  await startFresnel(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expectStopped(page);
});

test("Escape stops the answer", async ({ page }) => {
  test.setTimeout(60_000);
  await startFresnel(page);
  await page.keyboard.press("Escape");
  await expectStopped(page);
});
