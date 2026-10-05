# Settld — Product Requirements Document

Oct 4, 2026 · Vansh

## Overview

Settld is a realtime shared-expense app where friends join groups through a share link, built as a mobile-first PWA with a bold, poster-style interface.

**What it does.** People create groups (trips, flats, dinners), add expenses, split them any way they like, and settle debts through UPI. Every change appears instantly on everyone's phone.

**Why it exists.** Splitwise works but feels like a spreadsheet. Settld does the same job with a loud, playful design and live features (Split Room, Debt Graph) that make splitting feel social instead of admin.

**Goals**

- A portfolio piece that looks better than any expense app on Dribbble and actually works.
- Daily use by a real friend group, so it must be fast, reliable, and correct with money.
- Show off realtime engineering: live sync, presence, and collaborative bill splitting.

**Audience.** Indian college students and young professionals splitting trips, rent, food, and subscriptions. Primary currency is INR, with USD, AUD, EUR, and GBP for travel.

**Platform decision.** A Progressive Web App built with Next.js. Invite links open straight in the browser with no app-store install, and friends can add it to their home screen for a full-screen, app-like feel. Designed for iPhone first (390 px wide), and it must still look good on Android and desktop.

## Scope

v1 ships the full splitting core plus the four headline features; everything else waits for v1.5 or v2.

| Feature | Release | Notes |
| --- | --- | --- |
| Auth (magic link + Google) | v1 | Supabase Auth |
| Groups with color and emoji | v1 | Pastel color per group |
| Invite links + QR join | v1 | Token-based, revocable |
| Ghost members | v1 | Claimable on join |
| Expenses: equal, exact, percent, shares | v1 | Multiple payers supported |
| Balances + simplify debts | v1 | Per group and overall |
| Settle up + UPI deep link | v1 | Manual record or UPI |
| Multi-currency (INR, USD, AUD, EUR, GBP) | v1 | Rate locked per expense |
| Realtime sync + optimistic UI | v1 | Supabase Realtime |
| Activity feed | v1 | Per group |
| Split Room | v1 | Live collaborative bill |
| Debt Graph | v1 | Animated simplify |
| Command bar quick-add | v1 | Text parser, no AI |
| Settle-up receipt card | v1 | Shareable image |
| Presence pill | v1 | Live activity banner |
| Reactions + comments | v1 | On expenses |
| Escalating nudges | v1 | Toggle per group |
| Privacy blur | v1 | Hide all amounts |
| Offline queue | v1 | Sync on reconnect |
| Trip Wrapped | v1.5 | Story-style recap |
| Trip kitty mode | v1.5 | Shared pot |
| Itemized split (solo) | v1.5 | Reuses Split Room logic |
| Settle streaks + badges | v1.5 | Positive only |
| Bill roulette | v1.5 | Logged as expense |
| Recurring expenses | v1.5 | Rent, subscriptions |
| Spending breakdown | v1.5 | Category bars |
| CSV export | v1.5 | Per group |
| Receipt scan + AI parsing | v2 | Fills Split Room items |

**Out of scope:** real payment processing, bank linking, native iOS or Android apps, and business or tax features.

## Design system

Settld looks like a sports poster: giant condensed headlines, stacked pastel color-block cards, and oversized numbers with the less important digits faded out.

**Reference.** The Geex Arts football app shot on Dribbble. We borrow its principles (type scale, card stacking, faded secondary digits, probability bar, bold footer CTA), not its layout or content.

### Typography

| Role | Font (Google Fonts) | Size / weight | Usage |
| --- | --- | --- | --- |
| Display | Anton | 48–64 px, uppercase, line-height 0.9 | Screen titles: YOUR GROUPS, GOA TRIP |
| Display alt | Big Shoulders Display | 32–40 px, 800 | Section headers, card titles |
| Numbers | Jersey 10 | 40–96 px | All money amounts, times, counts |
| UI | Inter | 13–16 px, 500–600 | Labels, buttons, inputs, body |
| Micro | Inter | 10–11 px, 600, uppercase, 0.08em tracking | Dates, tags, "YOU OWE" labels |

Titles often run two lines with the second line in a faded color: **SETTLD** black, **GROUPS** in grey.

### The faded-digit rule

