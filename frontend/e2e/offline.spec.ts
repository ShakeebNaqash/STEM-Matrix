import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const composer = "Ask about a concept, a formula, or a numerical problem";
const banner = "The StemMatrix server isn't running. This will reconnect on its own once it's back.";

async function offline(page: Page) {
  await page.route("**/api/health", (route) => route.fulfill({ status: 502, contentType: "application/json", body: "{\"error\":\"down\"}" }));
  await page.route("**/api/feedback", (route) => route.fulfill({ status: 502, contentType: "application/json", body: "{\"error\":\"down\"}" }));
}

test("the app goes offline and comes back when health recovers", async ({ page }) => {
  await offline(page);
  await page.goto("/ask");
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
  await expect(page.getByText(banner)).toBeVisible();
  await page.getByPlaceholder(composer).fill("What is Lenz's law?");
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();

  await page.unroute("**/api/health");
  await page.unroute("**/api/feedback");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  await expect(page.getByText(banner)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeEnabled();
});

test("an offline downvote is sent with its reason after the server returns", async ({ page }) => {
  await offline(page);
  await page.goto("/ask");
  await page.locator("aside").getByRole("button", { name: /^What is Lenz's law\?/ }).click();
  await page.getByRole("button", { name: "Not helpful" }).click();
  await page.getByRole("button", { name: "Wrong answer" }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Will send when the server is back")).toBeVisible();

  await page.unroute("**/api/health");
  await page.unroute("**/api/feedback");
  const sent = page.waitForRequest((request) => request.url().includes("/api/feedback") && request.method() === "POST");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const request = await sent;
  const body: unknown = request.postDataJSON();
  expect(body).toMatchObject({
    question: "What is Lenz's law?",
    vote: "down",
    reason: "Wrong answer",
  });
});
