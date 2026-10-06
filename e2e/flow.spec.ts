import { expect, test, type Browser, type Page } from "@playwright/test";
import { db, dbPatch, emailSignIn, onboard, uniqueEmail } from "./helpers";

/** Reload and wait until the service worker controls the page and the group has rendered. */
async function settle(page: Page, text: RegExp | string) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(1500); // let the profile/groups queries land in the cache
}

type Row = Record<string, unknown>;

async function newUser(browser: Browser, name: string, phone: string, startAt = "/signup") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(startAt);
  if (startAt !== "/signup") await page.getByRole("link", { name: /join with a free account/i }).click();
  await emailSignIn(page, uniqueEmail(name.toLowerCase()));
  await onboard(page, name, phone);
  return { context, page };
}

async function quickAdd(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: /describe the expense/i });
  // Cmd/Ctrl+K works once the app has loaded the profile; retry until the bar opens.
  await expect(async () => {
    if (!(await input.isVisible())) await page.keyboard.press("Control+k");
    await expect(input).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toBeHidden();
}

test("create group → invite → join → add expense → settle → confirm", async ({ browser }) => {
  // Alice signs up and creates a group.
  const alice = await newUser(browser, "Alice", "98765 43210");
  await expect(alice.page).toHaveURL(/\/groups/);
  await alice.page.getByRole("button", { name: /new group/i }).click();
  await alice.page.getByPlaceholder("Goa trip").fill("E2E Goa");
  await alice.page.getByRole("button", { name: /create group/i }).click();
  await expect(alice.page).toHaveURL(/\/g\/[0-9a-f-]{36}/);
  const groupId = alice.page.url().split("/g/")[1].split(/[?#]/)[0];

  // The group's invite link (the same token the Invite sheet shares).
  const [invite] = await db<Row[]>(`invites?group_id=eq.${groupId}&ghost_member_id=is.null&revoked_at=is.null&select=token`);
  expect(invite?.token).toBeTruthy();

  // Bob opens it signed out, signs up, comes back and joins.
  const bob = await newUser(browser, "Bob", "91234 56789", `/join/${invite.token}`);
  await expect(bob.page).toHaveURL(new RegExp(`/join/${invite.token}`));
  await bob.page.getByRole("button", { name: /^join group$/i }).click();
  await expect(bob.page).toHaveURL(new RegExp(`/g/${groupId}`));
  const members = await db<Row[]>(`group_members?group_id=eq.${groupId}&left_at=is.null&select=id,display_name,user_id`);
  expect(members.map((m) => m.display_name).sort()).toEqual(["Alice", "Bob"]);

  // Alice adds ₹900 split equally (command bar), Bob sees it live.
  await alice.page.reload();
  await quickAdd(alice.page, "dinner 900");
  await expect(alice.page.getByText("Dinner").first()).toBeVisible();
  await expect(bob.page.getByText("Dinner").first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await db<Row[]>(`expenses?group_id=eq.${groupId}&deleted_at=is.null&select=amount_base`)).map((r) => Number(r.amount_base))).toEqual([90000]);

  // Bob settles his ₹450 (cash).
  await bob.page.getByRole("button", { name: /^settle up$/i }).click();
  await bob.page.getByRole("button", { name: /you pay alice/i }).click();
  await bob.page.getByRole("button", { name: /^mark as paid$/i }).click();
  await expect(bob.page.getByText(/recorded\. alice can confirm/i)).toBeVisible();
  const [s1] = await db<Row[]>(`settlements?group_id=eq.${groupId}&select=id,status,amount_base`);
  expect(s1).toMatchObject({ status: "pending" });
  expect(Number(s1.amount_base)).toBe(45000);

  // Alice confirms it; everyone is square.
  await alice.page.reload();
  await alice.page.getByRole("button", { name: /^confirm$/i }).first().click();
  await expect.poll(async () => (await db<Row[]>(`settlements?id=eq.${s1.id}&select=status`))[0].status).toBe("confirmed");
  const balances = await db<Row[]>(`group_balances?group_id=eq.${groupId}&select=net`);
  expect(balances.map((b) => Number(b.net))).toEqual([0, 0]);

  await alice.context.close();
  await bob.context.close();
});

test("offline: 3 expenses queue, sync on reconnect, exactly 3 on the other device", async ({ browser }) => {
  const alice = await newUser(browser, "Alice", "98765 00001");
  await alice.page.getByRole("button", { name: /new group/i }).click();
  await alice.page.getByPlaceholder("Goa trip").fill("Offline trip");
  await alice.page.getByRole("button", { name: /create group/i }).click();
  await expect(alice.page).toHaveURL(/\/g\/[0-9a-f-]{36}/);
  const groupId = alice.page.url().split("/g/")[1].split(/[?#]/)[0];
  const [invite] = await db<Row[]>(`invites?group_id=eq.${groupId}&ghost_member_id=is.null&revoked_at=is.null&select=token`);
  const bob = await newUser(browser, "Bob", "91234 00002", `/join/${invite.token}`);
  await bob.page.getByRole("button", { name: /^join group$/i }).click();
  await expect(bob.page).toHaveURL(new RegExp(`/g/${groupId}`));

  // Alice (app open and loaded) goes offline and adds three expenses.
  await settle(alice.page, /offline trip/i);
  await alice.context.setOffline(true);
  for (const t of ["chai 60", "cab 300", "snacks 150"]) await quickAdd(alice.page, t);
  await expect(alice.page.getByText("Waiting to sync", { exact: true })).toHaveCount(3);
  await expect(alice.page.getByText(/offline · showing saved data/i)).toBeVisible();
  expect(await db<Row[]>(`expenses?group_id=eq.${groupId}&select=id`)).toHaveLength(0);

  // Back online: they sync in order; no duplicates.
  await alice.context.setOffline(false);
  await expect.poll(async () => (await db<Row[]>(`expenses?group_id=eq.${groupId}&deleted_at=is.null&select=title`)).length, { timeout: 30_000 }).toBe(3);
  await expect(alice.page.getByText("Waiting to sync", { exact: true })).toHaveCount(0, { timeout: 20_000 });
  const titles = (await db<Row[]>(`expenses?group_id=eq.${groupId}&select=title,client_id`)).map((r) => r.title).sort();
  expect(titles).toEqual(["Cab", "Chai", "Snacks"]);

  // The other device sees exactly 3.
  await bob.page.reload();
  for (const t of ["Chai", "Cab", "Snacks"]) await expect(bob.page.getByText(t, { exact: true })).toHaveCount(1);
  await alice.context.close();
  await bob.context.close();
});

test("a lost response is retried with the same client_id: no duplicate", async ({ browser }) => {
  const alice = await newUser(browser, "Alice", "98765 00003");
  await alice.page.getByRole("button", { name: /new group/i }).click();
  await alice.page.getByPlaceholder("Goa trip").fill("Flaky wifi");
  await alice.page.getByRole("button", { name: /create group/i }).click();
  await expect(alice.page).toHaveURL(/\/g\/[0-9a-f-]{36}/);
  const groupId = alice.page.url().split("/g/")[1].split(/[?#]/)[0];

  // The first create_expense reaches the server but the reply is lost.
  let dropped = false;
  await alice.page.route("**/rest/v1/rpc/create_expense", async (route) => {
    if (dropped) return route.continue();
    dropped = true;
    await route.fetch(); // the server saves it…
    await route.abort("connectionreset"); // …and the phone never hears back
  });
  await quickAdd(alice.page, "pizza 800");
  await expect.poll(async () => (await db<Row[]>(`expenses?group_id=eq.${groupId}&select=id`)).length, { timeout: 30_000 }).toBe(1);
  await expect(alice.page.getByText("Waiting to sync", { exact: true })).toHaveCount(0, { timeout: 45_000 });
  expect(await db<Row[]>(`expenses?group_id=eq.${groupId}&select=id`)).toHaveLength(1);
  await alice.context.close();
});

test("rejected after reconnect: kept in Couldn't sync with the reason, never dropped", async ({ browser }) => {
  const alice = await newUser(browser, "Alice", "98765 00004");
  await alice.page.getByRole("button", { name: /new group/i }).click();
  await alice.page.getByPlaceholder("Goa trip").fill("Archived later");
  await alice.page.getByRole("button", { name: /create group/i }).click();
  await expect(alice.page).toHaveURL(/\/g\/[0-9a-f-]{36}/);
  const groupId = alice.page.url().split("/g/")[1].split(/[?#]/)[0];
  await settle(alice.page, /archived later/i);

  await alice.context.setOffline(true);
  await quickAdd(alice.page, "taxi 250");
  // Meanwhile the group is archived on the server.
  await dbPatch(`groups?id=eq.${groupId}`, { archived_at: new Date().toISOString() });
  await alice.context.setOffline(false);

  await expect(alice.page.getByText(/couldn't sync 1 change/i)).toBeVisible({ timeout: 30_000 });
  await expect(alice.page.getByText(/this group is archived/i).first()).toBeVisible();
  await expect(alice.page.getByText("Couldn't sync", { exact: true })).toHaveCount(1); // badge on the card
  expect(await db<Row[]>(`expenses?group_id=eq.${groupId}&select=id`)).toHaveLength(0);
  // Still there after a reload (IndexedDB), until the user decides.
  await alice.page.reload();
  await expect(alice.page.getByText(/couldn't sync 1 change/i)).toBeVisible({ timeout: 20_000 });
  await alice.page.getByRole("button", { name: /^discard$/i }).click();
  await expect(alice.page.getByText(/couldn't sync/i)).toHaveCount(0);
  await alice.context.close();
});

test("opens offline from the service worker with saved data", async ({ browser }) => {
  const alice = await newUser(browser, "Alice", "98765 00005");
  await alice.page.getByRole("button", { name: /new group/i }).click();
  await alice.page.getByPlaceholder("Goa trip").fill("Saved trip");
  await alice.page.getByRole("button", { name: /create group/i }).click();
  await expect(alice.page).toHaveURL(/\/g\/[0-9a-f-]{36}/);
  await quickAdd(alice.page, "lunch 480");
  await expect(alice.page.getByText("Lunch").first()).toBeVisible();
  // Let the worker take control, then load the page once through it so it's saved.
  await settle(alice.page, "Lunch");

  await alice.context.setOffline(true);
  await alice.page.reload();
  await expect(alice.page.getByText(/offline · showing saved data/i)).toBeVisible();
  await expect(alice.page.getByText("Lunch").first()).toBeVisible();
  await expect(alice.page.getByText(/saved trip/i).first()).toBeVisible();
  // Added after an offline reload: the profile can't load, but the queued change still shows.
  await quickAdd(alice.page, "tea 50");
  await expect(alice.page.getByText("Waiting to sync", { exact: true })).toHaveCount(1);
  // A page never opened before gets the offline screen, not a browser error.
  await alice.page.goto("/activity").catch(() => undefined);
  await expect(alice.page.getByText(/offline/i).first()).toBeVisible();
  await alice.context.close();
});