Every money amount splits into a strong part and a faded part. The currency symbol and decimals render at 35% opacity; the whole number is full strength. Example: ₹ (faded) **1,240** (bold) .50 (faded). Build this once as an `<Amount />` component and use it everywhere.

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #F4F1EC | #0E0E0E | App background |
| `--ink` | #0E0E0E | #F4F1EC | Text, outlines |
| `--ink-faded` | #0E0E0E at 35% | #F4F1EC at 35% | Faded digits, second title line |
| `--surface` | #FFFFFF | #1A1A1A | Sheets, inputs |
| `--pink` | #F6C9E4 | #F6C9E4 | Group color |
| `--sky` | #7FB2F0 | #7FB2F0 | Group color |
| `--mint` | #C8F2C2 | #C8F2C2 | Group color |
| `--butter` | #F7D58A | #F7D58A | Group color |
| `--lilac` | #D7C6F5 | #D7C6F5 | Group color |
| `--peach` | #FFC7A8 | #FFC7A8 | Group color |
| `--coral` | #EE6A4B | #EE6A4B | Primary CTA (Settle Up) |
| `--owe` | #E5484D | #FF6369 | You owe: fills and chips only |
| `--owed` | #1F9D55 | #3DD68C | You're owed: fills and chips only |
| `--owe-text` | #C42B30 | #FF6369 | You owe: text (labels, amounts) |
| `--owed-text` | #157A41 | #3DD68C | You're owed: text (labels, amounts) |

Pastels stay pastel in dark mode, with black text on top, so cards glow against the dark background. Each group picks one pastel; that color tints its card, its header, and its expense cards.

**Owe/owed and contrast.** `--owe` and `--owed` are for fills and chips only: as text on the light background they fall below WCAG AA (about 3.5:1 and 3.1:1). Red and green text uses the text-safe `--owe-text` and `--owed-text`, which reach at least 4.5:1 on `--bg` and `--surface` in both modes. Status on pastel cards (for example "You owe ₹500" on a group card) is never red or green text: it's a chip filled with `--owe`, `--owed`, or a faint ink tint for "Settled up", with dark text on top.

### Cards

- 24 px corner radius, no shadows, a 1.5 px `--ink` outline at 8% opacity.
- Group cards stack with a 16 px overlap; the top-right corner has a folded dog-ear (a small triangle in a slightly darker tint).
- Card anatomy: avatar row on the left, micro-label date top-right, big title in Big Shoulders, amount in Jersey 10 at the bottom.

### Signature components

- **Split bar.** A segmented horizontal bar showing each person's share, labels and percentages underneath. Used on expense detail and group balances.
- **Settle footer.** A full-width coral block pinned to the bottom of the group screen, label in Big Shoulders: SETTLE UP.
- **Avatar chips.** Circles with initials on a pastel background; ghost members get a dashed outline.
- **Amount input.** A full-screen numpad with the amount in Jersey 10 at 96 px.

### Motion

- Framer Motion springs (stiffness 400, damping 30) for card expand, sheet open, and list reorder.
- Shared-element transition: a group card morphs into the group screen header.
- Numbers count up when balances change.
- Confetti burst in group colors when a balance reaches zero.
- Respect `prefers-reduced-motion` by swapping springs for fades.

### Spacing and layout

4 px base grid; screen padding 20 px; max content width 480 px, centered on desktop with the pastel stack visible on the sides as decoration. Bottom tab bar: Groups, Activity, + (command bar), Friends, You.

## Screens

