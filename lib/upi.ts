// UPI IDs (profiles) and UPI payment deep links (PRD › Settle up).

import { fromMinor } from "@/lib/money";

/**
 * The single source of truth for UPI ID syntax: handle@bank, e.g. vansh@okhdfcbank.
 * The profiles_upi_id_check constraint in supabase/migrations uses this exact string
 * (lib/upi.test.ts fails if they drift). Postgres caps regex repetition counts at 255,
 * so the handle bound is {2,255}. Written with only syntax that JS and Postgres ARE regexes
 * interpret identically: ASCII classes, bounded repeats, ^ and $ anchors.
 */
export const UPI_ID_PATTERN = "^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$";

const UPI_ID = new RegExp(UPI_ID_PATTERN);

/** Validate the value exactly as it will be saved (trimmed). */
export function isValidUpiId(value: string): boolean {
  return UPI_ID.test(value.trim());
}

/** What to store: the trimmed ID, or null when blank (skipped). Never an empty string. */
export function normalizeUpiId(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * RFC 3986 component encoding (spaces → %20, never "+"), which every UPI app decodes the same way.
 * `encodeURIComponent` leaves !'()* alone; encode those too so names can't break the query.
 */
function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface UpiPayment {
  /** Payee UPI ID, e.g. aman@okhdfcbank */
  upiId: string;
  /** Payee name as shown in the UPI app */
  name: string;
  /** Amount in paise (> 0) */
  amountMinor: number;
  /** Group name, used in the transaction note: "Settld <group>" */
  groupName: string;
}

const MAX_NOTE = 50; // UPI apps truncate long notes; keep ours short and predictable

/**
 * upi://pay?pa=&pn=&am=&cu=INR&tn=Settld%20<group> (PRD › Settle up). INR only.
 * The UPI ID keeps its "@" (our UPI_ID_PATTERN allows only [A-Za-z0-9._-@], all URL-safe);
 * name and note are percent-encoded; the amount always has 2 decimals.
 */
export function buildUpiLink(p: UpiPayment): string {
  const upiId = p.upiId.trim();
  if (!isValidUpiId(upiId)) throw new Error("Invalid UPI ID");
  if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0) throw new Error("Amount must be positive");
  const note = [...`Settld ${p.groupName.trim()}`].slice(0, MAX_NOTE).join("").trim();
  const params = [
    `pa=${upiId}`,
    `pn=${encodeComponent(p.name.trim() || upiId)}`,
    `am=${fromMinor(p.amountMinor, "INR")}`,
    "cu=INR",
    `tn=${encodeComponent(note)}`,
  ];
  return `upi://pay?${params.join("&")}`;
}

/** UPI is offered only for INR groups when the receiver has a UPI ID (approved M5 rule). */
export function canPayViaUpi(baseCurrency: string, receiverUpiId: string | null | undefined): boolean {
  return baseCurrency === "INR" && !!receiverUpiId && isValidUpiId(receiverUpiId);
}
