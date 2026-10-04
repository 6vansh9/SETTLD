import { isCategory, type Category } from "@/lib/categories";
import { computeBalances } from "@/lib/simplify";
import {
  allocateToBase,
  computeSplits,
  convertMinor,
  formatPercent,
  fromMinor,
  parsePercent,
  parseRate,
  parseShares,
  payersRemaining,
  rateToString,
  toMinor,
  validatePayers,
  type CurrencyCode,
  type MemberAmount,
  type SplitType,
} from "@/lib/money";

/**
 * Add / Edit Expense form state and validation (pure, tested in expense-form.test.ts).
 * Inputs are kept as typed strings; everything is converted to integer minor units here.
 */
export interface ExpenseDraft {
  amount: number; // minor units of `currency`
  /** Expense currency; differs from the group's base currency for foreign expenses. */
  currency: CurrencyCode;
  /** 1 currency = rate base, as typed ("96.32"). "1" when currency is the base. */
  rate: string;
  /** "auto" = from /api/fx; "manual" = typed by the user (never overwritten by a fetch). */
  rateSource: "auto" | "manual";
  title: string;
  category: Category;
  date: string; // YYYY-MM-DD (local)
  note: string;
  payerMode: "single" | "multiple";
  payerId: string;
  payerAmounts: Record<string, string>; // multiple payers, major units as typed
  /** Payer fields the user typed in. Only untouched fields are ever auto-filled. */
  payerTouched: Record<string, boolean>;
  splitType: SplitType;
  included: string[]; // member ids in the split
  exact: Record<string, string>; // major units as typed
  percent: Record<string, string>; // "33.33"
  shares: Record<string, string>; // "2"
}

export type LeftToAssign =
  | { kind: "amount"; value: number } // minor units; negative = over
  | { kind: "percent"; value: number }; // basis points; negative = over

export interface DraftEvaluation {
  /** Per-member split amounts in the expense currency when computable (shown next to each row). */
  splitAmounts: Map<string, number>;
  /** Lines in the group's base currency (what's stored and validated server-side). */
  splits: { memberId: string; amount: number; rawValue: number | null }[] | null;
  payers: MemberAmount[] | null;
  /** amount converted with the rate, rounded half up (null until a valid rate exists). */
  amountBase: number | null;
  /** Canonical rate string sent to the server ("1" for base-currency expenses). */
  rate: string | null;
  /** Split still to assign, for the live indicator; null when nothing is outstanding. */
  splitLeft: LeftToAssign | null;
  /** Multiple payers: paid amounts still to assign. */
  payersLeft: number | null;
  errors: { amount?: string; title?: string; payers?: string; split?: string; rate?: string };
  canSave: boolean;
}

export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newDraft(
  memberIds: readonly string[],
  myMemberId: string,
  today = localDate(),
  baseCurrency: CurrencyCode = "INR",
): ExpenseDraft {
  return {
    amount: 0,
    currency: baseCurrency,
    rate: "1",
    rateSource: "auto",
    title: "",
    category: "food",
    date: today,
    note: "",
    payerMode: "single",
    payerId: myMemberId,
    payerAmounts: {},
    payerTouched: {},
    splitType: "equal",
    included: [...memberIds],
    exact: {},
    percent: {},
    shares: Object.fromEntries(memberIds.map((id) => [id, "1"])),
  };
}

/** Parse a typed money string; blank = 0, invalid = null. */
export function parseMoney(input: string | undefined, currency: CurrencyCode): number | null {
  const v = (input ?? "").trim();
  if (v === "") return 0;
  try {
    const minor = toMinor(v, currency);
    return minor < BigInt(0) || minor > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(minor);
  } catch {
    return null;
  }
}