| # | Screen | Route | Layout notes |
| --- | --- | --- | --- |
| 1 | Landing | `/` | Giant SPLIT / IT / SETTLD stacked title, faded second line; three pastel cards fanned below; Continue with Google + email |
| 2 | Onboarding | `/onboarding` | Name, phone number (required; country picker, +91 default; prefilled from a personal invite), avatar (optional photo: Add photo / Use my Google photo; color as the fallback and photo ring), UPI ID (optional), default currency; last step = animated Add to Home Screen guide |
| 3 | Home (Groups) | `/groups` | Title SETTLD / GROUPS; overall balance in Jersey 10; stacked group cards with dog-ear, date, members, your balance; a tinted strip of the group background photo at the top when there is one |
| 4 | Group | `/g/[id]` | Pastel header with emoji + name (over the group background photo under a pastel tint when set; admins set it in Group settings); balance split bar; tabs: Expenses, Balances, Graph, Activity; coral SETTLE UP footer |
| 5 | Expense detail | sheet | Big amount, payer, split bar, per-person rows, reactions row, comment thread, edit and delete |
| 6 | Add expense | sheet | Full-screen numpad, title, payer picker, split type tabs (Equal, Exact, %, Shares), currency chip, category, date |
| 7 | Command bar | overlay | Single text field; live preview card of the parsed expense; Enter to save |
| 8 | Balances | group tab | Simplified "who pays whom" list, each row with UPI and Mark paid buttons |
| 9 | Debt Graph | group tab | Full-width canvas of bubbles and arrows; Simplify toggle animates the change |
| 10 | Settle up | sheet | Pick person, amount prefilled, Pay via UPI or Record cash; success shows the receipt card |
| 11 | Split Room | `/room/[code]` | Live bill: item cards, avatars of who tapped each, running per-person totals, QR to join, Finalize button |
| 12 | Join group | `/join/[token]` | Preview card (group name, color, members); Join, or claim a ghost member slot |
| 13 | Activity | `/activity` | Timeline across all groups, grouped by day, with group color stripe |
| 14 | Profile | `/me` | Avatar (tap: Add / Change / Remove photo, Use my Google photo, avatar color), phone (private), UPI ID, default currency, theme, privacy blur default, sign out |

**Empty states** are designed, not blank: a single huge faded word (NOTHING / YET) with one CTA.

**Loading** uses skeleton cards in the group's pastel, never spinners.

## Core features

The core must be correct with money above all else: every split sums exactly to the expense total, and balances always reconcile to zero across a group.

### Auth

- Supabase Auth with Google OAuth and email magic link. No passwords.
- First sign-in creates a `profiles` row and sends the user to onboarding.
- If the user arrived through an invite link, the invite token survives sign-in and they land on the Join screen.

### Groups

- Fields: name, emoji, pastel color, base currency, type (Trip, Home, Couple, Other), simplify-debts toggle (on by default).
- Creator is admin. Admins can rename, change color, remove members with a zero balance, regenerate invite links, and archive the group.
- Archived groups are read-only and move to a collapsed section.

### Invites and joining

- Each group has an invite token (12+ random characters) shown as a link `/join/<token>` and a QR code.
- Share uses the Web Share API, falling back to copy-to-clipboard; the WhatsApp share text is prefilled.
- Admin can regenerate the token, which kills the old link.
- Open Graph tags on `/join/<token>` render a rich preview card in WhatsApp and iMessage (group name, color, member count).

### Ghost members

- Add a person by name only, before they have an account. They can be payers and splitters like anyone else.
- On joining, the new user sees a list of unclaimed ghosts and taps "That's me". All their past expenses and balances transfer to their account.
- Admin can also send a ghost a personal claim link that auto-claims.

### Expenses

- Fields: title, amount, currency, date, category, payer(s), split type, splits, note.
- Split types: Equal, Exact amounts, Percentages, Shares (e.g. 2:1:1).
- Multiple payers: each payer's paid amounts must sum to the total.
- Rounding: work in minor units (paise, cents) as integers. Leftover paise go to the first members in a stable order so the sum is exact.
- Validation blocks saving until splits sum to the total, with a live "₹40 left to assign" indicator.
- Any member can add; the creator or an admin can edit or delete. Every change writes an activity entry; deletes are soft with Undo for 10 seconds.
- Categories: Food, Travel, Stay, Groceries, Rent, Utilities, Entertainment, Shopping, Subscriptions, Other, each with an icon.

### Balances and simplify debts

- Net balance per member = total paid − total owed − settlements sent + settlements received, in the group's base currency.
- Simplify: greedy match of largest creditor with largest debtor until all nets are zero. This gives at most n − 1 payments.
- Simplify off: show raw pairwise debts.
- Home shows the overall total across groups, converted to the user's default currency.

### Settle up

- From Balances, tap a row: Pay via UPI or Mark as paid (cash/other).
- UPI link: `upi://pay?pa=<upi_id>&pn=<name>&am=<amount>&cu=INR&tn=Settld%20<group>`. Opens GPay, PhonePe, or Paytm on the phone.
- UPI only for INR; other currencies use Mark as paid.
- After returning from the UPI app, ask "Did the payment go through?" before recording. The receiver can confirm or dispute.
- Partial settlements allowed.

### Currencies

