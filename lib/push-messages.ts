import { formatAmountShort, isCurrencyCode, type CurrencyCode } from "@/lib/money";
import { nudgeText } from "@/lib/nudges";

/**
 * Who gets a push for an activity row, and what it says. Pure: the webhook route loads the rows,
 * this decides. Rules (Milestone 8, expense rules 0012):
 *  • expense_created      → everyone with a share: "you owe ₹600" / "you get back ₹1,800", "money"
 *  • expense_updated      → people whose share changed (and who are still in it): "your share is now ₹800"
 *  • expense_deleted      → everyone who had a share: "Aman deleted Dinner"
 *  • settlement_recorded  → the other side of the payment, "money"
 *  • settlement_confirmed / _disputed → whoever paid, "money"
 *  • comment_added        → everyone in that expense / payment, "all" only
 *  • nudge_sent           → the person nudged, "money"
 *  • ghost_claimed        → whoever added that ghost (else the admins): "Rahul joined Goa Trip"
 * Never the actor (nor anyone signed in as the actor), never ghosts or people who left, and each
 * member's group setting: all / money (money kinds only) / off.
 */

export type NotifyLevel = "all" | "money" | "off";

export interface PushMember {
  id: string;
  user_id: string | null;
  display_name: string;
  notify_level: NotifyLevel;
  left_at: string | null;
  role?: string;
}

export interface PushContext {
  group: { id: string; name: string; emoji: string; base_currency: CurrencyCode };
  members: PushMember[];
  /** expense_created / comment on an expense */
  expense?: { id: string; title: string; amount_base?: number; payers: { member_id: string; amount_base: number }[]; splits: { member_id: string; amount_base: number }[] } | null;
  /** settlement_* / comment on a settlement */
  settlement?: { id: string; from_member: string; to_member: string; amount_base: number } | null;
}

export interface ActivityRecord {
  id: string;
  group_id: string;
  actor_member: string | null;
  kind: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
}

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  url: string;
  /** Same tag replaces an older notification for the same thing. */
  tag: string;
}

export const PUSH_KINDS = ["expense_created", "expense_updated", "expense_deleted", "settlement_recorded", "settlement_confirmed", "settlement_disputed", "comment_added", "nudge_sent", "ghost_claimed"] as const;
const MONEY_KINDS = new Set(["expense_created", "expense_updated", "expense_deleted", "settlement_recorded", "settlement_confirmed", "settlement_disputed", "nudge_sent"]);

const first = (n: string) => n.trim().split(/\s+/)[0] || n;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

/** What the comment / nudge is about: the entity whose people get notified. */
export function commentTarget(a: ActivityRecord): { type: "expense" | "settlement"; id: string } | null {
  const type = str(a.payload.entity_type);
  const id = str(a.payload.entity_id);
  return (type === "expense" || type === "settlement") && id ? { type, id } : null;
}

/** previous_splits from the expense_updated payload: member id → share before the edit. */
function previousShares(v: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const n = num(x);
      if (Number.isFinite(n)) out.set(k, n);
    }
  }
  return out;
}

