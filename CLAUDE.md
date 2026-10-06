# Settld — standing rules

- **PRD.md is the source of truth.** Follow its design system, data model, and stack exactly.
- **Ask before deciding.** If PRD.md doesn't cover a decision, ask the user before making it.
- **Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Supabase, Framer Motion, TanStack Query, deployed on Vercel.
- **Money is integer minor units** (paise/cents). Never use floats for money. Use helpers in `lib/money.ts`.
- **Every money amount in the UI uses the `<Amount />` component** (`components/ui/Amount.tsx`).
- **Mobile-first**, designed at 390px width, max content width 480px.
- **One milestone per session.** At the end, run `npm run lint`, `npm run typecheck`, `npm test`, then update the Progress section below with what was done and what's next.

## Conventions

- Colors come from CSS variables in `app/globals.css`, mapped in `tailwind.config.ts` (`bg-pink`, `text-ink`, `text-ink-faded`, `bg-coral`, …). Never hard-code hex values in components.
- Fonts: `font-display` (Anton), `font-display-alt` (Big Shoulders Display 800), `font-num` (Jersey 10, falls back to Inter per glyph for ₹/€/£), `font-sans` (Inter). Micro labels use the `.micro` class.
- Merge class names with `cn()` from `lib/cn.ts`.
- Motion: spring `{ stiffness: 400, damping: 30 }` (`lib/motion.ts`). Always honour `useReducedMotion()` by swapping springs for fades. Never put `layoutId`/`layout` inside something that animates out (sheets, `AnimatePresence` children): it can block the exit forever.
- Privacy blur: wrap the app in `PrivacyProvider`; `<Amount />` reads it automatically.
- Theme: `ThemeProvider` + `ThemeToggle` (light/dark/system, persisted in `localStorage` key `settld-theme`). An inline script in `app/layout.tsx` applies the class before paint.

## Progress

### Milestone 1 — Foundation ✅ (2026-10-04)

- Next.js 14.2 App Router + TS strict (target ES2020 for bigint), Tailwind 3, ESLint, Vitest 2. Scripts: `dev`, `build`, `lint`, `typecheck`, `test`.
- Deps: `@supabase/supabase-js`, `@supabase/ssr`, `framer-motion@11` (v12 needs React 19), `@tanstack/react-query`, `clsx`, `tailwind-merge`, `lucide-react`.
- `lib/supabase/client.ts` + `server.ts` (@supabase/ssr), `.env.local.example`. No tables or middleware yet.
- PRD folder structure created (`.gitkeep` placeholders; `lib/simplify|parser|fx|upi.ts` are stubs).
- Tokens in `app/globals.css` (light, `.dark`, and `prefers-color-scheme` fallback), mapped in `tailwind.config.ts`. Fonts via `next/font/google` in `app/layout.tsx`.
- Providers (`app/providers.tsx`): TanStack Query, ThemeProvider, PrivacyProvider, `MotionConfig reducedMotion="user"`.
- UI kit in `components/ui/`: Amount, Title, Card/CardStack, SplitBar, Avatar/AvatarStack, Sheet, Numpad, Button, ThemeToggle, PrivacyToggle (barrel: `components/ui/index.ts`).
- `lib/money.ts`: currencies, `toMinor` (string-based, rejects >2 decimals), `fromMinor` (returns string), `formatParts`/`formatAmount`, `groupDigits` (Indian/Western), `splitEqual` (number or bigint), `percentages` (display only).
- Tests: `lib/money.test.ts`, `components/ui/Numpad.test.ts` (28 passing).
- `/kit` shows everything; `/` temporarily redirects to `/kit` until the landing page exists.

**Notes for later:** Jersey 10 has no ₹/€ glyphs; `font-num` falls back to Inter per glyph (PRD open question — revisit if it looks off). The Sheet drags from anywhere on the panel; may need a drag handle once sheets contain scrollable forms.

### Milestone 2 — Auth and profiles ✅ (2026-10-04, same session as M1 at the user's request)

- Supabase project ref `yakriuhszfacgfrssdwo` (in a different Supabase account than the Claude connector, so migrations are run by the user in the SQL Editor).
- `supabase/migrations/0001_profiles.sql`: `profiles` table + RLS (read/update own row only), `handle_new_user` trigger (name prefilled from Google / email), `updated_at` trigger. **Decision (user-approved):** extra column `onboarded_at` marks onboarding complete.
- `lib/supabase/types.ts` (hand-written `Database` type), typed clients, `lib/supabase/middleware.ts` + root `middleware.ts` (session refresh; signed-out users on protected routes → `/login?next=`).
- `lib/auth.ts` (`getUserAndProfile`, `requireOnboarded`), `lib/auth-redirect.ts` (onboarding-first redirect), `lib/redirect.ts` (`safeNext`: invite links survive sign-in, open redirects blocked), `lib/upi.ts` (UPI ID validation, matches the DB check).
- Routes: `/` landing (SPLIT / IT / SETTLD, fanned cards, auth), `/login` (with "sign in to join" copy for `/join/` next), `/auth/callback` (OAuth + PKCE magic link), `/auth/confirm` (token_hash magic link, works across browsers), `/onboarding` (name → color → UPI → currency → animated Add to Home Screen guide; skipped when standalone), `/me` (name, color, UPI, currency, blur default, theme, sign out), `/groups` placeholder with NOTHING / YET empty state.
- `lib/queries/profile.ts`: TanStack `useProfile` / optimistic `useUpdateProfile`. `ProfileSync` applies `privacy_blur` once on app open.
- New UI: `Switch` (in kit). Feature components in `components/features/{auth,onboarding,profile}`.
- Tests: 34 passing (added `lib/redirect.test.ts`, `lib/upi.test.ts`).

**Notes for later:** `profiles` select policy must be widened in M3 to co-members (via `is_member`). Regenerate `types.ts` with the Supabase CLI once linked. `/groups` is a placeholder.

### Milestone 3 — Groups and invites ✅ (2026-10-04)