- Supported: INR, USD, AUD, EUR, GBP.
- Each group has a base currency; any expense can use any supported currency.
- When an expense is saved in a non-base currency, fetch the rate from the Frankfurter API and store it on the expense. Balances use the stored rate, so they never drift.
- Show both: "$40 (₹3,340)". The user can override the rate manually.
- Rates are cached for 6 hours in a `fx_rates` table to avoid repeated calls.

## Headline features

### Split Room

A live, collaborative bill that everyone at the table works on at once.

1. Host taps New Split Room inside a group (or standalone) and enters line items: name, price, quantity. Tax, service charge, and tip go in as percentages or amounts.
2. Room gets a 6-character code and a QR. Others join by scanning; group members can also join from a banner on the group screen.
3. Each item is a card. Tapping it adds your avatar to it. Items with several avatars split equally between them; long-press to set custom shares.
4. Everyone's running total updates live on all phones, with tax and tip spread proportionally.
5. Unclaimed items glow; the Finalize button stays disabled until every item has at least one person.
6. Host taps Finalize. Settld creates one expense with exact splits and closes the room. Everyone sees a summary card.

**Rules:** host can edit items; others can only tap. Rooms expire after 12 hours. Ghost members can be assigned items by the host.

### Debt Graph

- Each member is a circle in their avatar color, sized by the absolute value of their balance. Creditors sit on the right, debtors on the left.
- Arrows go from debtor to creditor, thickness proportional to amount, label in Jersey 10.
- Simplify toggle: raw debts animate into the simplified set, arrows merging and fading over about 800 ms.
- Tap a node to highlight its arrows and show a mini card with Settle and Nudge buttons.
- Built with SVG + Framer Motion, layout computed with d3-force on the client; max 12 members shown, others grouped as "+3".

### Command bar

A single text field for adding expenses at typing speed. Opens from the + tab or Cmd+K on desktop.

| Input | Result |
| --- | --- |
| `dinner 2400` | Dinner, ₹2,400, paid by me, split equally with whole group |
| `dinner 2400 me aman rahul` | Split equally between me, Aman, Rahul |
| `cab 600 paid by rahul` | Rahul paid, split with whole group |
| `hotel $120 split 3` | USD, split with first 3 recent members (asks to confirm) |
| `snacks 300 aman 200 me 100` | Exact split |
| `in goa trip` | Picks the group by fuzzy name match |

- Names fuzzy-match against group members (first name, nickname, initials).
- A live preview card shows the parsed expense; anything uncertain is underlined and tappable to fix.
- Enter saves; Tab opens the full Add Expense sheet prefilled.
- Pure TypeScript parser with unit tests; no AI.

### Settle-up receipt

Poster-style card: payer → receiver in Anton, amount in Jersey 10, group name and date as micro labels, the group's pastel background, and a SETTLD ✓ stamp.

- Rendered server-side with `@vercel/og` at 1080 × 1920 (stories) and 1200 × 630 (chats).
- Share via Web Share API with the image file; fallback is download.
- Same renderer powers the invite preview card.

## Personality features

### Presence pill

- A black pill floating at the top, styled like the iPhone Dynamic Island, that expands to show live events: "Rahul is adding an expense…", "Aman just settled ₹500", "Priya joined GOA TRIP".
- Typing indicators come from Supabase Presence; events come from the activity stream.
- Auto-collapses after 3 seconds; tap to jump to the item. One event at a time, queued.

### Reactions and comments

- Six fixed reactions on any expense or settlement: 💀 😭 🔥 🙏 🤡 💸. One per person per item, tap again to remove.
- Comment thread on the expense detail sheet, plain text, 280 characters, live.
- New comments and reactions show as a dot on the expense card (and payment card) until you open it.
- Reactions and comment threads are on settlements too. Only the author can delete a comment. Each comment logs activity.

### Notifications

- Push for: an expense involving me, someone paid me, my payment confirmed/disputed, a comment on something I'm in, nudges. Never my own actions.
- Permission is only requested from a tap: "Turn on notifications" on /me, or the one-time offer after my first expense. In iPhone Safari (not from the Home Screen) /me shows Add to Home Screen steps instead.
- Per group, per person (group settings, visible to every member): All / Only money stuff / Off. Dead subscriptions (404/410) are removed.
- A minimal push-only service worker (`/sw.js`) and a web app manifest (standalone) ship now; offline caching is Milestone 9.

