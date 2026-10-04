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

**Next: Milestone 6 — Realtime layer** (Supabase Realtime subscriptions, optimistic updates, activity feed, presence pill).

### Deploy + sign-in fixes (2026-10-04)

- **Hosting:** Vercel project `settld` (team "Vansh's projects"), production https://settld-omega.vercel.app, auto-deploys on push to `main`. Env vars set for Production/Preview/Development; `SUPABASE_SERVICE_ROLE_KEY` is a Sensitive secret. Run the CLI with `npx vercel` (the global npm install needs admin rights here).
- **Localhost redirect after Google sign-in:** caused by Supabase's **Site URL = http://localhost:3001** with the production callback not allowlisted (Supabase falls back to Site URL). Proven with a read-only probe (`/auth/v1/verify` with a bogus token returns the fallback). Fix is in the Supabase dashboard (URL Configuration). Code and Vercel env contain no localhost.
- **Auth return:** `lib/auth-return.ts` handles `/auth/callback` and `/auth/confirm`: PKCE `?code=`, template `?token_hash=`, and Supabase `?error=` params → clear messages (`lib/auth-flow.ts`, tested). Redirects use `requestOrigin()` (x-forwarded-host on Vercel, validated; tested). Failures are logged with a reason, never tokens. Middleware skips `/auth/*`.
- **Email code:** the email sheet accepts the 6-digit OTP (`verifyOtp`), which works in the home-screen app and when the link opens in another browser. It needs `{{ .Token }}` in the Supabase email templates.
- **Account switching:** Google uses `prompt: select_account`. `components/providers/AuthSync.tsx` clears the TanStack cache, app storage (theme kept) and privacy blur whenever the user changes, and hard-navigates when a known account is replaced or signed out. Sign-out uses `signOutAndReset` (`lib/session-reset.ts`). The server Supabase client fetches with `cache: "no-store"`.
