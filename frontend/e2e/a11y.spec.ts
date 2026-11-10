import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

for (const path of ["/", "/ask", "/practice", "/flashcards"]) {
  test(`${path} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
