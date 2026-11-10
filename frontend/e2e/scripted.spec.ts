import { expect, test } from "./fixtures";

const composer = "Ask about a concept, a formula, or a numerical problem";
const scriptedBanner = "Chat answers here are scripted previews. The real model and textbook search aren't connected yet.";
const noModelBanner = "The model isn't running, so only calculations can be answered right now.";

test("a mock answer is marked as a preview", async ({ page }) => {
  await page.goto("/ask");
  await page.getByPlaceholder(composer).fill("What is Lenz's law?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("Preview answer").first()).toBeVisible();
});

test("scripted chat replaces the no-model banner", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", backend: "live", model: "not_connected", scripted: ["chat"] }),
    }),
  );
  await page.goto("/ask");
  await expect(page.getByText(scriptedBanner)).toBeVisible();
  await expect(page.getByText(noModelBanner)).toHaveCount(0);
});

test("a live chat with no scripted routes keeps the no-model banner", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", backend: "live", model: "not_connected", scripted: [] }),
    }),
  );
  await page.goto("/ask");
  await expect(page.getByText(noModelBanner)).toBeVisible();
  await expect(page.getByText(scriptedBanner)).toHaveCount(0);
});
