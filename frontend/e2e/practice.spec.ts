import { expect, test } from "./fixtures";
import { firstPractice, partialShortAnswer } from "./mock-questions";

test("practice grades a right choice, a wrong number, and a half-right short answer", async ({ page }) => {
  const choice = firstPractice("mcq");
  const numeric = firstPractice("nat");
  const partial = partialShortAnswer();
  const correctIndex = choice.options?.findIndex((option) => option.id === choice.answer) ?? -1;
  if (correctIndex < 0 || typeof numeric.answer !== "string") {
    throw new Error("The practice mock is missing a choice or a number.");
  }
  const wrongNumber = numeric.answer === "0" ? "1" : "0";

  await page.goto("/practice");
  await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Multiple select", exact: true }).click();
  await page.getByRole("button", { name: "New set" }).click();

  await expect(page.getByRole("radio")).toHaveCount(choice.options?.length ?? 0);
  await page.getByRole("radio").nth(correctIndex).check();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();

  await page.getByRole("textbox", { name: "Your numeric answer" }).fill(wrongNumber);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Not the expected answer")).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();

  await page.getByRole("textbox", { name: "Your answer" }).fill(partial.given);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Partly right")).toBeVisible();
  for (const missing of partial.missing) {
    await expect(page.getByText(`Missing: ${missing}`)).toBeVisible();
  }
});
