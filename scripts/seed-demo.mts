/**
 * Demo data for screenshots and the portfolio, on the project in .env.local (production).
 *
 *   npm run demo:seed     remove any old demo data, then create it fresh
 *   npm run demo:remove   remove all demo data (accounts, groups, everything in them, the cover)
 *
 * Touches ONLY the four demo accounts below and groups whose members are all demo accounts.
 * Every write goes through the app's own RPCs as the demo users (same validation as the app);
 * the service role key is used only to create/delete the demo accounts, sign them in without
 * email, read ids, upload the cover, and delete demo groups. Keys are never printed.
 * The emails use example.com (reserved: no mail can ever reach a real inbox).
 *
 * Run with Node 22.18+ (TypeScript runs natively): node scripts/seed-demo.mts [--remove]
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

// ------------------------------------------------------------------------------------------------
// Config
// ------------------------------------------------------------------------------------------------

export const DEMO_PEOPLE = [
  { key: "vansh", email: "demo.settld@example.com", name: "Vansh", color: "lilac", upi: "vansh.demo@okaxis", phone: "+917000000001" },
  { key: "aman", email: "aman.demo.settld@example.com", name: "Aman", color: "sky", upi: "aman.demo@okhdfcbank", phone: "+917000000002" },
  { key: "priya", email: "priya.demo.settld@example.com", name: "Priya", color: "pink", upi: "priya.demo@oksbi", phone: "+917000000003" },
  { key: "kabir", email: "kabir.demo.settld@example.com", name: "Kabir", color: "butter", upi: "kabir.demo@ybl", phone: "+917000000004" },
] as const;
type Who = (typeof DEMO_PEOPLE)[number]["key"];
export const DEMO_EMAIL = DEMO_PEOPLE[0].email;

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
// Real environment variables win over .env.local (e.g. to point it at a local Supabase first).
const E = { ...env(), ...(process.env as Record<string, string>) };
const URL_ = E.NEXT_PUBLIC_SUPABASE_URL;
const ANON = E.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = E.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(URL_, SERVICE, opts);

function must<T>(r: { data: T; error: unknown }, what: string): T {
  if (r.error) throw new Error(`${what}: ${(r.error as { message?: string }).message ?? String(r.error)}`);
  return r.data;
}

// ------------------------------------------------------------------------------------------------
// Accounts
// ------------------------------------------------------------------------------------------------

async function demoUsers(): Promise<Map<string, string>> {
  const emails = new Set<string>(DEMO_PEOPLE.map((p) => p.email));
  const found = new Map<string, string>(); // email → id
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email && emails.has(u.email)) found.set(u.email, u.id);
    if (data.users.length < 1000) break;
  }
  return found;
}

/** A one-time sign-in token for a demo account (no email is sent). */
export async function magicTokenHash(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw new Error(`generateLink: ${error?.message}`);
  return data.properties.hashed_token;
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, opts);
  const { error } = await c.auth.verifyOtp({ type: "magiclink", token_hash: await magicTokenHash(email) });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

// ------------------------------------------------------------------------------------------------
// Remove
// ------------------------------------------------------------------------------------------------

export async function removeDemo(): Promise<void> {
  const users = await demoUsers();
  const ids = [...users.values()];
  if (ids.length === 0) {
    console.log("No demo accounts found. Nothing to remove.");
    return;
  }
  const idSet = new Set(ids);
  // Groups a demo account belongs to, deleted only if every signed-up member is a demo account.
  const { data: rows } = await admin.from("group_members").select("group_id").in("user_id", ids);
  const groupIds = [...new Set((rows ?? []).map((r) => r.group_id as string))];
  let removedGroups = 0;
  for (const gid of groupIds) {
    const { data: members } = await admin.from("group_members").select("user_id").eq("group_id", gid).not("user_id", "is", null);
    if (!(members ?? []).every((m) => idSet.has(m.user_id as string))) {
      console.warn(`Skipping group ${gid}: it has non-demo members.`);
      continue;
    }
    const { data: files } = await admin.storage.from("group-covers").list(gid);
    if (files?.length) await admin.storage.from("group-covers").remove(files.map((f) => `${gid}/${f.name}`));
    // Children first: several tables point at members without ON DELETE CASCADE, so one
    // cascading delete of the group trips their foreign keys.
    for (const table of ["split_rooms", "reactions", "comments", "nudges", "entity_seen", "settlements", "expenses", "activity"]) {
      must(await admin.from(table).delete().eq("group_id", gid), `delete ${table}`);
    }
    must(await admin.from("groups").delete().eq("id", gid), "delete group");
    removedGroups++;
  }
  for (const [email, id] of users) {
    const { data: files } = await admin.storage.from("avatars").list(id);
    if (files?.length) await admin.storage.from("avatars").remove(files.map((f) => `${id}/${f.name}`));
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`delete ${email}: ${error.message}`);
  }
  console.log(`Removed ${removedGroups} demo group(s) and ${users.size} demo account(s).`);
}