export function pushMessages(a: ActivityRecord, ctx: PushContext): PushMessage[] {
  const byId = new Map(ctx.members.map((m) => [m.id, m]));
  const actor = a.actor_member ? byId.get(a.actor_member) : undefined;
  const who = first(actor?.display_name ?? "Someone");
  const cur = ctx.group.base_currency;
  const money = (minor: number) => formatAmountShort(minor, cur);
  const title = `Settld · ${ctx.group.name}`;
  const groupUrl = `/g/${ctx.group.id}`;
  const open = (what: string) => `${groupUrl}?open=${encodeURIComponent(what)}`;

  const expenseMembers = (e: NonNullable<PushContext["expense"]>) =>
    new Set([...e.payers.map((p) => p.member_id), ...e.splits.filter((s) => s.amount_base > 0).map((s) => s.member_id)]);

  // [member id, body, url]
  let targets: [string, string, string][] = [];
  switch (a.kind) {
    case "expense_created": {
      const e = ctx.expense;
      if (!e) return [];
      const total = e.amount_base ?? e.payers.reduce((t, p) => t + p.amount_base, 0);
      targets = e.splits
        .filter((x) => x.amount_base > 0)
        .map((x) => {
          const paid = e.payers.filter((p) => p.member_id === x.member_id).reduce((t, p) => t + p.amount_base, 0);
          const net = paid - x.amount_base;
          const mine = net > 0 ? `you get back ${money(net)}` : net < 0 ? `you owe ${money(-net)}` : `your share ${money(x.amount_base)}`;
          return [x.member_id, `${who} added ${e.title} · ${money(total)} · ${mine}`, open(`expense:${e.id}`)];
        });
      break;
    }
    case "expense_updated": {
      const e = ctx.expense;
      if (!e) return [];
      const before = previousShares(a.payload.previous_splits);
      targets = e.splits
        .filter((x) => x.amount_base > 0 && before.get(x.member_id) !== x.amount_base)
        .map((x) => [x.member_id, `${who} changed ${e.title} · your share is now ${money(x.amount_base)}`, open(`expense:${e.id}`)]);
      break;
    }
    case "expense_deleted": {
      const e = ctx.expense;
      if (!e) return [];
      targets = e.splits.filter((x) => x.amount_base > 0).map((x) => [x.member_id, `${who} deleted ${e.title}`, `${groupUrl}?tab=activity`]);
      break;
    }
    case "settlement_recorded": {
      const s = ctx.settlement;
      if (!s) return [];
      if (a.actor_member === s.to_member) targets = [[s.from_member, `${who} recorded your ${money(s.amount_base)} payment`, open(`settlement:${s.id}`)]];
      else targets = [[s.to_member, `${who} paid you ${money(s.amount_base)}`, open(`settlement:${s.id}`)]];
      break;
    }
    case "settlement_confirmed":
    case "settlement_disputed": {
      const s = ctx.settlement;
      if (!s) return [];
      targets = [
        [
          s.from_member,
          a.kind === "settlement_confirmed" ? `${who} confirmed your ${money(s.amount_base)} payment ✓` : `${who} says they didn't get your ${money(s.amount_base)}`,
          open(`settlement:${s.id}`),
        ],
      ];
      break;
    }
    case "comment_added": {
      const target = commentTarget(a);
      const body = str(a.payload.body) ?? "";
      const quote = body.length > 90 ? `${body.slice(0, 89)}…` : body;
      if (target?.type === "expense" && ctx.expense) {
        targets = [...expenseMembers(ctx.expense)].map((m) => [m, `${who} on ${ctx.expense!.title}: “${quote}”`, open(`expense:${ctx.expense!.id}`)]);
      } else if (target?.type === "settlement" && ctx.settlement) {
        const s = ctx.settlement;
        targets = [s.from_member, s.to_member].map((m) => [m, `${who} on a payment: “${quote}”`, open(`settlement:${s.id}`)]);
      }
      break;
    }
    case "nudge_sent": {
      const to = str(a.payload.to_member);
      const amount = num(a.payload.amount);
      const currency = str(a.payload.base_currency);
      if (!to || !Number.isFinite(amount)) return [];
      const text = nudgeText({
        level: num(a.payload.level) || 1,
        template: num(a.payload.template) || 0,
        name: byId.get(to)?.display_name ?? str(a.payload.to_name) ?? "",
        from: actor?.display_name ?? "Someone",
        amount,
        currency: currency && isCurrencyCode(currency) ? currency : cur,
        days: num(a.payload.days) || 0,
      });
      targets = [[to, text, `${groupUrl}?tab=balances`]];
      break;
    }
    case "ghost_claimed": {
      const addedBy = str(a.payload.added_by);
      const admins = ctx.members.filter((m) => m.role === "admin" && !m.left_at).map((m) => m.id);
      const to = addedBy && byId.has(addedBy) ? [addedBy] : admins;
      targets = to.map((m) => [m, `${who} joined ${ctx.group.name}`, open("members")]);
      break;
    }
    default:
      return [];
  }

  const isMoney = MONEY_KINDS.has(a.kind);
  const seen = new Set<string>();
  const out: PushMessage[] = [];
  for (const [memberId, body, url] of targets) {
    const m = byId.get(memberId);
    if (!m || !m.user_id || m.left_at) continue; // ghosts, people who left
    if (m.id === a.actor_member || (actor?.user_id && m.user_id === actor.user_id)) continue; // never my own actions
    if (m.notify_level === "off" || (m.notify_level === "money" && !isMoney)) continue;
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    out.push({ userId: m.user_id, title, body, url, tag: `${a.kind}:${a.entity_id ?? a.id}` });
  }
  return out;
}
