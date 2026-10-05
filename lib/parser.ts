/**
 * Command bar grammar (PRD › Command bar). Pure TypeScript, no AI, never throws.
 *
 *   dinner 2400                    Dinner, ₹2,400, paid by me, split equally with the whole group
 *   dinner 2400 me aman rahul      split equally between me, Aman, Rahul
 *   cab 600 paid by rahul          Rahul paid, split with the whole group
 *   hotel $120 split 3             USD, split with 3 people (me + recent), asks to confirm
 *   snacks 300 aman 200 me 100     exact split
 *   … in goa trip                  picks the group by fuzzy name
 *
 * Also: ₹ $ € £ A$ and INR/USD/AUD/EUR/GBP/Rs (before or after), decimals, 1,200 / 1,24,000,
 * "k" (2.5k), "paid by <name>", "split <n>", "split with …", category keywords.
 * Names match first name, nickname, full name or initials; "me"/"I" is the current user.
 * Anything uncertain comes back as an issue with candidates instead of a guess.
 */
import { isCategory, type Category } from "@/lib/categories";
import { newDraft, type ExpenseDraft } from "@/lib/expense-form";
import { fromMinor, toMinor, type CurrencyCode } from "@/lib/money";

export interface ParseMember {
  id: string;
  name: string;
  nickname?: string | null;
  isMe?: boolean;
}

export interface ParseGroup {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** Active members. */
  members: ParseMember[];
  /** Most recently active member ids, newest first (for "split 3"). Defaults to member order. */
  recent?: string[];
}

export interface ParseContext {
  groups: ParseGroup[];
  /** Group to use when the text has no "in <group>". */
  currentGroupId?: string | null;
  /** Tokens the user already fixed in the picker: lowercase token → member/group id. */
  resolved?: Record<string, string>;
}

export type ParsedSplit =
  | { kind: "everyone"; memberIds: string[] }
  | { kind: "equal"; memberIds: string[] }
  | { kind: "exact"; parts: { memberId: string; amount: number }[] }
  | { kind: "first-n"; count: number; memberIds: string[] };

export type IssueField = "group" | "amount" | "title" | "payer" | "split";

export interface ParseIssue {
  field: IssueField;
  /** The word in the text this is about (lowercase), when there is one. */
  token?: string;
  message: string;
  /** Pick one of these to fix it. */
  candidates?: { id: string; label: string }[];
  /** Blocks saving (vs. just worth a look). */
  blocking: boolean;
}