// ------------------------------------------------------------------------------------------------
// Seed
// ------------------------------------------------------------------------------------------------

const rupees = (r: number) => Math.round(r * 100);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

/** Equal split in integer paise: leftover paise to the first people (same rule as the app). */
function equal(total: number, members: string[]) {
  const base = Math.floor(total / members.length);
  const extra = total - base * members.length;
  return members.map((m, i) => ({ member_id: m, amount: base + (i < extra ? 1 : 0), raw_value: null }));
}

/** Illustrated Goa beach at sunset (generated; no stock photo). 1200×600 WebP. */
async function coverWebp(): Promise<Buffer> {
  const palms = [
    [120, 600, 1],
    [1040, 600, -1],
    [1130, 610, -1],
  ]
    .map(
      ([x, y, d]) => `<g transform="translate(${x} ${y}) scale(${d} 1)">
        <path d="M0 0 C 10 -120, 30 -230, 70 -330" stroke="#3B2A2A" stroke-width="14" fill="none" stroke-linecap="round"/>
        ${[-60, -20, 25, 70, 120]
          .map((a) => `<path d="M70 -330 q ${60 * Math.cos((a * Math.PI) / 180)} ${-40 + 60 * Math.sin((a * Math.PI) / 180)} ${130 * Math.cos((a * Math.PI) / 180)} ${30 + 90 * Math.sin((a * Math.PI) / 180)}" stroke="#2F4A32" stroke-width="18" fill="none" stroke-linecap="round"/>`)
          .join("")}
      </g>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4B6CB7"/><stop offset="0.45" stop-color="#F49A7A"/><stop offset="0.72" stop-color="#FFC982"/>
      </linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3E8FB0"/><stop offset="1" stop-color="#1F5F7A"/></linearGradient>
      <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#FFF1C9"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1200" height="600" fill="url(#sky)"/>
    <circle cx="640" cy="330" r="120" fill="url(#sun)"/>
    <rect y="350" width="1200" height="130" fill="url(#sea)"/>
    ${[372, 395, 420, 448].map((y, i) => `<rect x="${520 - i * 30}" y="${y}" width="${240 + i * 60}" height="4" rx="2" fill="#FFE2A8" opacity="${0.7 - i * 0.12}"/>`).join("")}
    <path d="M0 470 C 300 440, 700 500, 1200 455 L 1200 600 L 0 600 Z" fill="#E9C89A"/>
    <path d="M0 520 C 400 495, 800 545, 1200 510 L 1200 600 L 0 600 Z" fill="#DDB583"/>
    ${palms}
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

export async function seedDemo(): Promise<{ goaId: string; flatId: string; roomCode: string }> {
  await removeDemo();

  // Accounts, signed in, profiles complete (onboarded, phone, UPI).
  const c = {} as Record<Who, SupabaseClient>;
  const uid = {} as Record<Who, string>;
  for (const p of DEMO_PEOPLE) {
    const created = must(await admin.auth.admin.createUser({ email: p.email, email_confirm: true, user_metadata: { full_name: p.name } }), `create ${p.key}`);
    uid[p.key] = created.user!.id;
    c[p.key] = await signedIn(p.email);
    must(
      await c[p.key]
        .from("profiles")
        .update({ name: p.name, avatar_color: p.color, upi_id: p.upi, default_currency: "INR", onboarded_at: new Date().toISOString() })
        .eq("id", uid[p.key]),
      `profile ${p.key}`,
    );
    must(await c[p.key].rpc("set_my_phone", { p_phone: p.phone }), `phone ${p.key}`);
  }

  // Groups.
  const goaId = must(await c.vansh.rpc("create_group", { p_name: "Goa Trip", p_emoji: "🏝️", p_color: "sky", p_base_currency: "INR", p_type: "trip" }), "create Goa");
  const flatId = must(await c.aman.rpc("create_group", { p_name: "Flat 4B", p_emoji: "🏠", p_color: "mint", p_base_currency: "INR", p_type: "home" }), "create Flat");
  const join = async (gid: string, who: Who[]) => {
    const { data: inv } = await admin.from("invites").select("token").eq("group_id", gid).is("ghost_member_id", null).is("revoked_at", null).maybeSingle();
    const token = inv?.token ?? must(await c.vansh.rpc("regenerate_invite", { p_group_id: gid }), "invite");
    for (const w of who) must(await c[w].rpc("join_group", { p_token: token }), `join ${w}`);
  };
  await join(goaId, ["aman", "priya", "kabir"]);
  await join(flatId, ["vansh", "kabir"]);
  const memberIds = async (gid: string) => {
    const { data } = await admin.from("group_members").select("id, user_id").eq("group_id", gid);
    const byUser = new Map((data ?? []).map((m) => [m.user_id as string, m.id as string]));
    return Object.fromEntries(DEMO_PEOPLE.map((p) => [p.key, byUser.get(uid[p.key]) ?? ""])) as Record<Who, string>;
  };
  const goa = await memberIds(goaId);
  const flat = await memberIds(flatId);

  // Goa cover (admins only: Vansh created the group).
  const file = `${goaId}/${randomUUID()}.webp`;
  must(await admin.storage.from("group-covers").upload(file, await coverWebp(), { contentType: "image/webp", upsert: false }), "upload cover");
  must(await c.vansh.rpc("set_group_cover", { p_group_id: goaId, p_url: `${URL_}/storage/v1/object/public/group-covers/${file}` }), "set cover");

  // Expenses (amounts in paise; lines in the group's base currency).
  type Exp = { by: Who; gid: string; m: Record<Who, string>; title: string; total: number; cat: string; day: number; split: Who[]; currency?: string; amount?: number; rate?: string };
  const add = async (e: Exp) => {
    const lines = equal(e.total, e.split.map((w) => e.m[w]));
    return must(
      await c[e.by].rpc("create_expense", {
        p_group_id: e.gid,
        p_title: e.title,
        p_amount: e.amount ?? e.total,
        p_currency: e.currency ?? "INR",
        p_fx_rate: e.rate ?? "1",
        p_category: e.cat,
        p_date: daysAgo(e.day),
        p_note: null,
        p_split_type: "equal",
        p_payers: [{ member_id: e.m[e.by], amount: e.total }],
        p_splits: lines,
        p_client_id: randomUUID(),
      }),
      `expense ${e.title}`,
    ) as string;
  };
  const all: Who[] = ["vansh", "aman", "priya", "kabir"];
  const villa = await add({ by: "vansh", gid: goaId, m: goa, title: "Villa in Anjuna", total: rupees(48000), cat: "stay", day: 4, split: all });
  const dinner = await add({ by: "aman", gid: goaId, m: goa, title: "Beach shack dinner", total: rupees(6840), cat: "food", day: 3, split: all });
  await add({ by: "priya", gid: goaId, m: goa, title: "Cab to Baga", total: rupees(1250), cat: "travel", day: 3, split: all });
  await add({ by: "kabir", gid: goaId, m: goa, title: "Groceries", total: rupees(3465), cat: "groceries", day: 2, split: ["vansh", "priya", "kabir"] });
  // $180 at a locked ₹83.42: base = 18000 × 83.42 = 1,501,560 paise.
  await add({ by: "vansh", gid: goaId, m: goa, title: "Scuba diving", total: 1501560, amount: 18000, currency: "USD", rate: "83.42", cat: "entertainment", day: 1, split: ["vansh", "aman", "priya"] });
  await add({ by: "aman", gid: flatId, m: flat, title: "October rent", total: rupees(45000), cat: "rent", day: 5, split: ["vansh", "aman", "kabir"] });
  await add({ by: "vansh", gid: flatId, m: flat, title: "Wi-Fi", total: rupees(1180), cat: "utilities", day: 4, split: ["vansh", "aman", "kabir"] });
  await add({ by: "kabir", gid: flatId, m: flat, title: "Groceries", total: rupees(2140), cat: "groceries", day: 2, split: ["vansh", "aman", "kabir"] });

  // One settlement: Kabir paid Vansh ₹2,000 by UPI; Vansh confirmed it.
  const sid = must(
    await c.kabir.rpc("record_settlement", { p_group_id: goaId, p_from_member: goa.kabir, p_to_member: goa.vansh, p_amount: rupees(2000), p_method: "upi", p_client_id: randomUUID() }),
    "settlement",
  ) as string;
  must(await c.vansh.rpc("confirm_settlement", { p_settlement_id: sid }), "confirm");

  // Reactions and comments.
  const react = async (w: Who, id: string, emoji: string) => must(await c[w].rpc("toggle_reaction", { p_entity_type: "expense", p_entity_id: id, p_emoji: emoji }), "react");
  const comment = async (w: Who, id: string, body: string) =>
    must(await c[w].rpc("add_comment", { p_entity_type: "expense", p_entity_id: id, p_body: body, p_client_id: randomUUID() }), "comment");
  await react("aman", villa, "🔥");
  await react("priya", villa, "💸");
  await react("kabir", dinner, "😭");
  await comment("priya", villa, "the pool alone was worth it");
  await comment("aman", villa, "sunset view 🔥 no notes");
  await comment("kabir", dinner, "who ordered the third round of prawns");
  must(await c.vansh.rpc("toggle_reaction", { p_entity_type: "settlement", p_entity_id: sid, p_emoji: "🙏" }), "react settlement");

  // A nudge from Vansh to whoever owes him the most (shows the cooldown on Balances).
  const { data: bal } = await admin.from("group_balances").select("member_id, net").eq("group_id", goaId);
  const nets = new Map((bal ?? []).map((b) => [b.member_id as string, Number(b.net)]));
  const myNet = nets.get(goa.vansh) ?? 0;
  const debtor = (["aman", "priya", "kabir"] as Who[]).sort((a, b) => (nets.get(goa[a]) ?? 0) - (nets.get(goa[b]) ?? 0))[0];
  const owed = -(nets.get(goa[debtor]) ?? 0);
  if (myNet > 0 && owed > 0) must(await c.vansh.rpc("send_nudge", { p_to_member: goa[debtor], p_amount: Math.min(owed, myNet), p_template: 0 }), "nudge");

  // An open Split Room, partly claimed.
  const room = must(await c.vansh.rpc("create_room", { p_group_id: goaId, p_name: "Thalassa dinner" }), "room") as { id: string; code: string };
  const items = [
    ["Calamari fritti", 640, 1],
    ["Prawn curry", 780, 1],
    ["Fish thali", 520, 2],
    ["Garlic naan", 90, 4],
    ["Feni cocktail", 450, 3],
    ["Kingfisher", 220, 4],
    ["Bebinca", 340, 1],
    ["Fresh lime soda", 120, 2],
  ].map(([name, price, qty]) => ({ id: randomUUID(), name, price: rupees(price as number), qty }));
  must(
    await c.vansh.rpc("upsert_items", {
      p_room_id: room.id,
      p_items: items,
      p_charges: { tax: { kind: "percent", value: 500 }, service: { kind: "percent", value: 1000 }, tip: { kind: "percent", value: 0 } },
      p_name: "Thalassa dinner",
    }),
    "room items",
  );
  for (const w of ["aman", "priya", "kabir"] as Who[]) must(await c[w].rpc("join_room", { p_code: room.code }), `join room ${w}`);
  const claim = async (w: Who, i: number) => must(await c[w].rpc("toggle_claim", { p_item_id: items[i].id, p_on: true }), "claim");
  await claim("vansh", 1); // prawn curry
  await claim("vansh", 4); // feni
  await claim("aman", 0); // calamari
  await claim("aman", 5); // kingfisher
  await claim("priya", 2); // fish thali
  await claim("priya", 7); // lime soda
  await claim("kabir", 4); // feni (shared)
  await claim("kabir", 5); // kingfisher (shared)
  // Garlic naan and Bebinca stay unclaimed (they glow in the room).

  for (const k of Object.keys(c) as Who[]) await c[k].auth.signOut().catch(() => undefined);
  console.log(`Demo ready: Goa Trip (${goaId}), Flat 4B (${flatId}), Split Room ${room.code}. Sign in as ${DEMO_EMAIL} (via scripts/capture-screenshots.mts).`);
  return { goaId, flatId, roomCode: room.code };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const run = process.argv.includes("--remove") ? removeDemo() : seedDemo();
  run.catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
