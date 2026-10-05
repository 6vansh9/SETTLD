import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomCharges, RoomClaim, RoomItem } from "@/lib/splitRoom";
import type { Database, SplitRoom, SplitRoomClaim, SplitRoomItem } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/** Everything a room screen shows. Items are live (not removed), in the host's order. */
export interface RoomData {
  room: SplitRoom;
  items: SplitRoomItem[];
  claims: SplitRoomClaim[];
}

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  for (const k of keys) out[k] = Number(out[k]) as T[keyof T];
  return out;
};
const normRoom = (r: SplitRoom): SplitRoom => num(r, ["tax_value", "service_value", "tip_value"]);
const normItem = (i: SplitRoomItem): SplitRoomItem => num(i, ["price", "qty", "position"]);

/** The room a code points at (the open one first, else the latest), with items and claims. RLS: members only. */
export async function fetchRoomByCode(supabase: Client, code: string): Promise<RoomData | null> {
  const { data: rooms, error } = await supabase.from("split_rooms").select("*").eq("code", code).order("created_at", { ascending: false });
  if (error) throw error;
  const room = rooms.find((r) => r.status === "open") ?? rooms[0];
  if (!room) return null;
  const [items, claims] = await Promise.all([
    supabase.from("split_room_items").select("*").eq("room_id", room.id).is("deleted_at", null).order("position"),
    supabase.from("split_room_claims").select("*").eq("room_id", room.id),
  ]);
  if (items.error) throw items.error;
  if (claims.error) throw claims.error;
  return { room: normRoom(room), items: items.data.map(normItem), claims: claims.data };
}

/** Open, unexpired rooms in a group, newest first (for the "Split Room open · Join" banner). */
export async function fetchOpenRooms(supabase: Client, groupId: string): Promise<SplitRoom[]> {
  const { data, error } = await supabase
    .from("split_rooms")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(normRoom);
}

export function roomCharges(room: SplitRoom): RoomCharges {
  return {
    tax: { kind: room.tax_kind, value: room.tax_value },
    service: { kind: room.service_kind, value: room.service_value },
    tip: { kind: room.tip_kind, value: room.tip_value },
  };
}

export function billInputs(d: RoomData): { items: RoomItem[]; claims: RoomClaim[]; charges: RoomCharges } {
  return {
    items: d.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
    claims: d.claims.map((c) => ({ itemId: c.item_id, memberId: c.member_id, shares: c.shares })),
    charges: roomCharges(d.room),
  };
}

/** A room is over when it's finalized, cancelled, or past its 12 hours. */
export function roomState(room: SplitRoom, now: number = Date.now()): "open" | "finalized" | "cancelled" | "expired" {
  if (room.status !== "open") return room.status;
  return Date.parse(room.expires_at) <= now ? "expired" : "open";
}

/** Optimistic claim change: set a member's shares on an item (0 = un-claim). */
export function withClaim(d: RoomData, itemId: string, memberId: string, shares: number): RoomData {
  const exists = d.claims.some((c) => c.item_id === itemId && c.member_id === memberId);
  const now = new Date().toISOString();
  return {
    ...d,
    claims: exists
      ? d.claims.map((c) => (c.item_id === itemId && c.member_id === memberId ? { ...c, shares, updated_at: now } : c))
      : [...d.claims, { room_id: d.room.id, item_id: itemId, member_id: memberId, shares, updated_at: now }],
  };
}

export function sharesOf(d: RoomData, itemId: string, memberId: string): number {
  return d.claims.find((c) => c.item_id === itemId && c.member_id === memberId)?.shares ?? 0;
}

/** Claimants of an item (shares > 0), ordered by member id like the maths. */
export function claimantsOf(d: Pick<RoomData, "claims">, itemId: string): SplitRoomClaim[] {
  return d.claims.filter((c) => c.item_id === itemId && c.shares > 0).sort((a, b) => (a.member_id < b.member_id ? -1 : 1));
}

export function roomUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/room/${code}`;
}
