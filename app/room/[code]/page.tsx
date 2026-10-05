import type { Metadata } from "next";
import { JoinRoom } from "@/components/features/split-room/JoinRoom";
import { RoomEnd } from "@/components/features/split-room/RoomEnd";
import { RoomScreen } from "@/components/features/split-room/RoomScreen";
import { requireOnboarded } from "@/lib/auth";
import { fetchGroup } from "@/lib/groups-data";
import { fetchRoomByCode } from "@/lib/split-room-data";
import { normalizeRoomCode } from "@/lib/splitRoom";
import { createClient } from "@/lib/supabase/server";

type Params = { params: { code: string } };

export const metadata: Metadata = { title: "Split Room · Settld", robots: { index: false } };

/**
 * /room/<CODE>. Signed-out visitors are sent to sign in by the middleware and come back here.
 * Not in the group yet → group preview + "Join group & room". Members → the live room.
 */
export default async function RoomPage({ params }: Params) {
  const code = normalizeRoomCode(decodeURIComponent(params.code));
  if (!code) return <RoomEnd kind="missing" />;
  const profile = await requireOnboarded(`/room/${code}`);

  const supabase = createClient();
  const { data: previews } = await supabase.rpc("room_preview", { p_code: code });
  const preview = previews?.[0];
  if (!preview) return <RoomEnd kind="missing" />;

  if (!preview.is_member || !preview.group_id) {
    if (preview.expired) return <RoomEnd kind="expired" />;
    if (preview.status !== "open") return <RoomEnd kind="closed" />;
    return <JoinRoom code={code} preview={preview} />;
  }

  const [room, group] = await Promise.all([fetchRoomByCode(supabase, code), fetchGroup(supabase, preview.group_id)]);
  if (!room || !group) return <RoomEnd kind="missing" />;
  return <RoomScreen code={code} initialRoom={room} initialGroup={group} myUserId={profile.id} />;
}
