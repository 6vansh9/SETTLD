"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import type { GroupWithMembers } from "@/lib/groups-data";
import { replayQueue } from "@/lib/offline/replay";
import { removeItem, updateItem } from "@/lib/offline/store";
import type { QueueItem } from "@/lib/offline/types";

/**
 * Writes the server refused after coming back online (group archived, someone removed, a
 * validation problem). Kept with the reason until the user edits, retries or discards them:
 * nothing is dropped silently.
 */
export function CouldntSync({ group, items, onEdit }: { group: GroupWithMembers; items: QueueItem[]; onEdit: (e: ExpenseWithLines) => void }) {
  const qc = useQueryClient();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="couldnt-sync" className="mx-5 mt-4 rounded-card border-[1.5px] border-owe/40 bg-surface p-4">
      <h2 id="couldnt-sync" className="flex items-center gap-2 text-[15px] font-semibold">
        <AlertTriangle className="size-4 text-owe-ink" aria-hidden />
        Couldn&apos;t sync {items.length === 1 ? "1 change" : `${items.length} changes`}
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((q) => (
          <li key={q.id} className="rounded-2xl bg-ink/[0.03] p-3">
            <p className="text-[14px] font-semibold">
              {q.kind === "delete_expense" ? "Delete " : q.kind === "update_expense" ? "Edit " : ""}
              {q.label}
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-owe-ink">{q.error ?? "The server didn't accept it."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.kind === "create_expense" && !group.archived_at && (
                <button type="button" onClick={() => onEdit(q.preview)} className="h-9 rounded-full border-[1.5px] border-ink/15 px-3 text-[13px] font-semibold">
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  await updateItem(q.id, { status: "pending", error: undefined });
                  void replayQueue(q.userId, qc);
                }}
                className="h-9 rounded-full border-[1.5px] border-ink/15 px-3 text-[13px] font-semibold"
              >
                Retry
              </button>
              <button type="button" onClick={() => void removeItem(q.id)} className="h-9 rounded-full px-3 text-[13px] font-semibold text-ink/60 hover:bg-ink/5">
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
