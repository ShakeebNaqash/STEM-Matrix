import { test as base, expect, type Page } from "@playwright/test";

async function waitForClient(page: Page) {
  await expect(page.getByRole("button", { name: "Checking…" })).toHaveCount(0, { timeout: 15_000 });
}

export const test = base.extend({
  page: async ({ page }, run) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = async (...args) => {
      const response = await goto(...args);
      await waitForClient(page);
      return response;
    };
    page.reload = async (...args) => {
      const response = await reload(...args);
      await waitForClient(page);
      return response;
    };
    await run(page);
  },
});

export { expect };