export function evaluateDraft(d: ExpenseDraft, memberOrder: readonly string[], baseCurrency: CurrencyCode): DraftEvaluation {
  const errors: DraftEvaluation["errors"] = {};
  const currency = d.currency; // amounts are typed in the expense currency

  // Rate + converted total
  let rate: string | null = null;
  let amountBase: number | null = null;
  const scaled = d.currency === baseCurrency ? parseRate("1") : parseRate(d.rate);
  if (!scaled) errors.rate = d.rate.trim() ? "Enter a valid exchange rate" : "Waiting for the exchange rate";
  else {
    rate = rateToString(scaled);
    if (d.amount > 0) {
      try {
        amountBase = convertMinor(d.amount, scaled);
        if (amountBase === 0) errors.amount = "That's too small after conversion";
      } catch {
        errors.amount = "That amount is too large";
      }
    }
  }
  const splitAmounts = new Map<string, number>();
  if (d.amount <= 0) errors.amount = "Enter an amount";
  if (!d.title.trim()) errors.title = "Give it a name";
  else if ([...d.title.trim()].length > 80) errors.title = "Name is too long";

  // Payers
  let payers: MemberAmount[] | null = null;
  let payersLeft: number | null = null;
  if (d.payerMode === "single") {
    payers = d.payerId ? [{ memberId: d.payerId, amount: d.amount }] : null;
    if (!d.payerId) errors.payers = "Pick who paid";
  } else {
    const parsed = memberOrder
      .filter((id) => (d.payerAmounts[id] ?? "").trim() !== "")
      .map((id) => ({ memberId: id, amount: parseMoney(d.payerAmounts[id], currency) }));
    if (parsed.some((p) => p.amount === null)) errors.payers = "Check the paid amounts";
    else {
      const list = (parsed as MemberAmount[]).filter((p) => p.amount > 0);
      payersLeft = payersRemaining(d.amount, list);
      const err = d.amount > 0 ? validatePayers(d.amount, list) : null;
      if (err) errors.payers = err;
      else payers = list;
    }
  }

  // Splits
  const included = memberOrder.filter((id) => d.included.includes(id));
  let splits: DraftEvaluation["splits"] = null;
  let splitLeft: LeftToAssign | null = null;
  if (included.length === 0) errors.split = "Pick at least one person";
  else if (d.amount > 0) {
    let inputs: { memberId: string; value?: number }[] | null = included.map((id) => ({ memberId: id }));
    if (d.splitType === "exact") {
      const vals = included.map((id) => parseMoney(d.exact[id], currency));
      inputs = vals.some((v) => v === null) ? null : included.map((id, i) => ({ memberId: id, value: vals[i]! }));
      if (!inputs) errors.split = "Check the amounts";
    } else if (d.splitType === "percent") {
      const vals = included.map((id) => ((d.percent[id] ?? "").trim() === "" ? 0 : parsePercent(d.percent[id])));
      inputs = vals.some((v) => v === null) ? null : included.map((id, i) => ({ memberId: id, value: vals[i]! }));
      if (!inputs) errors.split = "Percentages need at most 2 decimals";
    } else if (d.splitType === "shares") {
      const vals = included.map((id) => ((d.shares[id] ?? "").trim() === "" ? 0 : parseShares(d.shares[id])));
      inputs = vals.some((v) => v === null) ? null : included.map((id, i) => ({ memberId: id, value: vals[i]! }));
      if (!inputs) errors.split = "Shares must be whole numbers";
    }

    if (inputs) {
      const r = computeSplits(d.amount, d.splitType, inputs);
      if (r.ok) {
        // In an exact split, someone left at 0 isn't part of it: don't store a 0 line for them.
        splits = d.splitType === "exact" ? r.splits.filter((x) => x.amount > 0) : r.splits;
        r.splits.forEach((s) => splitAmounts.set(s.memberId, s.amount));
      } else {
        errors.split = r.error;
        if (r.remaining !== undefined) splitLeft = { kind: "amount", value: r.remaining };
        if (r.remainingPercent !== undefined) splitLeft = { kind: "percent", value: r.remainingPercent };
      }
      // Exact rows show what was typed even while the total doesn't match yet.
      if (d.splitType === "exact" && !r.ok) inputs.forEach((x) => splitAmounts.set(x.memberId, x.value ?? 0));
    }
  }

  // Lines are entered in the expense currency; store them in base, summing exactly to amountBase.
  let splitsBase: DraftEvaluation["splits"] = null;
  let payersBase: MemberAmount[] | null = null;
  if (amountBase && amountBase > 0) {
    if (splits) {
      const parts = allocateToBase(splits.map((x) => x.amount), amountBase);
      splitsBase = splits.map((x, i) => ({ ...x, amount: parts[i] }));
    }
    if (payers) {
      const parts = allocateToBase(payers.map((x) => x.amount), amountBase);
      payersBase = payers.map((x, i) => ({ ...x, amount: parts[i] })).filter((x) => x.amount > 0);
    }
  }

  return {
    splitAmounts,
    splits: splitsBase,
    payers: payersBase,
    amountBase,
    rate,
    splitLeft,
    payersLeft: payersLeft !== null && payersLeft !== 0 ? payersLeft : null,
    errors,
    canSave: Object.keys(errors).length === 0 && !!splitsBase && !!payersBase && !!rate,
  };
}

