import { execSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser } from "@playwright/test";
// http_ece ships with web-push: the same encryption a real push service hands to the phone.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as { decrypt: (buf: Buffer, p: Record<string, unknown>) => Buffer };
import { db, emailSignIn, onboard, uniqueEmail } from "./helpers";

/**
 * Push, end to end on the local stack: activity insert → trigger → pg_net → /api/push/webhook →
 * web-push → a "push service" we run here (TLS, self-signed: the E2E server sets
 * NODE_TLS_REJECT_UNAUTHORIZED=0). We decrypt each message with the subscription's keys, exactly
 * like the phone would, and check who got what.
 */
type Row = Record<string, unknown>;
type Push = { device: string; title: string; body: string; url: string; tag?: string };

const PUSH_PORT = 3999;
const SECRET = "e2e-webhook-secret"; // playwright.config.ts gives the E2E server this one

function psql(sql: string) {
  execSync(`docker exec -i supabase_db_settld psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`, { input: sql });
}

function pushService() {
  const dir = mkdtempSync(join(tmpdir(), "settld-push-"));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=localhost -days 1 -keyout ${dir}/k.pem -out ${dir}/c.pem`, { stdio: "ignore" });
  const devices = new Map<string, { ecdh: ReturnType<typeof createECDH>; auth: Buffer }>();
  const got: Push[] = [];
  const server = createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const device = (req.url ?? "").slice(1).split("-")[0];
      const d = devices.get(device);
      if (d) {
        const plain = ece.decrypt(Buffer.concat(chunks), { version: "aes128gcm", privateKey: d.ecdh, authSecret: d.auth.toString("base64url") });
        got.push({ device, ...JSON.parse(plain.toString("utf8")) });
      }
      res.writeHead(201).end();
    });
  });
  server.listen(PUSH_PORT);
  return {
    got,
    close: () => server.close(),
    /** A subscription row like a phone would save. */
    device(name: string) {
      const ecdh = createECDH("prime256v1");
      ecdh.generateKeys();
      const auth = randomBytes(16);
      devices.set(name, { ecdh, auth });
      // Endpoints are unique in the table: one per run.
      return { endpoint: `https://localhost:${PUSH_PORT}/${name}-${randomBytes(6).toString("hex")}`, p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
    },
  };
}

async function newUser(browser: Browser, name: string, phone: string, startAt = "/signup") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(startAt);
  if (startAt !== "/signup") await page.getByRole("link", { name: /join with a free account/i }).click();
  await emailSignIn(page, uniqueEmail(name.toLowerCase()));
  await onboard(page, name, phone);
  return { context, page };
}

