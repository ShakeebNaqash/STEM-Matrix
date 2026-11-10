import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { sourceAria } from "@/lib/format";
import {
  CAR,
  CUBIC,
  INTEGRAL,
  SINGULAR,
  UNMATCHED_STATUS,
  carClarification,
  integralCitation,
  integralPlan,
  singularStatus,
} from "./mock-questions";

const composer = "Ask about a concept, a formula, or a numerical problem";

async function ask(page: Page, question: string) {
  await page.getByPlaceholder(composer).fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 20_000 });
}

test("a checked integral shows the three labels, both attempts, and the cited passage", async ({ page }) => {
  const plan = integralPlan();
  const citation = integralCitation();
  await page.goto("/ask");
  await ask(page, INTEGRAL);

  const panel = page.locator("aside");
  await expect(page.getByRole("button", { name: sourceAria("textbook") }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: sourceAria("solver") }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: sourceAria("model") }).first()).toBeVisible();
  await expect(page.getByText("Checked by the solver").first()).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Verification" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByText("Mismatch", { exact: true })).toBeVisible();
  await expect(panel.getByText("Match", { exact: true })).toBeVisible();
  await expect(panel.getByText(plan.attempts[0]?.feedback ?? "")).toBeVisible();

  await page.getByRole("button", { name: citation.chip }).click();
  await expect(panel.getByRole("heading", { name: citation.book })).toBeVisible();
  await expect(panel.getByText(citation.line)).toBeVisible();
});

test("failed, unmatched, and clarification answers stay readable", async ({ page }) => {
  const failed = singularStatus();
  const clarification = carClarification();
  await page.goto("/ask");

  await ask(page, SINGULAR);
  await expect(page.getByText(failed.heading).first()).toBeVisible();
  await expect(page.getByText(failed.detail).first()).toBeVisible();

  await ask(page, CUBIC);
  await expect(page.getByText(UNMATCHED_STATUS).first()).toBeVisible();

  await ask(page, CAR);
  await expect(page.getByText(clarification.message)).toBeVisible();
  for (const pattern of clarification.patterns) {
    await expect(page.getByText(pattern, { exact: true })).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText("['2'");
  await expect(page.locator("body")).not.toContainText("{'real'");

  await page.getByRole("button", { name: "Edit your question" }).click();
  await expect(page.getByPlaceholder(composer)).toHaveValue(CAR);
});