### Escalating nudges

- Nudge button on any balance row where someone owes you. Sends a push notification and an in-app banner.
- Tone escalates with each nudge within 14 days: level 1 polite, level 2 cheeky, level 3 dramatic. Example level 3: "Aman. It's been 9 days. The ₹340 misses you."
- Also on the Debt Graph mini card. Ghosts can't be nudged. Days = how long the oldest unpaid shared expense has been owed (since their last payment to you).
- One nudge per person per 24 hours. Group setting: Nudges On / Polite only / Off.
- About 10 templates per level, picked at random, with name, amount, and days filled in.

### Privacy blur

- Eye icon in the header blurs every `<Amount />` (CSS blur 8 px) across the app.
- Profile setting makes blur the default on app open. Tap an amount to peek for 2 seconds.

## Data model

All money is stored as `bigint` minor units (paise, cents) with a `currency` code; no floats anywhere in the database.

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | id (= auth.users.id), name, avatar_color, avatar_url (nullable), upi_id, default_currency, privacy_blur | One per user |
| `user_phones` | user_id, phone (E.164) | Private: only the owner can read it |
| `ghost_phones` | member_id, group_id, phone (E.164) | Only that group's admins can read it; deleted when the spot is claimed |
| `groups` | id, name, emoji, color, cover_url (nullable), base_currency, type, simplify, created_by, archived_at | |
| `group_members` | id, group_id, user_id (nullable), display_name, is_ghost, role, joined_at | Ghosts have user_id null; claiming sets it |
| `invites` | id, group_id, token (unique), created_by, revoked_at, ghost_member_id (nullable) | ghost_member_id = personal claim link |
| `expenses` | id, group_id, title, amount, currency, fx_rate_to_base, amount_base, category, date, note, created_by, client_id, deleted_at | Soft delete |
| `expense_payers` | expense_id, member_id, amount_base | Sum = expense amount_base |
| `expense_splits` | expense_id, member_id, amount_base, split_type, raw_value | raw_value = % or shares as entered |
| `settlements` | id, group_id, from_member, to_member, amount, currency, amount_base, method (upi, cash, other), status (pending, confirmed, disputed), client_id, created_at | |
| `activity` | id, group_id, actor_member, kind, entity_id, payload jsonb, created_at | Feeds activity tab and presence pill |
| `reactions` | entity_type, entity_id, member_id, emoji | Unique per member per entity |
| `comments` | id, entity_type, entity_id, member_id, body, created_at | |
| `nudges` | id, group_id, from_member, to_member, level, sent_at | Enforces 24 h limit |
| `split_rooms` | id, code, group_id (nullable), host_member, tax, service, tip, status, expires_at | |
| `split_room_items` | id, room_id, name, price, qty | |
| `split_room_claims` | item_id, member_id, shares | |
| `fx_rates` | base, quote, rate, fetched_at | 6 h cache |
| `push_subscriptions` | user_id, endpoint, keys jsonb | Web Push |

**Balances** are computed by a Postgres view `group_balances` (paid − owed ± settlements per member) so every client reads the same numbers. Simplification runs on the client from that view.

**Writes that touch several tables** (expense + payers + splits, ghost claim, Split Room finalize) go through Postgres functions called with `supabase.rpc()` so they are atomic and validate that sums match.

### Photos

- Optional profile photos and group backgrounds. Without one: initials on the person's pastel, and the plain group color.
- Supabase Storage buckets `avatars` and `group-covers`: public read by URL with random UUID file names (`<user or group id>/<uuid>.webp`), 2 MB max, WebP/JPEG only. Storage RLS: users write only their own avatar folder; only group admins write their group's cover folder. `avatar_url` / `cover_url` must point into the row's own folder in our bucket (no hot-linking); covers change only through `set_group_cover` (admins).
- Images are cropped, resized and compressed in the browser before upload: avatars 256×256 (round mask), covers 1200×600 (wide mask), WebP ~80% with JPEG fallback. Works with iPhone photos (Safari converts HEIC). Replacing or removing a photo deletes the old file. "Use my Google photo" copies the Google picture into our bucket.
- Avatars show the photo everywhere (lists, sheets, Debt Graph, presence pill, Split Room) inside a ring in the person's avatar color. Ghosts never have photos.
- Covers show the photo in its real colors with no overlay, clear at the top. A dark scrim (rgba(0,0,0,0.6)) starts just above the text block and sits only behind the text; text on covers is white, with faded parts (decimals, ₹, secondary labels) at 85% white (WCAG AA over a pure white photo). Labels above the scrim (date, nav) use a soft shadow, and the back/settings icons sit on small blurred dark circles. Home cards with a cover are full-bleed photos (about 240px tall) inside a 3px ring of the group's pastel, with the dog-ear; status chips stay solid. The group header shows the photo clear behind the nav and emoji, scrim from the title down, and a short fade into the pastel at the bottom; the WHO'S PAID card stays solid. The invite preview image uses the same treatment with a pastel frame. Groups without a cover are unchanged.

