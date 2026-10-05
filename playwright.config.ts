import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against the LOCAL Supabase stack (npx supabase start; supabase/config.toml uses
 * ports 563xx). Keys come from `supabase status` at run time, never from files.
 *   npx supabase start && npm run e2e
 * Browser: Chromium (set PW_CHROMIUM to use an installed Chrome/Brave instead of a download).
 */
function local() {
  const out = execSync("npx -y supabase@latest status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const s = JSON.parse(out.slice(out.indexOf("{")));
  return { url: s.API_URL as string, anon: s.ANON_KEY as string, service: s.SERVICE_ROLE_KEY as string, mail: (s.MAILPIT_URL ?? s.INBUCKET_URL) as string };
}
const sb = local();
process.env.E2E_SUPABASE_URL = sb.url;
process.env.E2E_SERVICE_ROLE_KEY = sb.service;
process.env.E2E_MAILPIT_URL = sb.mail;
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: sb.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anon,
      SUPABASE_SERVICE_ROLE_KEY: sb.service,
      BUILD_SHA: "e2e",
      // e2e/push.spec.ts: its own webhook secret, and a local "push service" with a self-signed cert.
      PUSH_WEBHOOK_SECRET: "e2e-webhook-secret",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
    },
  },
});