export interface ParsedExpense {
  groupId: string | null;
  groupFromText: boolean;
  title: string;
  /** Minor units of `currency`. */
  amount: number | null;
  currency: CurrencyCode;
  currencyExplicit: boolean;
  category: Category;
  payerId: string | null;
  split: ParsedSplit;
  issues: ParseIssue[];
  /** "split 3" picked people for you: confirm before saving. */
  needsConfirm: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Words
 * --------------------------------------------------------------------------------------------- */

const ME = new Set(["me", "i", "myself", "mine"]);
const FILLER = new Set(["with", "and", "&", "between", "among", "amongst", "for", "+", ",", "the"]);
const CURRENCY_WORDS: Record<string, CurrencyCode> = {
  "₹": "INR",
  rs: "INR",
  "rs.": "INR",
  inr: "INR",
  rupees: "INR",
  "$": "USD",
  usd: "USD",
  dollars: "USD",
  "us$": "USD",
  "a$": "AUD",
  "au$": "AUD",
  aud: "AUD",
  "€": "EUR",
  eur: "EUR",
  euros: "EUR",
  "£": "GBP",
  gbp: "GBP",
  pounds: "GBP",
};

const CATEGORY_WORDS: Record<string, Category> = {};
const categoryList: [Category, string[]][] = [
  ["food", ["dinner", "lunch", "breakfast", "brunch", "food", "snacks", "snack", "pizza", "burger", "biryani", "chai", "coffee", "tea", "drinks", "beer", "restaurant", "cafe", "dessert", "icecream", "swiggy", "zomato", "dosa", "momos", "maggi"]],
  ["travel", ["cab", "uber", "ola", "taxi", "auto", "rickshaw", "flight", "flights", "train", "bus", "metro", "fuel", "petrol", "diesel", "toll", "parking", "travel", "scooty", "scooter", "bike", "rapido"]],
  ["stay", ["hotel", "airbnb", "hostel", "stay", "room", "resort", "villa", "homestay"]],
  ["groceries", ["groceries", "grocery", "vegetables", "veggies", "milk", "blinkit", "zepto", "bigbasket", "instamart", "supermarket", "dmart"]],
  ["rent", ["rent", "deposit", "maintenance"]],
  ["utilities", ["electricity", "wifi", "internet", "water", "gas", "bill", "bills", "utilities", "recharge", "broadband", "cylinder"]],
  ["entertainment", ["movie", "movies", "cinema", "concert", "tickets", "ticket", "party", "club", "bowling", "game", "games", "show"]],
  ["shopping", ["shopping", "clothes", "amazon", "flipkart", "myntra", "gift", "gifts", "shoes"]],
  ["subscriptions", ["netflix", "spotify", "subscription", "prime", "hotstar", "youtube", "icloud", "chatgpt"]],
];
for (const [cat, words] of categoryList) for (const w of words) CATEGORY_WORDS[w] = cat;

export function categoryFor(words: string[]): Category {
  for (const w of words) {
    const c = CATEGORY_WORDS[w.toLowerCase().replace(/[^a-z]/g, "")];
    if (c && isCategory(c)) return c;
  }
  return "other";
}

/* ------------------------------------------------------------------------------------------------
 * Amounts
 * --------------------------------------------------------------------------------------------- */

const AMOUNT = /^(₹|rs\.?|inr|us\$|a\$|au\$|\$|€|£|usd|aud|eur|gbp)?(\d{1,3}(?:,\d{2,3})+|\d+)?(?:\.(\d{1,2}))?(k)?(₹|rs\.?|inr|usd|aud|eur|gbp|\$|€|£)?$/i;

export interface AmountToken {
  minor: number;
  currency: CurrencyCode | null;
}

/** "2400", "₹2,400", "$120.50", "2.5k", "A$40", "300usd". Null if not an amount. */
export function parseAmountToken(token: string, fallback: CurrencyCode = "INR"): AmountToken | null {
  const m = AMOUNT.exec(token.trim());
  if (!m || (!m[2] && !m[3])) return null;
  const [, pre, whole = "0", frac, k, post] = m;
  if (pre && post) return null;
  const sym = (pre ?? post)?.toLowerCase();
  const currency = sym ? CURRENCY_WORDS[sym] ?? null : null;
  const digits = whole.replace(/,/g, "");
  if (digits.length > 13) return null;
  try {
    let minor = toMinor(frac ? `${digits}.${frac}` : digits, currency ?? fallback);
    if (k) minor *= BigInt(1000);
    if (minor <= BigInt(0) || minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { minor: Number(minor), currency };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Fuzzy matching
 * --------------------------------------------------------------------------------------------- */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "").trim();

type MemberMatch = { kind: "one"; id: string } | { kind: "many"; ids: string[] } | { kind: "none" };

/** Match one word to a member: exact first name / nickname / full name / initials, then prefix, then typo. */
export function matchMember(token: string, members: ParseMember[]): MemberMatch {
  const t = norm(token);
  if (!t) return { kind: "none" };
  if (ME.has(t)) {
    const me = members.find((m) => m.isMe);
    return me ? { kind: "one", id: me.id } : { kind: "none" };
  }
  const info = members.map((m) => {
    const words = norm(m.name).split(/\s+/).filter(Boolean);
    return {
      id: m.id,
      first: words[0] ?? "",
      full: words.join(""),
      nick: m.nickname ? norm(m.nickname) : null,
      initials: words.map((w) => w[0]).join(""),
    };
  });
  const pick = (ids: string[]): MemberMatch | null => (ids.length === 1 ? { kind: "one", id: ids[0] } : ids.length > 1 ? { kind: "many", ids } : null);

  const exact = info.filter((m) => m.first === t || m.full === t || m.nick === t).map((m) => m.id);
  const byExact = pick([...new Set(exact)]);
  if (byExact) return byExact;
  // Initials and name prefixes compete: "an" could be Arjun Nair (A.N.) or Ankit. If they point at
  // different people, ask instead of guessing.
  if (t.length >= 2) {
    const byInitials = t.length <= 3 ? info.filter((m) => m.initials.length > 1 && m.initials === t).map((m) => m.id) : [];
    const byPrefix = info.filter((m) => m.first.startsWith(t) || (m.nick?.startsWith(t) ?? false)).map((m) => m.id);
    const either = pick([...new Set([...byInitials, ...byPrefix])]);
    if (either) return either;
  }
  if (t.length >= 4) {
    const max = t.length >= 7 ? 2 : 1;
    const byTypo = pick(info.filter((m) => levenshtein(t, m.first) <= max || (m.nick !== null && levenshtein(t, m.nick) <= max)).map((m) => m.id));
    if (byTypo) return byTypo;
  }
  return { kind: "none" };
}

/** Score a group name against words (1 = exact). */
function groupScore(words: string[], name: string): number {
  const q = norm(words.join(" "));
  const n = norm(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.startsWith(q) && q.length >= 3) return 0.9;
  const nWords = n.split(/\s+/);
  const qWords = q.split(/\s+/);
  if (qWords.every((w) => nWords.some((nw) => nw.startsWith(w) && w.length >= 2))) return 0.8;
  const d = levenshtein(q.replace(/\s+/g, ""), n.replace(/\s+/g, ""));
  return d <= Math.max(1, Math.floor(n.length / 5)) ? 0.7 : 0;
}

export function matchGroup(words: string[], groups: ParseGroup[]): { kind: "one"; group: ParseGroup; score: number } | { kind: "many"; groups: ParseGroup[] } | { kind: "none" } {
  const scored = groups.map((g) => ({ g, s: groupScore(words, g.name) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (scored.length === 0) return { kind: "none" };
  const top = scored.filter((x) => x.s === scored[0].s);
  return top.length === 1 ? { kind: "one", group: top[0].g, score: top[0].s } : { kind: "many", groups: top.map((x) => x.g) };
}

/* ------------------------------------------------------------------------------------------------
 * Parse
 * --------------------------------------------------------------------------------------------- */

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const KEYWORDS = new Set(["paid", "by", "split", "in", "ways"]);

export function parseCommand(text: string, ctx: ParseContext): ParsedExpense {
  try {
    return parseUnsafe(text, ctx);
  } catch {
    const g = ctx.groups.find((x) => x.id === ctx.currentGroupId) ?? null;
    return {
      groupId: g?.id ?? null,
      groupFromText: false,
      title: "",
      amount: null,
      currency: g?.currency ?? "INR",
      currencyExplicit: false,
      category: "other",
      payerId: g?.members.find((m) => m.isMe)?.id ?? null,
      split: { kind: "everyone", memberIds: g?.members.map((m) => m.id) ?? [] },
      issues: [{ field: "amount", message: "Couldn't read that. Try “dinner 2400”.", blocking: true }],
      needsConfirm: false,
    };
  }
}

function parseUnsafe(text: string, ctx: ParseContext): ParsedExpense {
  const raw = text.replace(/\s+/g, " ").trim().slice(0, 300);
  // Split "300," / "aman," and attached symbols off words ("₹ 300" stays two tokens and is rejoined below).
  const original = raw.split(" ").flatMap((t) => t.split(/(?<=\S),(?=\s|$)/)).filter(Boolean);
  const lower = original.map((t) => t.toLowerCase());
  const used = original.map(() => false);
  const issues: ParseIssue[] = [];
  const resolved = Object.fromEntries(Object.entries(ctx.resolved ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

  // 1. "in <group>" — longest group name match after "in", stopping at keywords/amounts.
  let group = ctx.groups.find((g) => g.id === ctx.currentGroupId) ?? null;
  let groupFromText = false;
  for (let i = 0; i < lower.length; i++) {
    if (lower[i] !== "in" || used[i]) continue;
    const span: string[] = [];
    for (let j = i + 1; j < lower.length && !KEYWORDS.has(lower[j]) && !parseAmountToken(lower[j]); j++) span.push(lower[j]);
    if (!span.length) continue;
    const forced = resolved[span.join(" ")];
    const forcedGroup = forced ? ctx.groups.find((g) => g.id === forced) : undefined;
    let best: { len: number; group: ParseGroup } | null = forcedGroup ? { len: span.length, group: forcedGroup } : null;
    let ambiguous: ParseGroup[] | null = null;
    for (let len = span.length; len >= 1 && !best; len--) {
      const m = matchGroup(span.slice(0, len), ctx.groups);
      if (m.kind === "one" && m.score >= 0.7) best = { len, group: m.group };
      else if (m.kind === "many" && !ambiguous) ambiguous = m.groups;
    }
    if (best) {
      group = best.group;
      groupFromText = true;
      for (let k = i; k <= i + best.len; k++) used[k] = true;
      break;
    }
    if (ambiguous) {
      for (let k = i; k <= i + span.length; k++) used[k] = true;
      issues.push({
        field: "group",
        token: span.join(" "),
        message: `Which group is “${span.join(" ")}”?`,
        candidates: ambiguous.map((g) => ({ id: g.id, label: g.name })),
        blocking: true,
      });
      break;
    }
  }

  const currencyDefault = group?.currency ?? "INR";
  const members = group?.members ?? [];
  const me = members.find((m) => m.isMe) ?? null;
  const memberLabel = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

  const resolveName = (token: string, field: IssueField): string | null => {
    if (resolved[token] && members.some((m) => m.id === resolved[token])) return resolved[token];
    const m = matchMember(token, members);
    if (m.kind === "one") return m.id;
    if (m.kind === "many") {
      issues.push({
        field,
        token,
        message: `Which “${token}”?`,
        candidates: m.ids.map((id) => ({ id, label: memberLabel(id) })),
        blocking: true,
      });
      return null;
    }
    issues.push({
      field,
      token,
      message: `Who is “${token}”?`,
      candidates: members.map((x) => ({ id: x.id, label: x.isMe ? "You" : x.name })),
      blocking: true,
    });
    return null;
  };

  // 2. "paid by <name>"
  let payerId: string | null = me?.id ?? null;
  for (let i = 0; i < lower.length - 1; i++) {
    if (used[i] || lower[i] !== "paid" || lower[i + 1] !== "by") continue;
    used[i] = used[i + 1] = true;
    const name = lower[i + 2];
    if (name && !used[i + 2]) {
      used[i + 2] = true;
      payerId = resolveName(name, "payer");
    } else {
      issues.push({ field: "payer", message: "Who paid?", candidates: members.map((x) => ({ id: x.id, label: x.isMe ? "You" : x.name })), blocking: true });
      payerId = null;
    }
    break;
  }

  // 3. "split <n> [ways]" / "split with …"
  let splitCount: number | null = null;
  for (let i = 0; i < lower.length; i++) {
    if (used[i] || lower[i] !== "split") continue;
    used[i] = true;
    const n = lower[i + 1];
    if (n && /^\d{1,2}$/.test(n)) {
      used[i + 1] = true;
      splitCount = Number(n);
      if (lower[i + 2] === "ways" || lower[i + 2] === "people") used[i + 2] = true;
    } else if (n === "with") used[i + 1] = true;
    break;
  }

  // 4. Main amount: the first amount, optionally with a separate currency word before/after.
  let amount: number | null = null;
  let currency: CurrencyCode = currencyDefault;
  let currencyExplicit = false;
  let amountIndex = -1;
  const currencyWord = (i: number) => (i >= 0 && i < lower.length && !used[i] ? CURRENCY_WORDS[lower[i]] ?? null : null);
  for (let i = 0; i < lower.length; i++) {
    if (used[i]) continue;
    const tok = parseAmountToken(lower[i], currencyDefault);
    if (!tok) continue;
    let cur = tok.currency;
    if (!cur && currencyWord(i + 1)) {
      cur = currencyWord(i + 1);
      used[i + 1] = true;
    } else if (!cur && currencyWord(i - 1)) {
      cur = currencyWord(i - 1);
      used[i - 1] = true;
    }
    const reparsed = cur && cur !== currencyDefault ? parseAmountToken(lower[i], cur) : tok;
    amount = reparsed?.minor ?? tok.minor;
    currency = cur ?? currencyDefault;
    currencyExplicit = !!cur;
    amountIndex = i;
    used[i] = true;
    break;
  }

  // 5. After the amount: names, optionally each followed by its own amount (exact split).
  const named: { id: string | null; token: string; amount: number | null }[] = [];
  const titleAfter: number[] = [];
  const startNames = amountIndex >= 0 ? amountIndex + 1 : lower.length;
  // "2400 dinner": words after the amount are the title only when nothing before it is.
  const hasTitleBefore = lower.some((w, i) => i < startNames - 1 && !used[i] && !FILLER.has(w));
  for (let i = startNames; i < lower.length; i++) {
    if (used[i] || FILLER.has(lower[i])) continue;
    const tok = parseAmountToken(lower[i], currency);
    if (tok) {
      used[i] = true;
      const last = named[named.length - 1];
      if (last && last.amount === null) last.amount = tok.minor;
      else issues.push({ field: "split", token: lower[i], message: `Whose share is ${original[i]}?`, blocking: true });
      continue;
    }
    if (CURRENCY_WORDS[lower[i]]) {
      used[i] = true;
      continue;
    }
    const isName = ME.has(lower[i]) || !!resolved[lower[i]] || matchMember(lower[i], members).kind !== "none";
    if (!isName && named.length === 0 && !hasTitleBefore) {
      titleAfter.push(i);
      used[i] = true;
      continue;
    }
    used[i] = true;
    const before = issues.length;
    const id = resolveName(lower[i], "split");
    if (id === null && issues.length > before) issues[issues.length - 1].token = lower[i];
    named.push({ id, token: lower[i], amount: null });
  }

  // 6. Title: unused words before the amount (else the words right after it).
  const titleWords = original.filter((_, i) => !used[i] && i < (amountIndex >= 0 ? amountIndex : lower.length) && !FILLER.has(lower[i]));
  const titleSource = titleWords.length ? titleWords : titleAfter.map((i) => original[i]);
  const title = capitalize(titleSource.join(" ").trim()).slice(0, 80);
  const category = categoryFor(titleSource);

  // 7. Split
  const everyone = members.map((m) => m.id);
  let split: ParsedSplit = { kind: "everyone", memberIds: everyone };
  let needsConfirm = false;
  const withAmounts = named.filter((n) => n.amount !== null);
  if (withAmounts.length > 0) {
    if (withAmounts.length !== named.length) {
      issues.push({ field: "split", message: "Give everyone an amount, or nobody (for an equal split).", blocking: true });
    }
    const parts = named.filter((n) => n.id && n.amount !== null).map((n) => ({ memberId: n.id!, amount: n.amount! }));
    split = { kind: "exact", parts };
    const sum = withAmounts.reduce((a, n) => a + (n.amount ?? 0), 0);
    if (amount !== null && sum !== amount) {
      issues.push({
        field: "split",
        message: `Shares add up to ${fmt(sum, currency)}, not ${fmt(amount, currency)}.`,
        blocking: true,
      });
    }
  } else if (named.length > 0) {
    split = { kind: "equal", memberIds: [...new Set(named.map((n) => n.id).filter((x): x is string => !!x))] };
  } else if (splitCount !== null) {
    if (splitCount < 1 || splitCount > members.length) {
      issues.push({ field: "split", message: `There ${members.length === 1 ? "is" : "are"} only ${members.length} in this group.`, blocking: true });
      split = { kind: "first-n", count: splitCount, memberIds: everyone };
    } else {
      const recent = (group?.recent ?? everyone).filter((id) => id !== me?.id && everyone.includes(id));
      const others = [...recent, ...everyone.filter((id) => id !== me?.id && !recent.includes(id))];
      const ids = [...(me ? [me.id] : []), ...others].slice(0, splitCount);
      split = { kind: "first-n", count: splitCount, memberIds: ids };
      needsConfirm = true;
    }
  }

  // 8. What's missing
  if (!group) issues.push({ field: "group", message: "Which group?", candidates: ctx.groups.map((g) => ({ id: g.id, label: g.name })), blocking: true });
  if (amount === null) issues.push({ field: "amount", message: "How much? e.g. “dinner 2400”.", blocking: true });
  if (!title) issues.push({ field: "title", message: "What was it for?", blocking: true });
  if (group && !me && payerId === null && !issues.some((x) => x.field === "payer")) {
    issues.push({ field: "payer", message: "Who paid?", candidates: members.map((x) => ({ id: x.id, label: x.name })), blocking: true });
  }

  return {
    groupId: group?.id ?? null,
    groupFromText,
    title,
    amount,
    currency,
    currencyExplicit,
    category,
    payerId,
    split,
    issues,
    needsConfirm,
  };
}

function fmt(minor: number, currency: CurrencyCode): string {
  return `${currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "A$"}${fromMinor(minor, currency).replace(/\.00$/, "")}`;
}

export const canSaveParsed = (p: ParsedExpense) => !p.issues.some((i) => i.blocking) && p.amount !== null && !!p.groupId;

/**
 * The parsed expense as an Add Expense draft (Tab opens the full sheet with it; Enter saves it
 * through the same evaluateDraft → create_expense path, so every rule is enforced once).
 */
export function parsedToDraft(p: ParsedExpense, group: ParseGroup, today?: string): ExpenseDraft {
  const ids = group.members.map((m) => m.id);
  const me = group.members.find((m) => m.isMe)?.id ?? ids[0] ?? "";
  const d = newDraft(ids, me, today, group.currency);
  const major = (minor: number) => fromMinor(minor, p.currency).replace(/\.00$/, "");
  const base: ExpenseDraft = {
    ...d,
    title: p.title,
    amount: p.amount ?? 0,
    category: p.category,
    payerId: p.payerId ?? me,
    currency: p.currency,
    rate: p.currency === group.currency ? "1" : "",
    rateSource: "auto",
  };
  switch (p.split.kind) {
    case "everyone":
      return { ...base, included: ids };
    case "equal":
    case "first-n":
      return { ...base, included: p.split.memberIds.length ? p.split.memberIds : ids };
    case "exact":
      return {
        ...base,
        splitType: "exact",
        included: p.split.parts.map((x) => x.memberId),
        exact: Object.fromEntries(p.split.parts.map((x) => [x.memberId, major(x.amount)])),
      };
  }
}
