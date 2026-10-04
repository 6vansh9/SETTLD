"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGroupActivity, fetchMyActivity, type FeedRow } from "@/lib/activity-data";
import { createClient } from "@/lib/supabase/client";

export function useGroupActivity(groupId: string, enabled = true) {
  return useQuery({ queryKey: ["group", groupId, "activity"], queryFn: () => fetchGroupActivity(createClient(), groupId), enabled });
}

export function useMyActivity(initialData?: FeedRow[]) {
  return useQuery({ queryKey: ["activity"], queryFn: () => fetchMyActivity(createClient()), initialData });
}
