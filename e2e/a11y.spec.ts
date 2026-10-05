import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { emailSignIn, onboard, uniqueEmail } from "./helpers";

/**
 * PRD acceptance: "all text meets WCAG AA contrast, including on pastels" and "every screen works
 * in light and dark mode and with reduced motion". axe-core on the main screens, both themes,
 * reduced motion on; serious/critical violations (incl. color-contrast) fail the test.
 */
async function scan(page: Page, label: string) {
  await page.waitForTimeout(400); // let count-ups/animations settle
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} [${(n.any[0]?.message ?? "").replace(/\s+/g, " ").slice(0, 140)}]`).join(" | ")}`);
  // Soft: one run reports every screen's problems, then fails at the end.
  expect.soft(report, `${label}\n${report.join("\n")}`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`axe: main screens, ${scheme}, reduced motion`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await scan(page, "landing");
    await page.goto("/signup");
    await scan(page, "signup");

    await emailSignIn(page, uniqueEmail(`a11y-${scheme}`));
    await onboard(page, "Ally", "98765 44444");
    await scan(page, "groups (empty)");

    await page.getByRole("button", { name: /new group/i }).click();
    await scan(page, "create group sheet");
    await page.getByPlaceholder("Goa trip").fill("Contrast check");
    await page.getByRole("button", { name: /create group/i }).click();
    await expect(page).toHaveURL(/\/g\/[0-9a-f-]{36}/);
    await scan(page, "group (empty)");

    // An expense, its detail sheet, and the tabs.
    await expect(async () => {
      const input = page.getByRole("textbox", { name: /describe the expense/i });
      if (!(await input.isVisible())) await page.keyboard.press("Control+k");
      await expect(input).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await scan(page, "command bar");
    await page.getByRole("textbox", { name: /describe the expense/i }).fill("dinner 900");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Dinner").first()).toBeVisible();
    await scan(page, "group with an expense");
    await page.getByText("Dinner").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, "expense detail");
    await page.keyboard.press("Escape");
    for (const tab of ["Balances", "Graph", "Activity"]) {
      await page.getByRole("tab", { name: tab }).click();
      await scan(page, `${tab} tab`);
    }
    await page.goto("/activity");
    await scan(page, "activity");
    await page.goto("/me");
    await scan(page, "profile");
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