### Phone numbers and phone invites

- Phone numbers are **not verified** (no SMS OTP yet), so a number never grants access and never claims a ghost by itself. The personal claim link stays the only proof for taking a ghost's spot.
- Private: never shown to other users. Stored outside `profiles` (`user_phones`: owner only; `ghost_phones`: that group's admins only). E.164, validated with libphonenumber-js.
- Required at sign-up (onboarding step after name, +91 default); existing users get a one-time prompt with "Later"; editable on /me.
- Add someone (admins): name + optional phone; "Pick from contacts" only where the Contact Picker API exists (Android Chrome), hidden on iPhone. After saving, and from "Send invite" on any unclaimed ghost: WhatsApp (`wa.me/<digits>?text=`) or SMS (`sms:<n>&body=` on iOS, `?body=` elsewhere) with a friendly message and the ghost's personal claim link.
- A personal claim link opened signed out: sign up → onboarding (phone prefilled from the ghost, editable) → the spot is claimed automatically → the group opens with a one-time welcome card (who added you, spent so far, your balance, See the expenses). Already signed-in users confirm with one tap. Past expenses, splits and balances come with the spot.
- Whoever added the ghost gets an activity entry and a push: "Rahul joined Goa Trip".

### Row-level security

- Helper function `is_member(group_id)` returns true if `auth.uid()` has a `group_members` row in that group.
- Every group-scoped table: select, insert, update allowed only when `is_member(group_id)`.
- Expense update and delete: only the creator or a group admin.
- `invites`: readable by token only through a security-definer function `preview_invite(token)` that returns name, color, emoji, member count. The table itself is not publicly readable.
- `split_rooms`: joinable by code through a similar function; members of the room can read and claim.
- `profiles`: users read profiles of people they share a group with; update only their own.

## Realtime architecture

Every money write goes through one validated Postgres function, and Supabase Realtime fans the result out to every member's phone.

```
Your phone (optimistic) ─► RPC function (checks sums, atomic) ─► Postgres (rows + activity)
                                                                    │            │
                                                                    ▼            ▼
                                                         Realtime group channel   Push edge function
                                                                    │            (Web Push if app closed)
                                                                    ▼            │
                                                           Other phones ◄────────┘
Your phone ◄──── Presence channel (typing, Split Room taps; no DB write) ────► Other phones
```

- **Channels.** One channel per group (`group:<id>`) subscribed to `postgres_changes` on expenses, settlements, reactions, comments, and activity, filtered by `group_id`. One channel per Split Room (`room:<code>`) for item claims.
- **Optimistic UI.** TanStack Query updates the cache immediately with a temporary id; the realtime event or RPC response replaces it. On error, roll back and show a toast.
- **Deduplication.** Each write carries a client-generated `client_id` (UUID); clients ignore realtime events that match their own pending writes.
- **Balances.** After any change event, refetch `group_balances` for that group rather than recomputing from events.
- **Reconnect.** On reconnect or app focus, refetch the open group, then replay the offline queue in order.
- **Presence payload.** `{ member_id, typing: boolean, screen }`, throttled to one update per second.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router, Server Actions where simple, RPC for money writes) |
| Language | TypeScript, strict mode |
| Styling | Tailwind CSS with design tokens as CSS variables |
| Animation | Framer Motion |
| Backend | Supabase: Postgres, Auth, Realtime, Storage |
| Client data | TanStack Query for caching + optimistic updates |
| Graph layout | d3-force |
| OG / receipt images | `@vercel/og` |
| QR | `qrcode` (generate), `@zxing/browser` or native camera link (scan) |
| Push | Web Push with VAPID keys (`web-push`), sent from a Next.js route handler (`/api/push/webhook`) that a database trigger on activity inserts calls through `pg_net` with a shared secret |
| FX rates | Frankfurter API (free, no key) |
| PWA | `@serwist/next` for service worker, manifest, offline cache |
| Offline queue | IndexedDB via `idb-keyval`, replayed on reconnect |
| Tests | Vitest for money math and command parser; Playwright for key flows |
| Hosting | Vercel |