- `supabase/migrations/0002_groups.sql`: `groups`, `group_members` (ghosts: `user_id` null + `is_ghost`, check keeps them in sync; unique per user per group), `invites` (one live group link per group, one live claim link per ghost). RLS: select-only via `is_member()` / `is_admin()`; claim links admin-only; profiles readable by co-members via `shares_group()` (replaces the M2 own-row policy). No direct insert/update/delete on any of these: all writes are RPCs.
- RPCs (security definer, `search_path = ''`, PUBLIC/anon execute revoked): `create_group`, `preview_invite` (anon OK; name/emoji/color/member_count only), `invite_details` (signed-in: member redirect, unclaimed ghosts, personal claim), `join_group` (idempotent; personal links auto-claim), `claim_ghost(token, member_id)`, `regenerate_invite`, `ghost_claim_link`, `add_ghost`, `remove_member` (blocks self), `update_group` (name/emoji/color), `set_group_archived`. Archived groups are read-only and their links stop previewing/joining. Trigger keeps member `display_name` in sync with profile renames.
- **Deviation from the M3 brief:** `claim_ghost` takes the invite token as well as `member_id`; the token proves the caller was invited (they aren't a member yet). Discuss if this should change.
- Verified with a PGlite harness (stubbed `auth` schema, roles, default grants): 59 checks covering RLS isolation, anon access, ghost claim, personal links, regeneration, archive, admin-only paths. The harness lives outside the repo; re-create it if migrations need re-testing.
- Data: `lib/groups-data.ts` (fetchers for server and client, `GroupWithMembers`), `lib/queries/groups.ts` (TanStack hooks + RPC mutations), `lib/groups.ts` (pure helpers, tested), `lib/share.ts` (Web Share → copy fallback), `PASTEL_HEX` in `lib/pastels.ts`.
- UI: `/groups` (stack of GroupCards, overall ₹0 until M4, archived section, empty state, CreateGroupSheet with live preview), `/g/[id]` (pastel header, members strip, tabs as placeholders, disabled SETTLE UP footer, Invite/Members/Settings sheets), `/join/[token]` (preview card, sign-in-to-join, Join, "That's me" ghosts, personal-link claim, expired state, OG + per-group theme-color).
- `CardStack` now passes overlap via context so wrapped cards (Links) stack correctly. `Sheet` focuses the dialog, not its first button.
- Tests: 45 passing (`lib/groups.test.ts` added).

**Notes for later:** `group_members.user_id` cascades on account deletion; revisit once expenses reference members (M4). Remove-member balance check comes in M4. Group cards and the overall total show ₹0 until balances exist. OG image comes in M7.

### Fix — missing profile rows (2026-10-04)

- `getUserAndProfile()` (`lib/auth.ts`) now creates a missing profile on the fly: upsert by id with `ignoreDuplicates` (INSERT … ON CONFLICT DO NOTHING), name from `lib/profile-defaults.ts` (mirrors SQL `default_profile_name`). Logs and returns `profile: null` only if the insert fails; `/onboarding` then shows a "try again" screen instead of throwing.
- `0001_profiles.sql` is now idempotent (if-not-exists / drop-if-exists / create-or-replace) and ends with a backfill for existing `auth.users`. New policy **"Users can create their own profile"** (insert, `id = auth.uid()`) so the app-side upsert passes RLS. Re-running 0001 after 0002 does not re-add the own-row read policy. Verified in PGlite (15 checks + the 59-check 0002 suite).

### Fix — onboarding stuck / skipped steps (2026-10-04)

- **Root causes:** (1) step transitions used `AnimatePresence mode="wait"`, and the color picker's `layoutId` ring could stop the outgoing step's exit from ever finishing: state advanced, screen stayed put. The same thing kept bottom sheets open after picking a color. (2) Nothing was saved until step 4 and the step lived only in memory, so any reload restarted at the name step. (3) `onboarded_at` was written at step 4, so a reload on the Home Screen guide bounced to `/groups`. (4) Saves read the user id from the query cache, which could hold a stale `null` profile.
- **Fixes:** each step saves only its own field, then advances (`lib/onboarding.ts`, tested). `?step=` in the URL (updated with `history.replaceState`) resumes after reload; no saved name ⇒ always start at step 1. `onboarded_at` is written only by the final step ("Let's go" / "I'll do it later", or after currency when installed). Saves use `auth.getUser()`. `normalizeProfile()` (`lib/profile-defaults.ts`) sanitises every profile read (server and client) so backfilled nulls fall back to defaults.
- **Convention:** don't use `layoutId` / `layout` inside anything that animates out (sheets, `AnimatePresence` children). Use per-item `animate` instead. Step transitions are enter-only.
- Verified with a headless-browser run against mocked Supabase: 19 checks (5 single-field saves, `onboarded_at` only at the end, reload resume) + 4 sheet-close checks. Tests: 60 passing.

### Fix — UPI save returns 400 (2026-10-04)

- **Root cause:** the `profiles.upi_id` check used `{2,256}`. Postgres regexes cap repeat counts at 255 and compile check regexes lazily, so the table created fine but every non-null `upi_id` raised `2201B invalid repetition count(s)` → PostgREST 400. Null (Skip) passed. Missed earlier because no SQL test saved a UPI ID.
- **Fix:** `UPI_ID_PATTERN` in `lib/upi.ts` is the single source of truth (`{2,255}`), used by the client check and verbatim by the SQL (`lib/upi.test.ts` fails on drift or on any repeat count > 255). `normalizeUpiId` → trimmed or null, never `""`. DB trigger `profiles_normalize_upi` stores blank as null for any writer.
- **`0003_fix_profiles_upi.sql`** (idempotent patch for existing DBs): adds any missing profile columns, drops old checks on those columns by definition (any name), cleans invalid data, re-adds the 4 named checks, adds the trigger, reloads the PostgREST schema. `0001` updated to match for fresh installs.
- Verified in PGlite: 424-input JS↔Postgres parity, patch on old/partial tables run twice (23 checks); prior suites still pass (59 + 15). Tests: 65 passing.
- **Convention:** any regex shared with Postgres lives as a string constant with a parity test; keep repeat counts ≤ 255.

### Milestone 4 — Money core ✅ (2026-10-04)

- **Logic first (tested):** `lib/money.ts` gained `splitByWeights` (BigInt maths, leftovers to the first weighted members), `computeSplits` for equal/exact/percent (basis points, 100% = 10000)/shares (integers), `parsePercent`/`parseShares`, `validatePayers`/`payersRemaining`. `lib/simplify.ts`: `computeBalances`, `simplifyDebts` (greedy largest creditor ↔ largest debtor, ≤ n − 1), `pairwiseDebts` (exact, no rounding: own payment covers own share first, then stable matching), `applyTransfers`. Property test: 1,000+ random expenses (all split types, 1–3 payers, 2–12 people, ₹0.01 to ₹90bn) → splits sum, balances sum to 0, both plans settle exactly, simplify ≤ n − 1. Checked with 5 extra seeds.
- **Form logic (tested):** `lib/expense-form.ts` (draft, live left-to-assign, RPC args, edit prefill round-trip), `lib/balances.ts` (your net per group, per-currency overall totals, your position on an expense), `lib/categories.ts`.
- **`supabase/migrations/0004_expenses.sql`** (named 0004 because 0003 was taken by the UPI fix): `expenses` (client_id unique, deleted_at), `expense_payers`, `expense_splits`, `activity`; `group_balances` view (`security_invoker`, paid − owed, settlement columns stubbed at 0 for M5); `group_members.left_at`. RPCs `create_expense` (idempotent by client_id), `update_expense`, `delete_expense` (soft), `restore_expense`, `set_group_simplify`; all validate sums/members server-side, reject archived groups, check creator-or-admin, and log activity. `remove_member` now requires a zero balance and marks the member left. `is_member`/`is_admin`/invites/ghost functions updated so left members lose access, aren't claimable, and can rejoin (same row reactivated). Verified in PGlite: 67 checks + earlier suites (59/15/23).
- **Decisions (user-approved):** Home overall total is per currency until FX (M5): big number in your default currency, a line per other currency. Expenses involving a member who has left are **locked** (edit/delete/restore refused) so the departed member's balance stays 0.
- **Other choices made:** percentages up to 2 decimals; shares are whole numbers (0 = excluded); multi-payer raw debts match people who still owe against payer credit in a stable order. The group header bar shows **who's paid** (paid per member) with your net above it. Owe/owed colors are not used on pastel backgrounds (they fail WCAG contrast); labels carry the meaning there.
- **UI:** `components/features/expense/` (ExpenseEditor: full-screen numpad → details sheet; ExpenseList; ExpenseDetailSheet with `expensePermissions`; BalancesTab), `components/ui/Toast` (10 s Undo with countdown), Simplify switch in group settings, real numbers on Home cards, the overall total and the group header. Sheets now drag-to-dismiss from the handle only (scrolling long forms no longer drags the sheet). Toast portals after mount (a server/client mismatch broke hydration).
- Verified in a headless browser with mocked Supabase: 15 checks on the RPC payloads (paise integers, exact sums, leftover paise, departed member excluded, multiple payers + shares, edit keeps type/payers, delete → Undo → restore). Tests: 107 passing.

**Notes for later:** `group_balances` settlement columns are placeholders for M5. Optimistic create/update and realtime come in M6 (delete is already optimistic). The Graph and Activity tabs are still placeholders (activity rows are already being written).

### Milestone 5 — Settle up and currencies ✅ (2026-10-04)

**Decisions (user-approved):** settlements always in the group's base currency; they count immediately; a disputed one stops counting until whoever recorded it edits or deletes it. UPI only for INR groups when the receiver has a UPI ID. **Either side can record** a settlement; when the receiver records it, it's confirmed immediately. Only whoever recorded it can edit, delete or restore it. Settlements touching a departed member are locked (same rule as expenses).

- **SQL, `supabase/migrations/0005_settlements_fx.sql`:**
  - settlements (client_id, status, soft delete) and fx_rates (service-role writes only)
  - group_balances counts settlements (sent adds, received subtracts, disputed and deleted excluded); remove_member uses it
  - RPCs: record, confirm, dispute, update, delete, restore settlement, each logging activity and rejecting archived groups
  - `create_expense`/`update_expense` take `p_currency` and `p_fx_rate` (string); the server computes amount_base = round(amount × rate), and lines must sum to it
  - PGlite: 59 checks pass, and the earlier suites still pass (test0004 now applies only migrations < 0005)
- **Logic (tested):**
  - `lib/money.ts`: BigInt FX maths (`parseRate`, `rateToString`, `convertMinor` rounding half up and refusing results beyond the exact integer range, `allocateToBase`)
  - `lib/upi.ts`: `buildUpiLink`, `canPayViaUpi`
  - `lib/fx-cache.ts`, `lib/fx.ts`: Frankfurter at `api.frankfurter.dev/v1`, server-only, a 6 h cache in fx_rates, falling back to the latest cached rate
  - `lib/settle.ts`: plan, my transfers, `clearsDebt`
  - `lib/balances.ts`: `convertedTotal`
  - `lib/simplify.ts`: computes balances and pairwise debts with settlements
  - `lib/expense-form.ts`: currency and rate; lines typed in the expense currency, stored in base
  - Property test extended to random currencies, rates and settlements, including disputed ones
- **Server:** `app/api/fx/route.ts` (signed-in users only). `lib/supabase/admin.ts` needs `SUPABASE_SERVICE_ROLE_KEY` in .env.local to cache rates; without it, rates are fetched live and not cached.
- **UI:**
  - `components/features/settle/`: SettleSheet (pick → amount, partial allowed → Pay via UPI as a real `upi://` link, `visibilitychange` → "Did it go through?" → record `upi`; or Mark as paid/received with cash/UPI/other → success poster as a receipt placeholder; confetti when `clearsDebt`); SettlementCard (dashed timeline card, Confirm/"Didn't get it" for the receiver); SettlementSheet (receiver actions; recorder edits the amount or deletes with Undo)
  - `ui/Confetti` (canvas, group colors, off under reduced motion, portals after mount)
  - ExpenseEditor: currency chips, rate via /api/fx, live "≈ ₹X", manual override ("Use today's" to revert)
  - Cards and detail show "$40 (₹3,852.80)"; your share is in base. The two lines that were mislabelled with the expense currency are fixed.
  - BalancesTab takes the plan from GroupScreen and enables Pay via UPI / Mark paid / Mark as received for rows I'm in
  - SETTLE UP footer is live
  - /groups converts every group into my default currency with server-fetched rates, labelled "≈ … · approx."
- **Behaviour change:** settlement mutations refresh data in the background instead of awaiting it, so success shows as soon as the payment is saved.
- Verified in a headless browser against mocked Supabase and /api/fx: 20 checks (timeline display, confirm, full UPI link + return prompt + record, confetti, partial cash payment, no UPI without an ID, USD expense + manual rate payload, converted Home total), no page errors. Tests: 150 passing.

**Notes for later:** the receipt card is a placeholder (M7, `@vercel/og`). Edit prefill for a foreign expense labels the stored rate "your rate". Some UPI apps (notably GPay) can refuse P2P payments opened from links; the flow then falls back to "No" → Mark as paid.


### Deploy + sign-in fixes (2026-10-04)

- **Hosting:** Vercel project `settld` (team "Vansh's projects"), production https://settld-omega.vercel.app, auto-deploys on push to `main`. Env vars set for Production/Preview/Development; `SUPABASE_SERVICE_ROLE_KEY` is a Sensitive secret. Run the CLI with `npx vercel` (the global npm install needs admin rights here).
- **Localhost redirect after Google sign-in:** caused by Supabase's **Site URL = http://localhost:3001** with the production callback not allowlisted (Supabase falls back to Site URL). Proven with a read-only probe (`/auth/v1/verify` with a bogus token returns the fallback). Fix is in the Supabase dashboard (URL Configuration). Code and Vercel env contain no localhost.
- **Auth return:** `lib/auth-return.ts` handles `/auth/callback` and `/auth/confirm`: PKCE `?code=`, template `?token_hash=`, and Supabase `?error=` params → clear messages (`lib/auth-flow.ts`, tested). Redirects use `requestOrigin()` (x-forwarded-host on Vercel, validated; tested). Failures are logged with a reason, never tokens. Middleware skips `/auth/*`.
- **Email code:** the email sheet accepts the 6-digit OTP (`verifyOtp`), which works in the home-screen app and when the link opens in another browser. It needs `{{ .Token }}` in the Supabase email templates.
- **Account switching:** Google uses `prompt: select_account`. `components/providers/AuthSync.tsx` clears the TanStack cache, app storage (theme kept) and privacy blur whenever the user changes, and hard-navigates when a known account is replaced or signed out. Sign-out uses `signOutAndReset` (`lib/session-reset.ts`). The server Supabase client fetches with `cache: "no-store"`.

### Homepage + separate sign-in / sign-up (2026-10-05, user request; changes PRD screen 1)

- `/` is a public homepage (hero, Get started → `/signup`, Sign in → `/login`, How it works, final CTA). Signed-in users are redirected to `/groups` or `/onboarding`.
- `/signup` and `/login` share `components/features/auth/AuthScreen.tsx` and keep `?next=` (invites) when linking to each other. Still passwordless (Google or email link/code). Email sign-in uses `shouldCreateUser: false`, so an unknown email gets "No Settld account uses that email yet" (Supabase `otp_disabled`) with a link to sign up. Google always creates or reuses.
- The Join screen's primary CTA is "Join with a free account" (`/signup`), plus "I already have an account" (`/login`).

### Milestone 6 — Realtime layer ✅ (2026-10-05)

- **`supabase/migrations/0006_realtime.sql`** (idempotent): adds expenses, expense_payers, expense_splits, settlements, activity and group_members to `supabase_realtime`. Realtime Authorization policies on `realtime.messages` let only current members join the **private** channel `group:<uuid>` (`realtime_group_id()` parses the topic). `take_ghost_slot` now logs `ghost_name`. PGlite: 21 checks (publication contents; RLS on every published table for member/non-member/anon; private channel join and send for member/non-member/anon/malformed; claim takes effect). Earlier suites pass.
- **Live sync** (`lib/realtime/useGroupRealtime.ts`):
  - **Channel:** private `group:<id>`, postgres_changes on expenses, settlements, group_members and activity (INSERT), filtered by `group_id`; unsubscribes on leave.
  - **Refetching:** events are batched (120 ms) into invalidations of the lists, and `group_balances` is always re-read (never rebuilt from events).
  - **Catching up:** refetches on reconnect, focus, visibility and `online`.
  - **Fallback:** if the private join is refused before ever joining, it falls back to a public data-only channel (RLS still filters rows) with presence off, so data sync never depends on presence authorization.
  - **Latency log:** opt-in via `localStorage.setItem("settld-debug-realtime","1")` (ms after commit).
  - **`/groups` and `/activity`:** `useMyActivityRealtime` subscribes to activity with `group_id=in.(…)`.
- **Optimistic UI** (`lib/queries/expenses.ts`, `lib/queries/settlements.ts`, `lib/optimistic.ts` tested):
  - **Instant updates:** create, edit, delete and restore expenses, plus record, confirm, dispute, edit, delete and restore settlements, update the list and a balance preview at once.
  - **Swap:** on success the temp row (`temp-<client_id>`) is replaced with the server row.
  - **Failure:** rollback plus a global toast "Couldn't … · Retry". Retry reuses the same client_id, so it's idempotent.
  - **Own echoes:** `lib/realtime/pending.ts` (tested) ignores realtime events for my own client_ids and row ids, during the write and for 5 s after.
  - **Lifecycle:** expense mutations live in the always-mounted `ExpenseEditor`, not in the form inside the sheet. The editor closes on submit.
- **Global toasts:** `components/providers/ToastProvider.tsx` (`useToast().show`).
- **Motion:** `ui/AnimatedAmount` counts balances up/down (header, Balances tab, Home total, group cards); it jumps under reduced motion.
- **Activity:** `lib/activity.ts` (sentences, tested; "You" for the viewer as actor *or* receiver), `lib/activity-data.ts`, Activity tab on `/g/[id]` (tap opens the item), `/activity` across groups with group color stripes, linked from the `/groups` header. Deep links: `/g/<id>?open=expense:<id>|settlement:<id>|members` and `?tab=activity`.
- **Presence pill** (`ui/PresencePill`, `features/activity/usePillQueue`, `lib/presence.ts` tested):
  - Presence `{member_id, typing, screen}` is throttled to 1/s and only sent after joining.
  - "Aman is adding an expense…" / "… is settling up…" shows while it lasts.
  - Others' activity is queued: one at a time, 3 s each, tap to open.
  - **Enter-only:** an AnimatePresence exit held the previous pill on screen.
- Verified in a headless browser with mocked Supabase: 21 checks (optimistic add before a 1.5 s server, balance preview, swap without duplicates, failure rollback + Retry with the same client_id, delete/undo, activity sentences + tap-to-open, pill queue timing + presence fallback), no page errors. Bugs found and fixed by it: receiver not shown as "You", the stuck pill exit, presence pushed before join. Tests: 183 passing. **Not verified here:** real cross-device realtime (needs 0006 applied and two accounts); see the test plan.

**Next: Milestone 7 — Headline features** (command bar, Debt Graph, receipt card renderer, then Split Room).

### UX fixes: Add Expense + Home (2026-10-05)

- **Multiple payers** (`lib/expense-form.ts`, tested): `payerTouched` tracks fields the user typed in, and only untouched fields ever auto-fill. With 2 people, typing one fills the other with total − typed (`setPayerAmount`/`autofillPayers`). With 3+, "₹X left to pay" plus a "Fill ₹X" chip on the next empty untouched field (`payerFillSuggestion`/`fillPayer`). Switching to Multiple prefills the original payer with the full amount (`switchPayerMode`); changing the total keeps the untouched field in step (`withAmount`). Saved multi-payer expenses are fully "touched".
- **Clarity:** "Paid by: Who actually paid the money." and "Split between: Who was this for? Each person's share of the cost." Live **RESULT** card (`expenseResult` = paid − share via `computeBalances`): 2 people in one sentence, 3+ one line per non-zero person, otherwise "Everyone's square".
- **Sheet layout:** `Sheet` now has a fixed top (handle, title, optional `header`), a scrolling body and an optional fixed `footer` outside the scroll area (pb includes the safe area). Height is capped at `min(92dvh, 100dvh − safe-area-top − 12px)`. The expense amount is the fixed header; RESULT, left-to-assign and Add expense are the footer (`form="expense-form"`). The editor owns validation and submit.
- **Home:** "You owe" and "You're owed" figures side by side (`oweOwedTotals`: each group converted separately, no netting across groups; unconverted currencies listed apart), a net line, "≈ … · approx." when converted. Group cards show a status chip (red/green fill with dark text, grey "Settled up"). Figures step down in size for long amounts.
- **Contrast:** new text-safe tokens `--owe-ink`/`--owed-ink` (light #C42B30/#157A41, dark = PRD colors) used for all red/green text including `<Amount sign>`; PRD `--owe`/`--owed` kept for fills. `lib/contrast.test.ts` reads globals.css and asserts WCAG AA (4.5:1) for text on bg/surface and chip text on fills, in light and dark.
- Note: after editing `tailwind.config.ts`, restart `next dev` (new color utilities weren't generated until then; builds are unaffected).
- Verified in a headless browser: 19 checks (auto-fill rules, RESULT text, layout measurements at 390×664, Home totals with USD conversion, label colors). Tests: 205 passing.

### Milestone 7a — Command bar, Debt Graph, share images ✅ (2026-10-05; Split Room is 7b)

- **Parser** (`lib/parser.ts`, pure, 86 tests): every PRD example plus amounts in ₹/$/€/£/A$/codes, decimals, `k`, "paid by", "split n", exact splits, "in <group>" (fuzzy), category keywords. Members match by first name, nickname, initials, prefix, me/I; initials and prefix matches are unioned, so "an" with Arjun Nair and Ankit is ambiguous and returns candidates. `parseCommand` never throws. `parsedToDraft` feeds the existing `evaluateDraft`/`toRpcArgs`, so the command bar saves through the same `create_expense` path (optimistic, client_id).
- **Command bar** (`components/features/command-bar/`): opens from the new bottom tab bar's **+**, a group's + button, and Cmd/Ctrl+K (onboarded users only). It has one field, a group chip (defaults to the current group, then the last group used, stored in localStorage `settld-last-group`), and a live preview card. Uncertain parts are underlined and open a picker; "split n" needs a tap to confirm who. Enter saves. Tab or "Full form" opens `ExpenseEditor` prefilled (`initialDraft`).
- **Bottom tab bar** (`components/features/nav/BottomTabBar.tsx`): Groups, Activity, +, You. Friends is left out until it has a screen.
- **Debt Graph** (Graph tab): `lib/debt-graph.ts` (tested) holds capNodes (max 12, the rest folded into "+N", me always kept), edgesFor (merge/net/remap), the deterministic d3-force layout (debtors left, creditors right, evenly spaced row slots with a slight zigzag, settled people in a row at the bottom), edgePath (curves; same-column edges bow outward within the canvas), and placeLabels (moves amount pills off circles, names and each other). Canvas height grows with raw-debt count. The component toggles Simplified/Every debt (morph about 800 ms; reduced motion uses a short crossfade). Tapping a node shows a mini card with Settle (opens SettleSheet prefilled with the transfer between you two) and Nudge (disabled until M8). It is live because it reads the same queries realtime updates. Arrowheads use `markerUnits="userSpaceOnUse"` so they don't scale with stroke width.
- **Images** (next/og, Node runtime): fonts are bundled in `assets/fonts` (Anton, Big Shoulders Display ExtraBold, Jersey 10, Inter SemiBold) and read from disk by `lib/og/fonts.ts`. They are traced into the functions through `outputFileTracingIncludes` in next.config.mjs, so there are no Google requests at runtime. Emoji use twemoji. Cards are in `lib/og/cards.tsx`.
  - `/api/og/invite/[token]`: a 1200×630 pastel poster built from `preview_invite` only (a generic card when the token is bad). `/join/[token]` metadata sets an absolute `og:image` (request origin) and `twitter:card=summary_large_image`.
  - `/api/og/receipt/[settlementId]?size=story|chat` (1080×1920 / 1200×630): it needs a session (401) and RLS limits it to group members (404 otherwise). It shows payer → receiver in Anton, the amount in Jersey 10 with faded symbol and decimals, the group and date as micro labels, and the SETTLD ✓ stamp. Cache-Control is private.
  - The settle success screen shows the real receipt image, with "Share to story" (1080×1920) and "Share" (1200×630) buttons. These use `lib/share-image.ts`: Web Share with a PNG File when `navigator.canShare({files})`, otherwise a download.
- Verified: OG PNGs render at the right sizes, fonts are present in the traced function files, the invite fallback returns 200 and the receipt returns 401 when signed out. Headless at 390px light and dark: graph in both views, tap card, command bar preview, ambiguity picker, the exact `create_expense` payload, and Tab to the full form. Tests: 302 passing.

### Milestone 7b — Split Room ✅ (2026-10-05)

**Decisions (user-approved):** every room belongs to a group. Opening a room link or scanning its QR without being in the group shows the group preview and "Join group & room"; `join_room` reuses `join_group` through the group's live invite link. Signed-out visitors sign in first (middleware) and come back. One payer, chosen at Finalize (defaults to the host).

**Choices made here (PRD silent; easy to change):**
- Tax, service and tip percentages are all taken on the item subtotal (not compounded), and each is spread over people in proportion to their item subtotal.
- Anyone can set their own custom shares; the host can set anyone's, ghosts included (that's how the host assigns ghosts).
- Finalized expenses use category Food, today's date, and exact splits; people whose total rounds to 0 are left out.

- **SQL, `supabase/migrations/0007_split_rooms.sql`** (idempotent):
  - **Tables:** `split_rooms` (charges as kind + value: basis points or minor units; status open/finalized/cancelled/expired; `expires_at` = created + 12 h; `paid_by`, `expense_id`), `split_room_items` (soft delete, position), `split_room_claims` (`shares` 0–99; 0 = un-claimed, never hard-deleted, so Realtime sees un-taps).
  - **Codes:** 6 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, drawn from `gen_random_uuid` bytes. A partial unique index keeps them unique among open rooms, and `create_room` marks rooms past their 12 hours expired so codes get reused.
  - **RLS:** select-only for members of the room's group; every write goes through RPCs.
  - **RPCs:**
    - `create_room` / `cancel_room`
    - `room_preview` (anon OK; ids only for members)
    - `join_room`
    - `upsert_items` (host; client ids; `p_items` null = charges/name only)
    - `toggle_claim(item, p_on)` (explicit on/off, so retries are safe)
    - `set_claim_shares` / `assign_claim`
    - `finalize_room`: host, refuses unclaimed or expired rooms, computes `room_totals`, calls `create_expense` (same validation), logs `room_finalized`, closes the room, all in one transaction; idempotent on retry
  - **Realtime:** the three tables are published. The `realtime.messages` policies now also authorize `room:<CODE>` for members of the room's group.
  - **Maths:** `room_allocate` (largest remainder) and `room_totals` mirror `lib/splitRoom.ts`.
- **PGlite** (63 checks):
  - codes and uniqueness, RLS and anon preview
  - host-only edits, claims and shares, ghost assignment
  - join by code adds the member, room channel authorization
  - finalize refusals, the expense, splits and activity; retry-safe finalize
  - expiry, cancel
  - 60 random rooms where the SQL splits equal the TS splits exactly
  - Earlier suites pass (test0006's publication list updated).
- **Maths (`lib/splitRoom.ts`, tested first):** `allocate` (largest remainder, BigInt), `chargeAmount`, `computeBill` (unclaimed items keep their own slice of each charge, so your share doesn't jump as others claim), `finalSplits`, `finalizeBlocker` ("2 items unclaimed"), and code/percent parsing. A property test runs 2,000 random rooms: totals sum to the bill, every item and charge allocates exactly, and splits sum to the expense.
- **Client:**
  - **Data and hooks:** `lib/split-room-data.ts` (fetch by code, open rooms, `withClaim`, `roomState`); `lib/queries/rooms.ts`.
    - Optimistic updates are synchronous; writes reach the server in tap order through a per-room queue. TanStack's mutation `scope` held back queued optimistic updates, which the headless run caught.
    - Realtime refetches wait while a write is in flight.
  - **Realtime:** `lib/realtime/useRoomRealtime.ts` uses the private `room:<CODE>` channel (postgres_changes on the room, its items and its claims, plus presence for "in the room") and falls back to a data-only channel. The group channel also watches `split_rooms` for the banner. Activity: `room_opened` (taps open the room), `room_finalized` (taps open the expense), `room_cancelled`.
- **UI** (`components/features/split-room/`, `app/room/[code]`):
  - **Group screen:** "New Split Room" button and a "Split Room open · Join" banner.
  - **Room screen:** pastel header with the name, the running total and its charges breakdown, a QR with the code, Copy link and Share, and "In the room" avatars (a dot means here now).
  - **Item cards:** tap toggles you; long-press (450 ms) opens custom shares; unclaimed cards glow (static under reduced motion).
  - **Sticky footer:** MY TOTAL plus a breakdown sheet. The host also gets Finalize, disabled with a reason; Finalize asks who paid.
  - **Host editor:** the Add button prevents focus moving on pointer-down, so the phone keyboard stays up between items. Tap an item to edit it; tax, service and tip can each be % or an amount.
  - **End states:** finalized shows the summary card on every phone (stamp, everyone's totals, "You owe X", Open the expense). Expired, closed, missing and not-member each get a clear screen.
- **Verified:**
  - **Headless at 390px** against a stateful fake server (24 checks):
    - building the 10-item bill: focus kept after each Add; 18% tax and 10% tip saved
    - taps: optimistic before the server answers; rapid on/off/on ends in sync
    - long-press: custom shares, ghost assigned by the host, a guest only gets their own stepper
    - others' claims arrive via refetch
    - finalizing with another payer: splits sum exactly; both phones show the summary
    - join screen and the expired screen
  - **Tests:** 320 passing.
- **Not verified here:** real Realtime across devices and the live migration (run `0007_split_rooms.sql` in the Supabase SQL Editor first).

### Photos: profile photos + group backgrounds ✅ (2026-10-05, user request; PRD updated)

- **Status before:** the feature didn't exist at all (no columns, buckets, storage code or upload UI), so it was built from scratch.
- **SQL, `supabase/migrations/0008_photos.sql`** (idempotent):
  - **Columns:** `profiles.avatar_url` and `groups.cover_url`. Check constraints only accept `…/storage/v1/object/public/<bucket>/<the row's own id>/<uuid>.(webp|jpg)`, so nothing can be hot-linked.
  - **Buckets:** `avatars` and `group-covers` (public, 2 MB, `image/webp` and `image/jpeg`).
  - **Storage RLS** on `storage.objects` (insert/select/update/delete): avatars only in your own folder; covers only for admins of the folder's group. Both go through `photo_folder(name)`.
  - **RPCs:** `set_group_cover(group, url)` (admins, writable groups). `preview_invite` now also returns `cover_url` (dropped and recreated, grants restored).
  - **Realtime:** `groups` and `profiles` added to the publication.
  - **PGlite:** 24 checks with a stubbed storage schema.
- **Images, `lib/images.ts` (tested):** pure crop maths (cropSize/clampCrop/panBy/zoomTo), `loadImage` (`<img>` decode, then createImageBitmap with EXIF orientation; a clear message for HEIC the browser can't decode), `renderCrop` (canvas, WebP 0.8 → JPEG fallback, steps quality down to stay under 2 MB), and `uploadWithProgress` (XHR to Storage; supabase-js has no progress events). `COVER_TINT = 0.74`: the test proves dark text is ≥ 4.5:1 for every pastel over a black and a white photo (sky needs 0.70).
- **UI:**
  - `components/features/photos/PhotoFlow.tsx` (`usePhotoFlow`): `accept="image/*"`, so iPhone offers Photos, Camera and Files and converts HEIC. Crop sheet: drag to move, zoom slider/buttons/wheel, round or 2:1 mask, then a progress bar.
  - `ProfilePhoto.tsx`: Add/Change/Remove, plus "Use my Google photo" for Google accounts. `/api/avatar/google` fetches the user's own googleusercontent picture server-side at 512 px, and the browser crops and uploads it to our bucket.
  - Replacing or removing a photo deletes the old file (`lib/photo-storage.ts`).
- **Where:**
  - **Photo controls:** on `/me`, tapping the avatar opens "Photo and color"; onboarding's avatar step has the same controls above the color picker.
  - **Avatar:** `Avatar` takes `photo` and shows it inside a 2 px ring of the person's pastel. It falls back to initials on load error, including errors before hydration, and ghosts never show one. `memberAvatar()` carries the photo, so every list, sheet, the Split Room, the activity feed, the presence pill (new avatar slot), the Debt Graph (SVG clipPath image) and Home's header avatar show it.
  - **Covers:** set in Group settings → Background (admins), with a live preview. `CoverBackdrop` puts the photo under the tint in the `/g/[id]` header and in a strip at the top of Home group cards. The invite OG image uses the tinted cover: Satori can't decode WebP, so `lib/og/cover.ts` converts it to JPEG with **sharp** (new dependency), fetching only from our bucket host.
  - **Live updates:** the group channel listens to `groups` (this group) and `profiles` updates; Home listens to `groups`/`profiles` updates.
- **Verified:** headless at 390px (11 checks): photo avatars, initials fallback on a broken photo, no photo for ghosts, a 4032×3024 photo → crop → upload of a 256×256 WebP to `avatars/<me>/<uuid>.webp` with my token and no upsert, 1200×600 WebP cover upload, progress bar, HEIC message, tinted card strip and header. The OG invite was rendered with a WebP cover over sky (the darkest pastel). Tests: 332 passing.
- **Not verified here:** real Supabase Storage uploads and policies (run 0008 first), iPhone HEIC/camera, and the Google photo copy.

### Cover redesign: real colors + scrim (2026-10-05, user request; PRD updated)

- **Problem:** the 74% pastel overlay turned cover photos into a muddy wash.
- **Now** (`lib/images.ts`, `CoverBackdrop`):
  - **Photo:** shown in its real colors with a 12% wash of the group color (`COVER_TINT`).
  - **Scrim:** a dark gradient (`headerScrim`) clear behind the nav, 0.3 at 56 px, `SCRIM_TITLE` 0.6 at 128 px (the title starts at 140 px), `SCRIM_TEXT` 0.75 from 200 px to the bottom, then a 36 px fade into the group's pastel. 0.75 rather than 0.7 because 60%-white labels over a pure white photo need about 0.72 for 4.5:1.
  - **Tests:** `lib/images.test.ts` checks white and 60%-white text, and the title, for every pastel over white, black, grey, sky and sand photos.
- **Header with a cover** (GroupScreen): `text-white`, `--amount-faded: 0.6`, and `pb-12` to make room for the pastel fade. Back and settings sit on `bg-black/35 backdrop-blur-md` circles; the Invite pill turns white. WHO'S PAID stays a solid card with normal fading.
  - `<Amount>` faded parts now read `opacity-[var(--amount-faded,0.35)]`.
  - Groups without a cover are unchanged.
- **Home cards:** the cover strip is taller (`pt-14`), with the avatars and date at its bottom in white over `stripScrim`, fading into the pastel.
- **Invite OG:** the same photo, wash and scrim (0.55 at the top, so "YOU'RE INVITED" is full white; 0.75 from 240 px), white wordmark and text, and a pastel fade at the bottom.
- **Verified:** screenshots at 390px of the live Goa photo plus white and black test images, light and dark, cards, and OG renders.

### Older iOS Safari + error screens (2026-10-05, user request)

- **Audit** (source and built chunks):
  - **Our code:** `crypto.randomUUID` (iOS 15.4+) is now `uuid()` from `lib/uuid.ts`, which falls back to `getRandomValues`. It was called during render in the Split Room finalize sheet. `Intl.Segmenter` (iOS 14.5+) gets a regex fallback in `isSingleEmoji`. `matchMedia().addEventListener` (iOS 14+) gets an `addListener` fallback in ThemeProvider.
  - **Libraries:** TanStack Query ships `??=` (a parse error before iOS 14), and @supabase/ssr calls `.at()`. `transpilePackages` (next.config.mjs) compiles TanStack, Supabase and framer-motion down to Next's default targets; built chunks now contain no logical assignment or class static blocks.
- **`lib/compat.ts` → `compatScript`** (plain ES5, `next/script` beforeInteractive in app/layout.tsx; inline in global-error):
  - Polyfills `Array/String.prototype.at`, `findLast`/`findLastIndex`, `Object.hasOwn` and `crypto.randomUUID`.
  - Reloads once when a stale `/_next/static` chunk fails (ChunkLoadError / dynamic import), with a 30 s guard in sessionStorage so it never loops (`lib/chunk-error.ts`).
- **Error screens:** `app/error.tsx` and `app/global-error.tsx` → `components/ErrorScreen.tsx` ("OOPS BROKE", the error, page, browser and time in a copyable box, Copy details / Reload / Try again / Go to my groups). Chunk errors show "Getting the latest version…" and reload once. **`/debug/crash`** (`?kind=chunk`) crashes on purpose so the screen can be checked from a phone.
- **SSR audit:** browser APIs (window/localStorage/navigator/document) are only used in effects, handlers or after `typeof` checks; storage access is wrapped in try/catch.
- **Tests:** `lib/compat.test.ts` runs the inline script in a stripped "old Safari" VM realm (polyfills, reload once, ignores other errors), checks it's ES5, covers `uuid()` without randomUUID and the emoji fallback against Segmenter. Headless against a production build: plain crash → error screen with details; ChunkLoadError → exactly 2 loads, then the screen.

### Covered cards: full-bleed photos (2026-10-05, user request; PRD updated)

- **Problem:** cards showed the cover as a thin dark strip.
- **Cards** (`GroupCard`, cover branch only; the no-cover markup is byte-identical to before photos):
  - **Layout:** a full-bleed photo inset 3px inside the card, so the pastel card background shows as a 3px ring; dog-ear kept. `min-h-[240px]` flex column; the next card in the stack covers 16px, so about 224px shows.
  - **Text:** white. The top row (avatars, date) gets `PHOTO_TEXT_SHADOW` / drop-shadow instead of a band. Status chips stay solid; "Settled up" turns solid white on photos (it was translucent: dark on dark).
  - **Scrim:** `<CoverScrim>` sits behind the name and members/chip only. It starts `SCRIM_RAMP_CARD` (20 px) above the title and reaches `SCRIM_TEXT` (0.6) exactly at the title.
- **Shared** (`lib/images.ts`): no pastel wash any more (COVER_TINT removed). `SCRIM_TEXT` 0.6 and `COVER_FADED` 0.85 (85%-white labels pass 4.69:1 over a pure white photo; the old 60% only reached 3.2). `textScrim()`; the scrim is anchored to the text block, not fixed pixel stops, so long names stay covered.
- **Header:** the photo shows clear behind the nav and emoji (emoji pushed down with `mt-16`). The scrim wraps from the title to the end of the header, 56 px ramp, then a 36 px fade into the pastel. Labels use `labelFade` (0.85 on covers).
- **Settings preview and invite OG:** same look. The OG has a clear top with a text shadow on the wordmark and label, a scrim from 190 to 270 px down, and a 6 px pastel frame.
- **Verified at 390px** with the live NIGHTOUT and goa photos, a bright beach scene and pure white, in light and dark: the title sits fully on the scrim on every card and header, clear photo covers 40–46% of the visible card and 132 px of the header, text is white on covers and dark without.
- **Known limit:** the white date and wordmark at the top rely on a shadow only, so they're faint on a near-white photo (not provably AA).

### Milestone 8 — Personality ✅ (2026-10-05)

**Decisions (user-approved in the brief):** push is sent from a Next.js route with `web-push` (not an Edge Function; PRD updated). Permission is requested only from a tap. On iPhone Safari outside the Home Screen we explain Add to Home Screen instead.

**Choices made here (PRD silent):**
- The Supabase "Database Webhook" is a trigger on `activity` that posts through `pg_net`, which is what dashboard webhooks use. The URL and secret live in `private.app_settings`, filled in from the git-ignored `supabase/.secrets/push-webhook.sql`, so the secret never enters git.
- The group settings gear is now shown to every member: everyone gets "Notifications from this group", and only admins see the rest.
- Nudge "days" = time since the oldest live expense I paid that they share, after their last payment to me.
- The first-expense offer is a toast with a "Turn on" button, shown once per device (localStorage `settld-push-asked`).
- A minimal manifest and generated icons (`/pwa-icon/[size]`, Anton "S" on coral) were added, because iPhone push needs a standalone Home Screen app. Offline caching is still M9.
- The VAPID subject is the site URL, not an email.

- **SQL, `0009_personality.sql`** (idempotent):
  - **Tables:**
    - `reactions`: one row per member per item; `emoji` null = removed, never hard-deleted (realtime-filterable).
    - `comments`: ≤ 280 characters, `client_id` for idempotent retries, soft delete by the author only.
    - `entity_seen`, `nudges`, `push_subscriptions`.
    - New columns: `group_members.notify_level` (all/money/off) and `groups.nudge_mode` (on/polite/off).
  - **RLS:** select-only for members (seen marks and push subscriptions: your own).
  - **RPCs:** toggle_reaction, add_comment (logs `comment_added`), delete_comment, mark_seen, set_notify_level, set_nudge_mode (admins), save/delete_push_subscription (an endpoint moves to whoever signs in on it).
  - **`send_nudge`:**
    - Refuses: ghosts, people who don't owe me, amounts above min(their debt, my credit), and groups with nudges off.
    - Limits: an advisory lock plus a 24 h check per pair; the error carries the UTC time of the next allowed nudge.
    - Level: 1 + nudges in the last 14 days, capped at 3; always 1 when the group is "polite only".
    - Logs `nudge_sent`, with the template index so the push and the banner say the same thing.
  - **Push trigger:** `notify_push_on_activity` only fires for the six push kinds and swallows network errors, so a push never rolls back a money write.
  - **Realtime:** reactions, comments and nudges added to the publication.
  - **PGlite:** 42 checks, including a `net.http_post` stub (payload, secret header, failures not blocking).
- **Logic (tested):**
  - `lib/nudges.ts`: 10 templates × 3 levels (the PRD example is level 3 #0), `nudgeText`, 24 h `nextNudgeAt`, `untilText`.
  - `lib/push-messages.ts`: recipients and text per kind; never the actor or anyone signed in as them; no ghosts or people who left; respects `notify_level`.
  - `lib/social.ts`: reaction summary, comment order, the unseen dot, optimistic helpers.
  - `lib/activity.ts`: "Aman commented on Dinner: “…”", "Aman nudged you".
- **Push:**
  - **Keys:** VAPID keys and `PUSH_WEBHOOK_SECRET` live in `.env.local` and on Vercel (the private key and secret as Sensitive in prod/preview). Never printed; `.env.local.example` documents the names.
  - **Server:** `app/api/push/webhook` (constant-time secret check, service-role reads, `web-push`, deletes 404/410 subscriptions, updates last_used_at); `app/api/push/test` ("Send a test" on /me).
  - **Service worker:** `public/sw.js` handles push and notificationclick only (it posts the URL to an open window, else opens one).
  - **Client:** `lib/push-client.ts`; `PushBridge` in providers registers the worker, re-saves an existing subscription and navigates on taps. `NotificationsCard` on /me (`#notifications`). `usePushPrompt` is called from `useCreateExpense` onSuccess.
- **UI:**
  - **Reactions and comments:** `components/features/social/GroupSocial.tsx` (context provider in GroupScreen): ReactionsRow, CommentThread (newest at the bottom, author avatar or photo, 280 counter, own-delete), NewDot on expense and payment cards, `useMarkOpenSeen` in both detail sheets.
  - **Nudges:** `NudgeButton` on Balances "they pay you" rows and the Debt Graph card, showing "Again in 19 h" during the cooldown; `useNudgeBanner` shows a toast with "Settle up" on the group screen and Home. `?settle=1` opens the settle sheet (nudge pushes link there).
  - **Settings:** group settings have segmented Notifications for everyone and Nudges On / Polite only / Off for admins.
  - **Privacy:** the eye is now in the `/g/[id]` header too. `ProfileSync` re-applies "blur on open" when the app returns after 10+ minutes in the background.
  - **Polish:**
    - `ui/EmptyState`: no groups, no expenses / ALL SQUARE / NO DEBTS / QUIET HERE (each with one CTA), activity ("QUIET SO FAR" → groups), comments ("NO COMMENTS" → Say something).
    - `ui/Skeleton`: `loading.tsx` for /groups, /activity, /me, /g/[id] and /room/[code] (pastel cards, no spinners).
    - Confetti now comes from GroupScreen when any member's net goes from non-zero to zero (once per change); the settle sheet no longer fires its own.
- **Verified:** headless at 390px against a mocked backend (19 checks):
  - dot → open → mark_seen → dot cleared
  - optimistic 💀 with the RPC payload
  - optimistic comment with a client_id
  - Nudge only on Aman's row (not the ghost), the RPC payload, the level-1 toast, "Again in 24 h"
  - settings segments and the RPC
  - eye blur and tap-to-peek
  - empty state with CTA
  - desktop "Turn on notifications" vs iPhone Safari Add to Home Screen steps
- **Webhook:** 401 without or with a wrong secret; the manifest, worker and icons serve. Tests: 354 passing.
- **Not verified here:** real pushes to devices, and the webhook end to end (needs 0009 and the secrets SQL run in Supabase).

### Phone numbers + phone-based ghost invites ✅ (2026-10-05, user request; PRD updated)

**Decisions (user-approved):** numbers are unverified, so they never grant access or claim a ghost; the personal claim link is the only proof. Numbers are private and live outside `profiles`.

**Choices made here:**
- **Auto-claim scope:** the automatic claim happens only for someone who just signed up or signed in from that personal link (the join screen's auth links carry `?auto=1`). Someone already signed in who opens a personal link keeps the one-tap "I'm Rahul, join", so a forwarded link can't silently move a signed-in person into a spot.
- **Ghost phone lifecycle:** the ghost's phone row is deleted when the spot is claimed; it was the inviter's note, not the new member's data.
- **Prefill:** `claim_link_phone` lets the holder of a live personal link (signed in, not yet in the group) read that ghost's number, for onboarding prefill only.
- **Unchanged from M3:** the group link's "Already added by name? Tap yours" ghost claim still exists.

- **SQL, `0010_phones.sql`** (idempotent):
  - **Tables:** `user_phones` (owner-only select), `ghost_phones` (`is_admin` select); no direct writes. `group_members.added_by`.
  - **RPCs:** `set_my_phone` (null removes), `add_ghost(group, name, phone default null)` (replaces the 2-argument version; records added_by), `set_ghost_phone` (admins, unclaimed ghosts), `claim_link_phone`. `valid_phone` checks E.164 shape.
  - **Claim + push:** `take_ghost_slot` now deletes the ghost's phone and logs `added_by` in `ghost_claimed`; `notify_push_on_activity` also sends `ghost_claimed`.
  - **PGlite:** 26 checks:
    - phone formats, and other members, outsiders and anon can't read numbers;
    - only admins add ghosts or read ghost numbers;
    - a user with the ghost's exact number gets no access and has no way to claim;
    - a brand-new user joins with the personal link → gets the spot, the Villa split and the -₹1,300 balance, the phone row is gone, activity carries added_by, the link can't be reused.
  - Earlier suites pass (0009: 42, 0007: 63).
- **Logic:**
  - `lib/phone.ts` (tested): `toE164` (country picker, own +code wins), `fromE164` (bare national digits), `formatPhone`, `countryOptions` (India first, flags, `Intl.DisplayNames`), `bestE164` for picked contacts, `ghostInviteText`, `whatsappInviteUrl`, `smsInviteUrl(ios)`.
  - `lib/contacts.ts`: Contact Picker on Android Chrome only.
  - **Activity:** `ghost_claimed` reads "Rahul joined" (plus "(saved as Zoya)" when the names differ).
  - **Push:** `push-messages` sends `ghost_claimed` to `added_by`, or to the admins for older ghosts: "Rahul joined Goa Trip".
- **UI:**
  - **Phone entry:** `PhoneField` (native country select under a flag + dial display), the onboarding "phone" step (required, step 2, prefilled from my saved number or the ghost's), `PhoneSheet` on /me (private row), and `PhonePrompt` on /groups (one time, "Later" stored as `settld-phone-later`).
  - **Members sheet:** Add someone gets name + optional phone, plus "Pick from contacts" only where supported. After saving, and from "Send invite" on each unclaimed ghost, `SendInvitePanel` offers WhatsApp, SMS, Copy message, and adding a number if there isn't one.
  - **Join:** join page auto-claim → `/g/<id>?welcome=1`. `WelcomeCard` shows once per group per device: who added you, spent so far, your balance, See the expenses.
- **Verified:** 17 headless checks at 390px:
  - onboarding: the required and invalid-number messages, saving +91 and US numbers in E.164, the prefill;
  - add someone + invite on iPhone: no contact picker, the add_ghost payload, the exact wa.me and iOS sms: links with the personal link, Zoya's saved number;
  - Android contact picker fills name + number;
  - the welcome card numbers and See the expenses;
  - the one-time prompt and Later.
- Tests: 364 passing.

### App icon from settld-icon-pixel.svg (2026-10-05, user request; PRD updated)

- **Source:** moved to `public/brand/settld-icon-pixel.svg`.
- **Generator:** `node scripts/build-icons.mjs` (sharp) writes `public/brand/` and `public/favicon.ico`. It fails loudly if the SVG's structure changes. Outputs:
  - `icon.svg`: the C2PA metadata is stripped.
  - `favicon.ico`: PNG-in-ICO at 16/32/48. The 16px version drops the tick stamp and the faded echo (both muddy at that size); 32 and 48 keep everything.
  - `apple-touch-icon.png` (180) and `icon-maskable-512.png`: full-bleed and flattened on coral (no rounded corners or transparency, so no black corners on iPhone). The maskable version scales the artwork 0.78× about the centre, which puts its farthest pixel 191 px from the centre, inside the 205 px safe zone (measured).
  - `icon-192/512.png`: the rounded original.
  - `badge-96.png`: white S on transparent, for Android notifications.
- **Wiring:**
  - `app/layout.tsx` metadata: icons (favicon.ico + icon.svg) and apple.
  - `app/manifest.ts`: theme `#EE6A4B`, background `#F4F1EC`; any + maskable icons.
  - `public/sw.js`: notification icon and badge.
- **Removed:** the old generated `/pwa-icon/[size]` route (and its font tracing).
- **Logo:** `ui/Logo` (icon + SETTLD wordmark) on the landing header and the auth screens.
- **Fixed:** the favicon 404.

### Milestone 9 — PWA polish (2026-10-05; code complete, v1 **not** marked done until the iPhone/friend checklist passes)

- **Service worker** (`app/sw.ts`, Serwist 9 → generated `public/sw.js`, gitignored; disabled in `next dev`):
  - Caches: precache, the app shell, fonts, icons, last-viewed group pages and RSC (NetworkFirst, 4 s), Supabase public photos (CacheFirst).
  - Never cached (NetworkOnly): `/auth/*`, `/api/*`, `/login`, `/signup`, `/onboarding`, `/join/*`, Supabase API calls.
  - `/~offline` fallback. Data caches are cleared on sign-out and account switch (`lib/sw-client.ts`). Push and notification-tap handlers live in the same worker.
- **Offline** (`lib/offline/`, `components/providers/AppShell.tsx`):
  - Reachability is probed against `/api/version`, because `navigator.onLine` lies. Banner: "Offline · showing saved data" / "N waiting to sync" / "N couldn't sync".
  - Add/edit/delete expense and record settlement queue in IndexedDB (idb-keyval), drawn over the server data (`overlay.ts`, tested) with a "Waiting to sync" badge.
  - Replay runs in order with the same client_id. A server rejection moves the item to "Couldn't sync" with the reason, plus Edit/Retry/Discard; nothing is dropped.
  - QueryClient mutations use `networkMode: "always"` (TanStack would otherwise pause them in memory).
- **Updates:** "New version of Settld · Reload" (waiting worker → SKIP_WAITING, or `/api/version` ≠ `NEXT_PUBLIC_BUILD_SHA`). ChunkLoadError reload kept.
- **iPhone:** 22 splash screens (light: artwork on coral; dark: coral tile on #0E0E0E), wired via `appleWebApp.startupImage` (`lib/splash.ts`, tested). Also: `overscroll-behavior: none`, 16px inputs, Add to Home Screen copy for newer iOS.
- **`0011_hardening.sql`:** 15 indexes on unindexed FKs. `supabase/checks/advisors.sql` mirrors the advisor checks. Only intended findings remain: `preview_invite` / `room_preview` are anon-callable.
- **E2E (Playwright, local Supabase):**
  - Setup: `npx supabase start` (config.toml ports 563xx; OTP email template), then `PW_CHROMIUM=<Chrome/Brave path> npm run e2e`.
  - Specs:
    - `flow.spec.ts`: create → invite → join → expense → settle → confirm; 3 offline expenses → exactly 3 elsewhere; lost response → no duplicate; rejected → Couldn't sync; offline open from the SW.
    - `push.spec.ts`: real web-push to a local TLS push service, decrypted.
    - `required.spec.ts`
    - `a11y.spec.ts`: axe, light and dark, reduced motion.
- **Contrast (AA, from axe):**
  - `--ink-faded` 35% → 60% light / 68% dark.
  - Amount faded parts 35% → 70%; red/green amounts are not faded.
  - Text below `text-ink/60` raised to `/60`; micro labels on pastels → 75%.
  - `lib/contrast.test.ts` covers faded ink.

### Required phone/UPI, notification step, push for expenses (2026-10-05, user request)

- **`0012_required_profile_push.sql`** (idempotent; run after 0011):
  - `profiles.upi_opt_out` ("I don't use UPI (living outside India)": clears the ID, UPI never offered).
  - Trigger `profiles_guard_upi`: a saved UPI ID can be changed, not cleared (unless opting out).
  - `set_my_phone` rejects empty: a phone can be changed, not removed.
  - `update_expense` logs `previous_splits`.
  - The push trigger now also fires for `expense_updated` / `expense_deleted`, and warns when `private.app_settings` lacks the webhook URL/secret.
  - Verified on local Postgres: `supabase/checks/0012_checks.sql`, 9 checks.
- **Push text** (`lib/push-messages.ts`, tested):
  - Title "Settld · <group>". Amounts drop ".00" (`formatAmountShort`).
  - Expenses notify only people in the split, never the actor: "Aman added Dinner · ₹2,400 · you owe ₹600" / "you get back ₹1,800" / "your share ₹600". Edits that change my share: "your share is now ₹800". Deletes: "Aman deleted Dinner".
  - Nudges open `?tab=balances`.
  - Webhook urgency is always high.
- **Onboarding** (`lib/onboarding.ts`, tested):
  - Steps: name → phone → color → UPI (no Skip; opt-out button) → currency → **notify** → home.
  - `notify` appears only where push works now (Android/desktop/Home Screen app).
  - iPhone Safari: the guide ends with "Open Settld from your Home Screen to turn on notifications".
  - `startStep` never resumes past a missing phone/UPI.
- **`RequiredSetup`** (mounted in providers, app routes only): full-screen "Add your number" → "Add your UPI ID" → (Home Screen app, permission "default", not answered on this device) "Turn on notifications". `NotificationPermission` asks only from the tap; denied → how to re-enable + Continue; answered once (`settld-push-step-done`). `PhonePrompt` (with "Later") removed.
- **/me:** "Send test notification" (re-saves this device, then a real push through the server; says why it failed). UPI can't be emptied; "Not using UPI" shown for opt-outs.
- **Nudge debugging:** the code path (nudge → activity → trigger → pg_net → webhook → web-push → `showNotification`) is verified end to end locally (`push.spec.ts`). Vercel runtime logs aren't readable from here (403). If production nudges still don't arrive, check `private.app_settings` has `push_webhook_url` + `push_webhook_secret` and see `net._http_response`.
- Tests: 380+ unit, 9 E2E.

### Nudges: 2-minute cooldown, daily cap, escalation by count (2026-10-06, user request; PRD updated)

- **`0013_nudge_rules.sql`** (idempotent; run after 0012):
  - **Limits:** `public.nudge_rules()` is the one place for them (cooldown_seconds 120, daily_cap 10, polite_until 3, cheeky_until 6). Change it with `create or replace function`; no deploy needed.
  - **`send_nudge` rewritten:**
    - Daily cap per pair over a rolling 24 h: "Daily nudge limit reached".
    - Cooldown: "You can nudge them again in 1:42".
    - Level by the count of nudges since they last settled up. A nudge they paid back at least its amount after resets the count. Polite-only groups always send level 1.
  - **Checks:** `supabase/checks/0013_checks.sql` (16 checks, run on local Postgres).
- **Client:**
  - `useNudgeRules` (rpc).
  - `nudgeAvailability` / `countdown` in `lib/nudges.ts` (tested). If the rules haven't loaded, the button is enabled and the server decides.
  - `NudgeButton` ticks once a second only while blocked and re-enables by itself.
  - Two level-2 templates no longer say "#2" / "Two nudges".
- **E2E:** `push.spec.ts` also checks that the live countdown ticks without a reload.

### Fix — nudge cooldown still 24 h on live (2026-10-06)

- **Root cause:** the live database still runs 0009's `send_nudge` ("You can nudge them again at <ISO>", +24 h); 0013 hadn't been applied there. Nothing else enforced 24 h: no trigger, constraint or unique index on `nudges`, and the UI already read `nudge_rules()`.
- **`0014_nudge_cooldown_patch.sql`** (self-contained, re-runnable; supersedes 0013, which is now a no-op):
  - Drops every `send_nudge` overload, any trigger, extra unique index or `sent_at` constraint on `nudges`.
  - Recreates `nudge_rules()` and `send_nudge`. Errors: "Nudge again in 1:42" / "Daily nudge limit reached · try again tomorrow", with `detail = retry_at=<ISO>`.
  - Ends with a 3-row ok check.
  - Verified starting from the old 0009 function.
  - Checks: `supabase/checks/0014_checks.sql` (17 checks, including "after 1 minute: still refused" and "after 2 minutes: second nudge succeeds").
- **Client:** `nudgeRetry` / `nudgeRetryText` (tested) turn any refusal (new detail, old "again at ISO", 0013's "again in m:ss") into a local countdown. The button adopts the server's retry time; long waits read "4 h 12 min". The cap label wraps.

### Fix — nudges not arriving as phone notifications (2026-10-06)

- **Trace:** in code, every step was correct:
  - `send_nudge` logs `nudge_sent`, and both the trigger and the route kinds include it;
  - recipient `to_member` → `user_id` → subscriptions;
  - the actor check skips only the sender;
  - nudges count as money, so only Off blocks them;
  - text, title and tap URL are right.
- **What differed in production:** the database → pg_net → webhook hop. "Send test notification" doesn't use it. The hop is either not configured (`private.app_settings`) or timed out (5 s, and Vercel cancels a function whose caller left), so pushes were lost.
- **Fix:**
  - `lib/push-send.ts` `deliverActivityPush`: the shared sender for the webhook and for the new `/api/push/nudge`. The sender's phone calls the route right after `send_nudge`; it checks session + RLS (sender only), and the nudge must be ≤ 10 min old.
  - `0015_push_delivery.sql`: `nudges.pushed_at` claim (no double sends), pg_net timeout 30 s, the trigger re-created, plus a health report (pg_net, trigger, kinds, webhook URL, secret set, column).
  - Logs: `[push] <kind> <id> via webhook|direct {recipients, devices, sent, removed, failed, skipped}` plus a per-device `[push] ok|gone|error …` line; webhook 401s are logged.
  - The toast says "· sent to their phone" / "· they'll see it in Settld".
- **Tests:**
  - Unit: one push to the receiver; All/Only money send, Off blocks.
  - E2E `push.spec.ts`: both paths on → exactly 1 nudge push, to the receiver only; webhook removed + receiver on Only money → still delivered.

### Portfolio prep: 1-hour nudge cooldown, README, history secret scan (2026-10-06)

- **Nudge cooldown 1 hour** (cap still 10/day):
  - `nudge_rules()` in `0014_nudge_cooldown_patch.sql` now has `cooldown_seconds` 3600. Re-run 0014, or just its `nudge_rules()` block, to apply.
  - `countdown` shows "60:00 … 0:01" for up to an hour, "x h y min" beyond.
  - Tests updated: `0014_checks.sql` (refused after 30 min, succeeds after 1 h; 17 pass), unit, and E2E (`push.spec.ts` passes).
- **README.md** replaces the create-next-app boilerplate: pitch, live demo, features, stack, Mermaid architecture, money math, security, setup, env var names. `docs/screenshots/` holds 9 placeholder PNGs and a shot list.
- **Git history secret scan** (all 21+ commits, all refs):
  - Every non-public `.env.local` value was searched literally: none ever committed.
  - No JWTs, no Resend keys, no `.env` files except `.env.local.example` (placeholders only).
  - The only `push_webhook_secret` literal is the E2E template variable.
  - Safe to make the repo public.
