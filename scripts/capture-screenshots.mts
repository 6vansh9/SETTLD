/**
 * README screenshots + demo.gif from the LIVE site, signed in as the demo account.
 *
 *   npm run demo:seed && npm run demo:screenshots
 *   PW_CHROMIUM=/path/to/Chrome-or-Brave  (optional: use an installed browser)
 *   SITE=https://settld00.vercel.app      (default)
 *
 * iPhone 14 size (390×844 @3x), light mode (plus a dark home screen). Every shot waits until the
 * app is fully online and synced and FAILS if an offline/reconnecting/sync banner, a skeleton
 * loader or a toast is visible. offline.png is the one deliberate exception: it shows offline
 * mode, and that browser is closed while still offline, so its queued expense never syncs.
 * demo.gif records adding an expense with the command bar (this adds one "Dinner" to the demo).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import sharp from "sharp";
import { admin, DEMO_EMAIL, magicTokenHash } from "./seed-demo.mts";

const SITE = (process.env.SITE || "https://settld00.vercel.app").replace(
  /\/$/,
  "",
);
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
} as const;

/** ONLY=offline,gif (comma list of sections: light, dark, offline, hero, gif) re-runs part of it. */
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const want = (section: string) => !ONLY || ONLY.has(section);

const BAD_TEXT =
  /\b(offline|reconnecting|waiting to sync|couldn.t sync|new version)\b/i;

async function demoIds() {
  const { data: users } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const me = users?.users.find((u) => u.email === DEMO_EMAIL);
  if (!me) throw new Error("No demo account: run npm run demo:seed first.");
  const { data: rows } = await admin
    .from("group_members")
    .select("group_id, groups(name)")
    .eq("user_id", me.id);
  const byName = new Map(
    (rows ?? []).map((r) => [
      (r.groups as unknown as { name: string }).name,
      r.group_id as string,
    ]),
  );
  const goa = byName.get("Goa Trip");
  const flat = byName.get("Flat 4B");
  if (!goa || !flat)
    throw new Error("Demo groups missing: run npm run demo:seed.");
  const { data: room } = await admin
    .from("split_rooms")
    .select("code")
    .eq("group_id", goa)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!room)
    throw new Error(
      "No open Split Room (they expire after 12 h): run npm run demo:seed.",
    );
  return { goa, flat, room: room.code as string };
}

async function signedInContext(
  browser: Browser,
  scheme: "light" | "dark",
  extra: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    ...PHONE,
    colorScheme: scheme,
    reducedMotion: "reduce",
    ...extra,
  });
  ctx.setDefaultTimeout(45_000);
  await ctx.addInitScript((theme) => {
    try {
      localStorage.setItem("settld-theme", theme);
      localStorage.setItem("settld-push-asked", "1"); // no "turn on notifications" offer toast
      localStorage.setItem("settld-push-step-done", "1");
    } catch {
      /* ignore */
    }
  }, scheme);
  const page = await ctx.newPage();
  await page.goto(
    `${SITE}/auth/confirm?token_hash=${await magicTokenHash(DEMO_EMAIL)}&type=magiclink&next=/groups`,
    { waitUntil: "domcontentloaded", timeout: 60_000 },
  );
  await page.waitForURL(/\/groups/, { timeout: 30_000 });
  await page.close();
  return ctx;
}

/** Wait until online and settled; throw if a banner, skeleton or toast is still visible. */
async function settled(page: Page, label: string, allowOffline = false) {
  const problems = async () => {
    const found: string[] = [];
    if (!allowOffline) {
      const text = await page.locator("body").innerText();
      const m = BAD_TEXT.exec(text);
      if (m) found.push(`banner text "${m[0]}"`);
    }
    if (await page.locator('[aria-busy="true"]:visible').count())
      found.push("skeleton loader");
    // Offline, the "Reconnecting…" dot pulses on purpose; skeletons are still caught by aria-busy.
    if (!allowOffline && (await page.locator(".animate-pulse:visible").count()))
      found.push("pulsing placeholder");
    if (await page.locator('div.bg-ink[role="status"]:visible').count())
      found.push("toast");
    return found;
  };
  const deadline = Date.now() + 30_000;
  let last: string[] = [];
  while (Date.now() < deadline) {
    last = await problems();
    if (last.length === 0) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(900); // count-ups and images
  last = await problems();
  if (last.length) throw new Error(`${label}: not ready (${last.join(", ")})`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => !i.complete);
    await Promise.all(
      imgs.map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r)))),
    );
  });
}

