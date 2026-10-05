import { expect, type Page } from "@playwright/test";

const SB = () => process.env.E2E_SUPABASE_URL!;
const SERVICE = () => process.env.E2E_SERVICE_ROLE_KEY!;
const MAIL = () => process.env.E2E_MAILPIT_URL!;

/** Service-role REST read (test assertions only). */
export async function db<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${SB()}/rest/v1/${path}`, { headers: { apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** The 6-digit code from the newest Settld email to `email` (local Mailpit). */
export async function otpFor(email: string, after: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAIL()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages = [] } = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const fresh = messages.filter((m) => Date.parse(m.Created) >= after - 2000);
    if (fresh.length) {
      const msg = (await (await fetch(`${MAIL()}/api/v1/message/${fresh[0].ID}`)).json()) as { Text?: string; HTML?: string };
      const code = /\b(\d{6})\b/.exec(`${msg.Text ?? ""} ${msg.HTML ?? ""}`)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no code emailed to ${email}`);
}

/** Sign up / sign in through the real UI (email code), from whatever auth screen is showing. */
export async function emailSignIn(page: Page, email: string) {
  await page.getByRole("button", { name: /continue with email/i }).click();
  await page.getByPlaceholder("you@example.com").fill(email);
  const sentAt = Date.now();
  await page.getByRole("button", { name: /send magic link/i }).click();
  const code = await otpFor(email, sentAt);
  await page.getByPlaceholder("123456").fill(code);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

/** Walk onboarding (name → phone → color → UPI (required) → currency → notifications: not now → home guide). */
export async function onboard(page: Page, name: string, phone: string, upi: string | null = "e2e.user@okaxis") {
  await expect(page).toHaveURL(/\/onboarding/);
  const next = () => page.getByRole("button", { name: /^(next|finish|let's go)$/i }).click();
  await page.getByRole("textbox").first().fill(name);
  await next();
  await page.locator('input[type="tel"]').fill(phone);
  await next();
  await expect(page.getByText(/pick your/i)).toBeVisible();
  await next(); // color
  // UPI is required: an ID, or "I don't use UPI".
  await expect(page.getByRole("textbox", { name: /upi id/i })).toBeVisible();
  if (upi) {
    await page.getByRole("textbox", { name: /upi id/i }).fill(upi);
    await next();
  } else await page.getByRole("button", { name: /i don't use upi/i }).click();
  await expect(page.getByText(/default/i).first()).toBeVisible();
  await page.getByRole("button", { name: /^next$/i }).click(); // currency
  // Notifications (shown where the browser can push; asked only from a tap): not now.
  const notNow = page.getByRole("button", { name: /^not now$/i });
  const letsGo = page.getByRole("button", { name: /let's go/i });
  await expect(notNow.or(letsGo).first()).toBeVisible();
  if (await notNow.isVisible()) await notNow.click();
  // Last step: the Add to Home Screen guide (not shown when already installed).
  await letsGo.click();
  await expect(page).toHaveURL(/\/(groups|join|g)\b/);
}

export function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@settld.test`;
}

/** Service-role REST write (test setup only: simulate something changing on the server). */
export async function dbPatch(path: string, body: object): Promise<void> {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}`, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}
