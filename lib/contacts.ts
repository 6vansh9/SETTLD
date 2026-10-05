"use client";

import { isIOS } from "@/lib/push-client";

interface ContactsManagerLike {
  select(props: ("name" | "tel")[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
}

/** Contact Picker API: Android Chrome. Hidden everywhere else, including iPhone (users type the number). */
export function supportsContactPicker(): boolean {
  if (typeof window === "undefined" || isIOS()) return false;
  return "contacts" in navigator && "ContactsManager" in window;
}

/** One contact's name and numbers, or null if the user cancelled. */
export async function pickContact(): Promise<{ name: string; tels: string[] } | null> {
  const contacts = (navigator as Navigator & { contacts?: ContactsManagerLike }).contacts;
  if (!contacts) return null;
  const [c] = await contacts.select(["name", "tel"], { multiple: false });
  if (!c) return null;
  return { name: c.name?.[0]?.trim() ?? "", tels: c.tel ?? [] };
}