async function shot(page: Page, name: string, allowOffline = false) {
  await settled(page, name, allowOffline);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
}

/** Scroll so `target` sits `offset` CSS px below the top of the screen. */
async function scrollTo(
  page: Page,
  target: ReturnType<Page["locator"]>,
  offset = 12,
) {
  await target.first().waitFor();
  const y = await target
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate(
    (top) => window.scrollTo({ top, behavior: "instant" as ScrollBehavior }),
    Math.max(0, y - 0),
  );
  await page.evaluate(
    (o) => window.scrollBy({ top: -o, behavior: "instant" as ScrollBehavior }),
    offset,
  );
  await page.waitForTimeout(300);
}

async function openCommandBar(page: Page) {
  const input = page.getByRole("textbox", { name: /describe the expense/i });
  for (let i = 0; i < 20 && !(await input.isVisible()); i++) {
    const quick = page
      .getByRole("button", { name: /quick add expense|add an expense/i })
      .first();
    if (await quick.isVisible()) await quick.click();
    else await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
  }
  await input.waitFor({ state: "visible" });
  return input;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ids = await demoIds();
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  );
  try {
    // ---- Light mode stills ---------------------------------------------------------------------
    if (want("light")) {
      const ctx = await signedInContext(browser, "light");
      const page = await ctx.newPage();

      await page.goto(`${SITE}/groups`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settled(page, "groups");
      await scrollTo(page, page.getByText("You owe", { exact: true }), 44); // totals + both group cards
      await shot(page, "groups");

      await page.goto(`${SITE}/g/${ids.goa}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await shot(page, "group-header"); // cover header (used in the hero)
      await scrollTo(page, page.getByRole("tablist"), 8); // the expense list
      await shot(page, "group");

      await page.getByRole("tab", { name: "Graph" }).click();
      await scrollTo(page, page.getByRole("tablist"), 8);
      await shot(page, "debt-graph");

      await page.goto(`${SITE}/g/${ids.goa}?tab=balances`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page
        .getByRole("button", { name: /nudge again in/i })
        .first()
        .waitFor({ timeout: 20_000 });
      await scrollTo(page, page.getByRole("tablist"), 8);
      await shot(page, "push-nudge");

      await page.goto(`${SITE}/g/${ids.goa}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settled(page, "command bar (before)");
      const input = await openCommandBar(page);
      await input.pressSequentially("dinner 2400 paid by aman", { delay: 30 });
      await page.waitForTimeout(600);
      await shot(page, "command-bar");
      await page.keyboard.press("Escape");

      await page.goto(`${SITE}/g/${ids.flat}?settle=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page
        .getByRole("button", { name: /you pay aman/i })
        .first()
        .click();
      await page
        .getByRole("link", { name: /pay via upi/i })
        .first()
        .waitFor();
      await shot(page, "settle-upi");

      await page.goto(`${SITE}/room/${ids.room}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page
        .getByText(/thalassa dinner/i)
        .first()
        .waitFor();
      await settled(page, "split-room");
      await scrollTo(page, page.getByText(/^in the room/i), 16); // people + the partly claimed items
      await shot(page, "split-room");
      await ctx.close();
    }

    // ---- Dark home --------------------------------------------------------------------------------
    if (want("dark")) {
      const dark = await signedInContext(browser, "dark");
      const dp = await dark.newPage();
      await dp.goto(`${SITE}/groups`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settled(dp, "groups-dark");
      await scrollTo(dp, dp.getByText("You owe", { exact: true }), 44);
      await shot(dp, "groups-dark");
      await dark.close();
    }

    // ---- Offline mode (deliberate; this browser never goes back online) ----------------------------
    if (want("offline")) {
      const off = await signedInContext(browser, "light");
      const op = await off.newPage();
      await op.goto(`${SITE}/g/${ids.goa}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settled(op, "offline (online first)");
      await op.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await op.reload();
      await settled(op, "offline (cached)");
      await op.waitForFunction(
        () => !!navigator.serviceWorker.controller,
        null,
        { timeout: 20_000 },
      );
      await off.setOffline(true);
      await op.reload();
      await op
        .getByText(/offline · showing saved data/i)
        .waitFor({ timeout: 20_000 });
      const oi = await openCommandBar(op);
      await oi.fill("chai 120");
      await oi.press("Enter");
      await op.getByText("Waiting to sync", { exact: true }).first().waitFor();
      await op.waitForTimeout(6500); // let the "saved on this phone" toast go
      await scrollTo(op, op.getByText("Members", { exact: true }), 64); // the queued expense, under the banner
      await shot(op, "offline", true);
      await off.close(); // closed while offline: the queued chai never reaches the server
    }

    // ---- Hero: three phones on the brand background ----------------------------------------------
    if (want("hero")) {
      const H = 900;
      const phoneH = 780;
      const phoneW = Math.round((phoneH * 390) / 844);
      const radius = 44;
      const mask = Buffer.from(
        `<svg width="${phoneW}" height="${phoneH}"><rect width="${phoneW}" height="${phoneH}" rx="${radius}" fill="#fff"/></svg>`,
      );
      const phone = async (name: string) =>
        sharp(join(OUT, `${name}.png`))
          .resize(phoneW, phoneH)
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer();
      const frame = Buffer.from(
        `<svg width="${phoneW + 16}" height="${phoneH + 16}"><rect width="${phoneW + 16}" height="${phoneH + 16}" rx="${radius + 8}" fill="#0E0E0E"/></svg>`,
      );
      const gap = 70;
      const left = Math.round((1600 - 3 * (phoneW + 16) - 2 * gap) / 2);
      const layers: sharp.OverlayOptions[] = [];
      for (const [i, name] of [
        "group-header",
        "group",
        "split-room",
      ].entries()) {
        const x = left + i * (phoneW + 16 + gap);
        const y = Math.round((H - phoneH - 16) / 2) + (i === 1 ? -14 : 14);
        layers.push(
          { input: frame, left: x, top: y },
          { input: await phone(name), left: x + 8, top: y + 8 },
        );
      }
      const bg = Buffer.from(
        `<svg width="1600" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7B5A3"/><stop offset="0.5" stop-color="#EE6A4B"/><stop offset="1" stop-color="#C9A7EB"/></linearGradient></defs><rect width="1600" height="${H}" fill="url(#g)"/></svg>`,
      );
      await sharp(bg)
        .composite(layers)
        .png({ compressionLevel: 9 })
        .toFile(join(OUT, "hero.png"));
      console.log("✓ hero.png");
    }

    // ---- demo.gif: add an expense with the command bar (animations on) ----------------------------
    if (want("gif")) {
      const vidDir = mkdtempSync(join(tmpdir(), "settld-demo-"));
      const rec = await signedInContext(browser, "light", {
        reducedMotion: "no-preference",
        deviceScaleFactor: 2,
        recordVideo: { dir: vidDir, size: { width: 390, height: 844 } },
      });
      const rp = await rec.newPage();
      const t0 = Date.now(); // this page's video starts now
      await rp.goto(`${SITE}/g/${ids.goa}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settled(rp, "demo (start)");
      const startAt = Math.max(0, (Date.now() - t0) / 1000 - 0.2); // skip loading: start once settled
      await rp.waitForTimeout(900);
      const ri = await openCommandBar(rp);
      await rp.waitForTimeout(400);
      await ri.pressSequentially("dinner 2400 paid by aman", { delay: 90 });
      await rp.waitForTimeout(1300);
      await ri.press("Enter");
      await rp.waitForTimeout(3200);
      await rec.close();
      // One video per page: the sign-in page's is older; use the newest (this page's).
      const webm = readdirSync(vidDir)
        .filter((f) => f.endsWith(".webm"))
        .map((f) => ({ f, t: statSync(join(vidDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0]?.f;
      if (!webm) throw new Error("No video recorded");
      const gif = join(OUT, "demo.gif");
      execFileSync("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-ss",
        startAt.toFixed(2),
        "-i",
        join(vidDir, webm),
        "-vf",
        "fps=15,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
        gif,
      ]);
      rmSync(vidDir, { recursive: true, force: true });
      console.log("✓ demo.gif");
    }
  } catch (e) {
    for (const ctx of browser.contexts())
      for (const p of ctx.pages())
        await p
          .screenshot({
            path: join(tmpdir(), `settld-capture-failed-${Date.now()}.png`),
          })
          .catch(() => undefined);
    console.error(
      `Failure screenshots saved in ${tmpdir()} (settld-capture-failed-*.png)`,
    );
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
