import { isCurrencyCode, type CurrencyCode } from "@/lib/money";

/** An activity row as fetched, with the actor's member row embedded. */
export interface ActivityRow {
  id: string;
  group_id: string;
  actor_member: string | null;
  kind: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  actor?: { display_name: string; user_id: string | null; profile?: { avatar_color: string; avatar_url?: string | null } | null } | null;
}

export type ActivityTarget = { type: "expense" | "settlement"; id: string } | { type: "members" } | { type: "room"; code: string } | null;

export interface ActivityLine {
  text: string;
  amount: { value: number; currency: CurrencyCode } | null;
  target: ActivityTarget;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const first = (name: string) => name.split(" ")[0];

/**
 * Human sentence for an activity row ("Aman added Dinner", "You paid Aman"), plus the amount to
 * show with <Amount /> and where tapping should go. Names are first names; the viewer is "You".
 */
export function describeActivity(row: ActivityRow, myUserId: string, myDisplayName?: string | null): ActivityLine {
  const p = row.payload ?? {};
  const actorIsMe = !!row.actor?.user_id && row.actor.user_id === myUserId;
  // My name as stored on the row's group (payloads carry display names): "You" wherever it appears.
  const myName = myDisplayName ?? (actorIsMe && row.actor ? row.actor.display_name : null);
  const who = actorIsMe ? "You" : first(row.actor?.display_name ?? "Someone");
  // Payment names come from the payload (display names at the time); "You" when it's the actor and me.
  const person = (name: unknown) => {
    const n = str(name);
    if (!n) return "someone";
    return myName && n === myName ? "You" : first(n);
  };
  const title = str(p.title) ?? "an expense";
  const currency = str(p.currency);
  const amountValue = typeof p.amount === "number" ? p.amount : typeof p.amount === "string" ? Number(p.amount) : null;
  const amount = currency && isCurrencyCode(currency) && amountValue !== null && Number.isFinite(amountValue) ? { value: amountValue, currency } : null;
  const expense = row.entity_id ? ({ type: "expense", id: row.entity_id } as const) : null;
  const settlement = row.entity_id ? ({ type: "settlement", id: row.entity_id } as const) : null;
  const possessive = (n: string) => (n === "You" ? "your" : `${n}'s`);

  switch (row.kind) {
    case "expense_created":
      return { text: `${who} added ${title}`, amount, target: expense };
    case "expense_updated":
      return { text: `${who} edited ${title}`, amount, target: expense };
    case "expense_deleted":
      return { text: `${who} deleted ${title}`, amount, target: null };
    case "expense_restored":
      return { text: `${who} restored ${title}`, amount, target: expense };
    case "settlement_recorded":
      return { text: `${person(p.from)} paid ${person(p.to)}`, amount, target: settlement };
    case "settlement_confirmed":
      return { text: `${who} confirmed ${possessive(person(p.from))} payment`, amount, target: settlement };
    case "settlement_disputed":
      return { text: `${who} disputed ${possessive(person(p.from))} payment`, amount, target: settlement };
    case "settlement_updated":
      return { text: `${who} changed a payment to ${person(p.to)}`, amount, target: settlement };
    case "settlement_deleted":
      return { text: `${who} deleted a payment to ${person(p.to)}`, amount, target: null };
    case "settlement_restored":
      return { text: `${who} restored a payment to ${person(p.to)}`, amount, target: settlement };
    case "member_joined":
      return { text: `${who} joined`, amount: null, target: { type: "members" } };
    case "member_removed":
      return { text: `${who} removed ${first(str(p.name) ?? "someone")}`, amount: null, target: { type: "members" } };
    case "ghost_claimed": {
      // "Rahul joined" (they took the spot someone saved for them; it keeps its history).
      const ghost = str(p.ghost_name);
      const saved = ghost && first(ghost).toLowerCase() !== first(row.actor?.display_name ?? "").toLowerCase() ? ` (saved as ${first(ghost)})` : "";
      return { text: `${actorIsMe ? "You" : who} joined${saved}`, amount: null, target: { type: "members" } };
    }
    case "room_opened": {
      const code = str(p.code);
      return { text: `${who} opened a Split Room${str(p.name) ? `: ${str(p.name)}` : ""}`, amount: null, target: code ? { type: "room", code } : null };
    }
    case "room_finalized": {
      const base = str(p.base_currency);
      const roomAmount = base && isCurrencyCode(base) && amountValue !== null && Number.isFinite(amountValue) ? { value: amountValue, currency: base } : null;
      const expenseId = str(p.expense_id);
      return { text: `${who} finalized ${str(p.name) ?? "a Split Room"}`, amount: roomAmount, target: expenseId ? { type: "expense", id: expenseId } : null };
    }
    case "comment_added": {
      const type = str(p.entity_type);
      const id = str(p.entity_id);
      const on = str(p.title) ?? (type === "settlement" ? "a payment" : "an expense");
      const body = str(p.body);
      return {
        text: `${who} commented on ${on}${body ? `: “${body.length > 60 ? `${body.slice(0, 59)}…` : body}”` : ""}`,
        amount: null,
        target: (type === "expense" || type === "settlement") && id ? { type, id } : null,
      };
    }
    case "nudge_sent": {
      const base = str(p.base_currency);
      const nudgeAmount = base && isCurrencyCode(base) && amountValue !== null && Number.isFinite(amountValue) ? { value: amountValue, currency: base } : null;
      const target = person(p.to_name);
      return { text: `${who} nudged ${target === "You" ? "you" : target}`, amount: nudgeAmount, target: null };
    }
    case "room_cancelled":
      return { text: `${who} closed ${str(p.name) ?? "a Split Room"}`, amount: null, target: null };
    default:
      return { text: `${who} made a change`, amount: null, target: null };
  }
}

/** Pill wording for a live event: same sentence, with "just" for immediacy where it reads well. */
export function pillText(line: ActivityLine): string {
  return line.text.replace(/^(\S+) (added|paid|settled|joined|edited|deleted|confirmed|disputed|opened|finalized|commented|nudged)\b/, "$1 just $2");
}