async function subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
  const res = await fetch(`${process.env.E2E_SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method: "POST",
    headers: { apikey: process.env.E2E_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.E2E_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, ...sub }),
  });
  expect(res.ok).toBe(true);
}

test("expense and nudge pushes reach the right phone with the right words", async ({ browser }) => {
  psql(`insert into private.app_settings (key, value) values
          ('push_webhook_url', 'http://host.docker.internal:3100/api/push/webhook'), ('push_webhook_secret', '${SECRET}')
        on conflict (key) do update set value = excluded.value;`);
  const ps = pushService();
  try {
    const aman = await newUser(browser, "Aman", "98765 10001");
    await aman.page.getByRole("button", { name: /new group/i }).click();
    await aman.page.getByPlaceholder("Goa trip").fill("Goa Trip");
    await aman.page.getByRole("button", { name: /create group/i }).click();
    await expect(aman.page).toHaveURL(/\/g\/[0-9a-f-]{36}/);
    const groupId = aman.page.url().split("/g/")[1].split(/[?#]/)[0];
    const [invite] = await db<Row[]>(`invites?group_id=eq.${groupId}&ghost_member_id=is.null&revoked_at=is.null&select=token`);
    const riya = await newUser(browser, "Riya", "98765 10002", `/join/${invite.token}`);
    await riya.page.getByRole("button", { name: /^join group$/i }).click();
    await expect(riya.page).toHaveURL(new RegExp(`/g/${groupId}`));

    const members = await db<Row[]>(`group_members?group_id=eq.${groupId}&select=id,user_id,display_name`);
    const uid = (n: string) => members.find((m) => m.display_name === n)!.user_id as string;
    await subscribe(uid("Riya"), ps.device("riya"));
    await subscribe(uid("Aman"), ps.device("aman"));

    // Aman adds ₹2,400 split equally: only Riya hears, and she owes ₹1,200.
    await aman.page.reload();
    const input = aman.page.getByRole("textbox", { name: /describe the expense/i });
    await expect(async () => {
      if (!(await input.isVisible())) await aman.page.keyboard.press("Control+k");
      await expect(input).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await input.fill("dinner 2400");
    await input.press("Enter");
    await expect.poll(() => ps.got.length, { timeout: 20_000 }).toBe(1);
    const [expense] = await db<Row[]>(`expenses?group_id=eq.${groupId}&select=id`);
    expect(ps.got[0]).toEqual({ device: "riya", title: "Settld · Goa Trip", body: "Aman added Dinner · ₹2,400 · you owe ₹1,200", url: `/g/${groupId}?open=expense%3A${expense.id}`, tag: `expense_created:${expense.id}` });

    // Aman nudges Riya from Balances: exactly one notification, to Riya only, even though both the
    // database webhook and the app's direct call try to send it. Tapping opens Balances.
    await aman.page.getByRole("tab", { name: "Balances" }).click();
    await aman.page.getByRole("button", { name: /^nudge$/i }).first().click();
    await expect(aman.page.getByText(/sent to their phone/i)).toBeVisible();
    await expect.poll(() => ps.got.length, { timeout: 20_000 }).toBe(2);
    await aman.page.waitForTimeout(4000); // give a duplicate time to show up
    const nudges = () => ps.got.filter((p) => p.tag?.startsWith("nudge_sent:"));
    expect(nudges()).toHaveLength(1);
    expect(nudges()[0]).toMatchObject({ device: "riya", title: "Settld · Goa Trip", url: `/g/${groupId}?tab=balances` });
    expect(nudges()[0].body).toContain("₹1,200");
    expect(ps.got.some((p) => p.device === "aman")).toBe(false); // never the person who acted

    // The button counts down (1-hour cooldown) instead of sending again.
    const again = aman.page.getByRole("button", { name: /nudge again in (60:00|59:[0-5]\d)/i }).first();
    await expect(again).toBeDisabled();
    const t1 = await again.textContent();
    await aman.page.waitForTimeout(2100);
    expect(await aman.page.getByRole("button", { name: /nudge again in/i }).first().textContent()).not.toBe(t1); // live, no reload

    // Webhook broken (as it may be in production) and Riya on "Only money stuff": the nudge still
    // arrives, through the app's direct call.
    psql(`delete from private.app_settings where key in ('push_webhook_url', 'push_webhook_secret');
          update public.nudges set sent_at = sent_at - interval '61 minutes' where group_id = '${groupId}';
          update public.group_members set notify_level = 'money' where group_id = '${groupId}' and display_name = 'Riya';`);
    await aman.page.reload();
    await aman.page.getByRole("tab", { name: "Balances" }).click();
    await aman.page.getByRole("button", { name: /^nudge$/i }).first().click();
    await expect.poll(() => nudges().length, { timeout: 20_000 }).toBe(2);
    expect(nudges()[1]).toMatchObject({ device: "riya", title: "Settld · Goa Trip" });
    expect(ps.got.some((p) => p.device === "aman")).toBe(false);

    // The tap: the notification's URL opens Balances.
    await riya.page.goto(nudges()[0].url);
    await expect(riya.page.getByRole("tab", { name: "Balances" })).toHaveAttribute("aria-selected", "true");

    await aman.context.close();
    await riya.context.close();
  } finally {
    ps.close();
    psql(`delete from private.app_settings where key in ('push_webhook_url', 'push_webhook_secret');`);
  }
});
