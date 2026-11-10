import { expect, test } from "./fixtures";
import { INTERRUPTED_ERROR, SESSION_STORAGE_KEY } from "@/lib/session-store";

const composer = "Ask about a concept, a formula, or a numerical problem";

test("a saved pending answer loads as interrupted", async ({ page }) => {
  await page.addInitScript(
    ({ key, error }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          activeId: "pending-chat",
          sessions: [
            {
              id: "pending-chat",
              title: "Half an answer",
              subject: null,
              bookId: null,
              updatedAt: 5,
              messages: [
                { id: "user", role: "user", text: "Still going", segments: [], attempts: [] },
                { id: "assistant", role: "assistant", text: "", mode: "problem", segments: [], attempts: [], pending: true },
              ],
            },
          ],
        }),
      );
      void error;
    },
    { key: SESSION_STORAGE_KEY, error: INTERRUPTED_ERROR },
  );
  await page.goto("/ask");
  await expect(page.getByText(INTERRUPTED_ERROR)).toBeVisible();
  await expect(page.getByPlaceholder(composer)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
});

test("malformed saved chats do not open the error page", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        activeId: "missing",
        sessions: [{ id: 3 }, { id: "kept", title: "Kept chat", messages: [{ bad: true }, { id: "m", role: "user", text: "Still here", segments: [], attempts: [] }] }],
      }),
    );
  }, SESSION_STORAGE_KEY);
  const response = await page.goto("/ask");
  expect(response?.ok()).toBe(true);
  await expect(page.getByText("Kept chat")).toBeVisible();
  await expect(page.getByText("Still here")).toBeVisible();
  await expect(page.getByText("Application error")).toHaveCount(0);
});

test("a feedback vote stays highlighted after reload", async ({ page }) => {
  await page.goto("/ask");
  await page.locator("aside").getByRole("button", { name: /^What is Lenz's law\?/ }).click();
  const helpful = page.getByRole("button", { name: "Helpful", exact: true });
  await helpful.click();
  await expect(helpful).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Helpful", exact: true })).toHaveAttribute("aria-pressed", "true");
});
