import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { sourceExplanation } from "@/lib/format";

test.beforeEach(async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "hover", value: "none" },
      { name: "pointer", value: "coarse" },
    ],
  });
});

async function boxesDoNotOverlap(page: Page) {
  const names = ["Ask", "Practice", "Flashcards", "Preview"];
  const boxes = [];
  for (const name of names) {
    const box = await page.getByRole("link", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first().boundingBox();
    expect(box, name).not.toBeNull();
    if (box) boxes.push(box);
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (!a || !b) continue;
      const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(overlaps).toBe(false);
    }
  }
}

async function noHorizontalScroll(page: Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
}

test("phone layout keeps the header usable @mobile", async ({ page }) => {
  for (const path of ["/", "/ask", "/practice", "/flashcards"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Preview" })).toBeVisible({ timeout: 15_000 });
    await boxesDoNotOverlap(page);
    await noHorizontalScroll(page);
  }
});

test("phone Ask opens sources, shows delete, and explains a badge @mobile", async ({ page }) => {
  await page.goto("/ask");
  await page.getByRole("button", { name: "Sources" }).click();
  await expect(page.getByRole("dialog").getByText("Where this came from")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Chats" }).click();
  await expect(page.getByRole("button", { name: /Delete / }).first()).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /^What is Lenz's law\?/ }).click();

  await page.getByRole("button", { name: "Textbook source" }).first().click();
  await expect(page.getByText(sourceExplanation("textbook"))).toBeVisible();
});