export interface ExpenseRpcArgs {
  title: string;
  /** In the expense currency */
  amount: number;
  currency: CurrencyCode;
  /** Canonical decimal string; "1" for base-currency expenses */
  fxRate: string;
  category: Category;
  date: string;
  note: string | null;
  splitType: SplitType;
  /** Base-currency lines (sum = amount_base) */
  payers: { member_id: string; amount: number }[];
  splits: { member_id: string; amount: number; raw_value: number | null }[];
}

/** RPC payload for create_expense / update_expense. Only call when evaluateDraft().canSave. */
export function toRpcArgs(d: ExpenseDraft, e: DraftEvaluation): ExpenseRpcArgs {
  if (!e.canSave || !e.splits || !e.payers || !e.rate) throw new Error("Draft is not valid");
  return {
    title: d.title.trim(),
    amount: d.amount,
    currency: d.currency,
    fxRate: e.rate,
    category: d.category,
    date: d.date,
    note: d.note.trim() || null,
    splitType: d.splitType,
    payers: e.payers.map((p) => ({ member_id: p.memberId, amount: p.amount })),
    splits: e.splits.map((s) => ({ member_id: s.memberId, amount: s.amount, raw_value: s.rawValue })),
  };
}

export interface SavedExpense {
  title: string;
  amount: number;
  currency?: CurrencyCode;
  fx_rate_to_base?: number | string;
  category: string;
  date: string;
  note: string | null;
  payers: { member_id: string; amount_base: number }[];
  splits: { member_id: string; amount_base: number; split_type: string; raw_value: number | null }[];
}

/**
 * Prefill the form from a saved expense (Edit). Lines are stored in base; exact amounts come back
 * from raw_value (as entered, in the expense currency) and multiple payers are mapped back onto
 * the original amount proportionally.
 */
