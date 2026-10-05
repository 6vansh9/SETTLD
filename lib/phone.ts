import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/**
 * Phone numbers (not verified: they never grant access, see 0010_phones.sql). Stored as E.164.
 * libphonenumber-js "min" metadata: validity by length/pattern per country, small bundle.
 */
export type { CountryCode };
export const DEFAULT_COUNTRY: CountryCode = "IN";

export function flag(country: string): string {
  return country.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function countryName(country: string, locale = "en"): string {
  try {
    const dn = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames([locale], { type: "region" }) : null;
    return dn?.of(country) ?? country;
  } catch {
    return country;
  }
}

export interface CountryOption {
  code: CountryCode;
  dial: string;
  name: string;
  flag: string;
}

/** Every country libphonenumber knows, India first, then by name. */
export function countryOptions(locale = "en"): CountryOption[] {
  const all = getCountries().map((code) => ({ code, dial: `+${getCountryCallingCode(code)}`, name: countryName(code, locale), flag: flag(code) }));
  all.sort((a, b) => (a.code === DEFAULT_COUNTRY ? -1 : b.code === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name)));
  return all;
}

/**
 * Typed number + selected country → E.164, or null if it isn't a valid number. A number typed
 * with its own +code wins over the picker (e.g. pasted "+1 415 555 0123").
 */
export function toE164(input: string, country: CountryCode = DEFAULT_COUNTRY): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const p = parsePhoneNumberFromString(raw, raw.startsWith("+") ? undefined : country);
  return p && p.isValid() ? p.number : null;
}

/** Split a stored E.164 number back into picker country + national digits (for editing). */
export function fromE164(e164: string | null | undefined): { country: CountryCode; national: string } {
  const p = e164 ? parsePhoneNumberFromString(e164) : undefined;
  // Bare national digits: formatNational() would add a trunk prefix ("090000 11111" in India).
  return p?.country ? { country: p.country, national: p.nationalNumber } : { country: DEFAULT_COUNTRY, national: "" };
}

/** "+91 98765 43210" */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const p = parsePhoneNumberFromString(e164);
  return p ? p.formatInternational() : e164;
}

/** Contact-picker numbers come in any format; prefer one that parses for the default country. */
export function bestE164(tels: readonly string[], country: CountryCode = DEFAULT_COUNTRY): string | null {
  for (const t of tels) {
    const n = toE164(t.replace(/[^\d+]/g, ""), country);
    if (n) return n;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// Invites to a ghost (WhatsApp / SMS)
// ------------------------------------------------------------------------------------------------

export function ghostInviteText(ghostName: string, groupName: string, url: string): string {
  const first = ghostName.trim().split(/\s+/)[0] || ghostName;
  return `Hey ${first}, I added you to ${groupName} on Settld so we can split costs. Tap to join: ${url}`;
}

/** wa.me wants digits only (no +). Without a number, WhatsApp asks who to send it to. */
export function whatsappInviteUrl(e164: string | null, text: string): string {
  const digits = e164 ? e164.replace(/\D/g, "") : "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** iOS Messages wants sms:<n>&body=…; Android wants sms:<n>?body=…. */
export function smsInviteUrl(e164: string | null, text: string, ios: boolean): string {
  return `sms:${e164 ?? ""}${ios ? "&" : "?"}body=${encodeURIComponent(text)}`;
}