### Project structure

```
app/
  (auth)/login, onboarding
  groups/, g/[id]/, room/[code]/, join/[token]/, activity/, me/
  api/og/receipt, api/og/invite
components/
  ui/ (Amount, Card, SplitBar, Avatar, Sheet, Numpad, PresencePill)
  features/ (expense, settle, debt-graph, split-room, command-bar)
lib/
  money.ts (minor units, splitting, rounding)
  simplify.ts (debt simplification)
  parser.ts (command bar grammar)
  fx.ts, upi.ts, supabase/
supabase/
  migrations/ (push is sent from app/api/push/webhook)
```

### PWA and iOS constraints

- iOS Safari does not support the Vibration API, so no haptics. Use visual and motion feedback instead.
- Push notifications on iOS work only after the user adds Settld to the Home Screen (iOS 16.4+). Onboarding must show an animated Add to Home Screen guide, and the app should re-prompt gently after the first expense.
- Set `display: standalone`, theme color per light/dark, and splash images for iPhone sizes.
- Handle safe areas with `env(safe-area-inset-*)` so the coral footer clears the home indicator.
- UPI deep links open external apps; detect return via `visibilitychange` to ask "Did the payment go through?"

## Build order

Build in nine milestones, each ending in something you can open and test. Claude Code works on one milestone per session.

1. **Foundation.** Next.js + Tailwind + Supabase setup, design tokens, fonts, light/dark theme, and the UI kit: Amount, Card, SplitBar, Avatar, Sheet, Numpad. Build a `/kit` page that shows every component.
2. **Auth and profiles.** Google + magic link, onboarding flow, profile screen.
3. **Groups and invites.** Create group, Home stack, Group screen shell, invite links, QR, Join screen, ghost members and claiming, RLS policies.
4. **Money core.** `money.ts` and `simplify.ts` with Vitest tests first; Add Expense sheet with all four split types and multiple payers; expense list and detail; `group_balances` view; Balances tab.
5. **Settle up and currencies.** UPI links, Mark as paid, confirm/dispute, FX fetching and locking, multi-currency display.
6. **Realtime layer.** Supabase Realtime subscriptions, optimistic updates, activity feed, presence pill.
7. **Headline features.** Command bar, Debt Graph, receipt card renderer, then Split Room last (it uses everything before it).
8. **Personality.** Reactions, comments, nudges with Web Push, privacy blur, confetti, empty states.
9. **PWA polish.** Service worker, offline queue, Add to Home Screen guide, splash screens, Lighthouse pass, Playwright tests for create group → add expense → settle.

After v1 ships, v1.5 starts with Trip Wrapped and kitty mode.

## Acceptance criteria

v1 is done when every box below is ticked on a real iPhone added to the Home Screen.

- [ ] A friend with no account opens an invite link in WhatsApp, sees the preview, signs in, and lands in the group within 30 seconds.
- [ ] A ghost member with past expenses is claimed and their balance transfers exactly.
- [ ] For 1,000 random expenses across all split types and currencies, splits sum to the total and group balances sum to zero (Vitest property test).
- [ ] An expense added on one phone appears on another within 1 second on normal 4G.
- [ ] Simplify debts never produces more than n − 1 payments.
- [ ] UPI link opens GPay or PhonePe with the correct amount and name.
- [ ] A 4-person Split Room with 10 items finalizes into one correct expense.
- [ ] The command bar parses every example in its grammar table correctly.
- [ ] An expense added offline syncs on reconnect without duplicates.
- [ ] Lighthouse PWA and accessibility scores of 90+; all text meets WCAG AA contrast, including on pastels.
- [ ] Every screen works in light and dark mode and with reduced motion.

## Open questions

- Domain: custom domain, or a Vercel subdomain at first?
- Should non-members be able to join a Split Room without a Settld account (guest name only)?
- Should group admins be able to edit anyone's expense, or only remove them?
- Check Jersey 10 renders currency symbols; fall back to Big Shoulders for ₹ if not.