export function draftFromExpense(e: SavedExpense, baseCurrency: CurrencyCode): ExpenseDraft {
  const type = (e.splits[0]?.split_type ?? "equal") as SplitType;
  const multiple = e.payers.length > 1;
  const currency = e.currency ?? baseCurrency;
  const scaled = parseRate(String(e.fx_rate_to_base ?? "1"));
  const major = (minor: number) => fromMinor(minor, currency).replace(/\.00$/, "");
  const payerOriginal = multiple ? allocateToBase(e.payers.map((p) => p.amount_base), e.amount) : [];
  return {
    amount: e.amount,
    currency,
    rate: currency === baseCurrency ? "1" : scaled ? rateToString(scaled) : "",
    rateSource: "manual", // keep the stored rate on edit; the user can still change it
    title: e.title,
    category: isCategory(e.category) ? e.category : "other",
    date: e.date,
    note: e.note ?? "",
    payerMode: multiple ? "multiple" : "single",
    payerId: e.payers[0]?.member_id ?? "",
    payerAmounts: multiple ? Object.fromEntries(e.payers.map((p, i) => [p.member_id, major(payerOriginal[i])])) : {},
    // Saved amounts were chosen by someone: never auto-change them.
    payerTouched: multiple ? Object.fromEntries(e.payers.map((p) => [p.member_id, true])) : {},
    splitType: type,
    included: e.splits.map((s) => s.member_id),
    exact: type === "exact" ? Object.fromEntries(e.splits.map((s) => [s.member_id, major(Number(s.raw_value ?? s.amount_base))])) : {},
    percent: type === "percent" ? Object.fromEntries(e.splits.map((s) => [s.member_id, formatPercent(Number(s.raw_value ?? 0))])) : {},
    shares:
      type === "shares"
        ? Object.fromEntries(e.splits.map((s) => [s.member_id, String(Number(s.raw_value ?? 1))]))
        : Object.fromEntries(e.splits.map((s) => [s.member_id, "1"])),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Multiple payers: auto-fill rules (tested in expense-form.test.ts)
 *  • Typed fields are never auto-changed; only untouched fields auto-fill.
 *  • 2 people: typing one amount fills the other with total − typed.
 *  • 3+ people: no silent filling; payerFillSuggestion() offers "Fill ₹X" on the next empty field.
 *  • Switching One person → Multiple prefills the original payer with the full amount.
 * --------------------------------------------------------------------------------------------- */

const majorString = (minor: number, currency: CurrencyCode) => fromMinor(minor, currency).replace(/\.00$/, "");

function payerTotal(d: ExpenseDraft, ids: readonly string[], currency: CurrencyCode): number | null {
  let sum = 0;
  for (const id of ids) {
    const v = parseMoney(d.payerAmounts[id], currency);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

/** Re-run the 2-person rule: the one untouched field takes whatever the touched one leaves. */
export function autofillPayers(d: ExpenseDraft, memberIds: readonly string[], currency: CurrencyCode): ExpenseDraft {
  if (d.payerMode !== "multiple" || memberIds.length !== 2) return d;
  const touched = memberIds.filter((id) => d.payerTouched[id]);
  if (touched.length !== 1) return d;
  const other = memberIds.find((id) => !d.payerTouched[id])!;
  const typed = parseMoney(d.payerAmounts[touched[0]], currency);
  if (typed === null) return d; // half-typed or invalid: leave the other field alone
  const rest = d.amount - typed;
  return { ...d, payerAmounts: { ...d.payerAmounts, [other]: rest > 0 ? majorString(rest, currency) : "" } };
}

/** The user typed in a payer field. */
export function setPayerAmount(
  d: ExpenseDraft,
  memberId: string,
  value: string,
  memberIds: readonly string[],
  currency: CurrencyCode,
): ExpenseDraft {
  const next = {
    ...d,
    payerAmounts: { ...d.payerAmounts, [memberId]: value },
    payerTouched: { ...d.payerTouched, [memberId]: true },
  };
  return autofillPayers(next, memberIds, currency);
}

/** One person ⇄ Multiple people. Going to Multiple with nothing entered prefills the payer with the full amount. */
export function switchPayerMode(d: ExpenseDraft, mode: ExpenseDraft["payerMode"], currency: CurrencyCode): ExpenseDraft {
  if (mode === d.payerMode) return d;
  if (mode === "single") return { ...d, payerMode: "single" };
  const empty = Object.values(d.payerAmounts).every((v) => !v?.trim());
  return {
    ...d,
    payerMode: "multiple",
    payerAmounts: empty && d.payerId && d.amount > 0 ? { [d.payerId]: majorString(d.amount, currency) } : d.payerAmounts,
    payerTouched: empty ? {} : d.payerTouched,
  };
}

/** The total changed (numpad): keep the untouched prefill / auto-filled field in step. */
export function withAmount(d: ExpenseDraft, amount: number, memberIds: readonly string[], currency: CurrencyCode): ExpenseDraft {
  let next = { ...d, amount };
  if (next.payerMode === "multiple") {
    const filled = Object.entries(next.payerAmounts).filter(([, v]) => v?.trim());
    if (filled.length === 1 && !next.payerTouched[filled[0][0]]) {
      next = { ...next, payerAmounts: { ...next.payerAmounts, [filled[0][0]]: majorString(amount, currency) } };
    }
    next = autofillPayers(next, memberIds, currency);
  }
  return next;
}

/** 3+ people: "₹X left to pay" and where to offer the "Fill ₹X" chip (next empty, untouched field). */
export function payerFillSuggestion(
  d: ExpenseDraft,
  memberIds: readonly string[],
  currency: CurrencyCode,
): { memberId: string; amount: number } | null {
  if (d.payerMode !== "multiple" || memberIds.length < 3 || d.amount <= 0) return null;
  const total = payerTotal(d, memberIds, currency);
  if (total === null) return null;
  const left = d.amount - total;
  if (left <= 0) return null;
  const target = memberIds.find((id) => !d.payerTouched[id] && !(d.payerAmounts[id] ?? "").trim());
  return target ? { memberId: target, amount: left } : null;
}

/** Tapping "Fill ₹X": the user chose it, so it counts as typed. */
export function fillPayer(d: ExpenseDraft, memberId: string, amount: number, currency: CurrencyCode): ExpenseDraft {
  return {
    ...d,
    payerAmounts: { ...d.payerAmounts, [memberId]: majorString(amount, currency) },
    payerTouched: { ...d.payerTouched, [memberId]: true },
  };
}

/**
 * Live RESULT card: what this expense does to each person, paid − share (base currency).
 * Non-zero people only, in member order; empty means everyone's square.
 */
export function expenseResult(
  payers: readonly MemberAmount[],
  splits: readonly MemberAmount[],
  memberOrder: readonly string[],
): { memberId: string; net: number }[] {
  return computeBalances([{ payers, splits }], memberOrder)
    .filter((b) => b.net !== 0)
    .map((b) => ({ memberId: b.memberId, net: b.net }));
}
