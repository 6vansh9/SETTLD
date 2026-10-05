import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { db, emailSignIn, onboard, uniqueEmail } from "./helpers";

type Row = Record<string, unknown>;

test("existing users without a phone or UPI ID are asked before the app; neither can be cleared", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signup");
  await emailSignIn(page, uniqueEmail("legacy"));
  await onboard(page, "Lee", "98765 20001");
  await expect(page).toHaveURL(/\/groups/);
  const [me] = await db<Row[]>(`profiles?name=eq.Lee&select=id&order=created_at.desc&limit=1`);

  // Turn Lee into someone who signed up before phone and UPI were required (bypassing the guards).
  execSync(`docker exec -i supabase_db_settld psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`, {
    input: `set session_replication_role = replica;
            delete from public.user_phones where user_id = '${me.id}';
            update public.profiles set upi_id = null, upi_opt_out = false where id = '${me.id}';`,
  });

  await page.reload();
  await expect(page.getByText("ADD YOUR", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(/number/i);
  await expect(page.getByRole("button", { name: /later|skip/i })).toHaveCount(0);
  await page.locator('input[type="tel"]').fill("98765 20002");
  await page.getByRole("button", { name: /save and continue/i }).click();

  await expect(page.getByRole("dialog")).toContainText(/upi id/i);
  await page.getByRole("textbox", { name: /upi id/i }).fill("not-a-upi");
  await page.getByRole("button", { name: /save and continue/i }).click();
  await expect(page.getByText(/name@bank/i)).toBeVisible();
  await page.getByRole("button", { name: /i don't use upi/i }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await db<Row[]>(`profiles?id=eq.${me.id}&select=upi_id,upi_opt_out`))[0]).toEqual({ upi_id: null, upi_opt_out: true });
  expect((await db<Row[]>(`user_phones?user_id=eq.${me.id}&select=phone`))[0].phone).toBe("+919876520002");

  // /me: add an ID, then it can't be emptied.
  await page.goto("/me");
  await page.getByRole("button", { name: /upi id/i }).click();
  await page.getByRole("textbox", { name: /upi id/i }).fill("lee@okaxis");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect.poll(async () => (await db<Row[]>(`profiles?id=eq.${me.id}&select=upi_id`))[0].upi_id).toBe("lee@okaxis");
  await page.getByRole("button", { name: /upi id/i }).click();
  await page.getByRole("textbox", { name: /upi id/i }).fill("");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/can be changed but not removed/i)).toBeVisible();
  await context.close();
});
