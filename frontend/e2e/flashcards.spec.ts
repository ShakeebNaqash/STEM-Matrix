import { expect, test } from "./fixtures";
import { flashcards } from "@/lib/mock/corpus";
import { flashcardCitation } from "./mock-questions";

test("Know and Again update the counter, and a citation opens the passage", async ({ page }) => {
  const first = flashcards[0];
  const second = flashcards[1];
  const third = flashcards[2];
  const citation = flashcardCitation();
  if (!first || !second || !third) throw new Error("The mock deck is shorter than three cards.");

  await page.goto("/flashcards");
  await expect(page.getByText(`1 of ${flashcards.length}`)).toBeVisible();
  const card = () => page.getByRole("button", { name: /Click to flip|Click to show the formula|Tap to flip|Tap to show the formula/ });
  await expect(card()).toContainText(first.front);

  await card().click();
  await expect(page.getByText(first.back)).toBeVisible();
  await page.getByRole("button", { name: citation.chip, exact: true }).click({ force: true });
  const passage = page.getByRole("dialog");
  await expect(passage.getByRole("heading", { name: citation.book })).toBeVisible();
  await expect(passage.getByText(citation.line)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(card()).toContainText(first.back);

  await page.getByRole("button", { name: "Know" }).click();
  await expect(page.getByText(`1 of ${flashcards.length - 1}`)).toBeVisible();
  await expect(page.getByText("1 known")).toBeVisible();
  await expect(card()).toContainText(second.front);

  await page.getByRole("button", { name: "Again" }).click();
  await expect(page.getByText(`1 of ${flashcards.length - 1}`)).toBeVisible();
  await expect(card()).toContainText(third.front);
});
