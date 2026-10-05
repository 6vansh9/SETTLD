import type { ExpenseWithLines } from "@/lib/expenses-data";
import type { Settlement } from "@/lib/supabase/types";

/**
 * A write made while offline (or when the network call failed), waiting in IndexedDB.
 * `params` are the exact RPC arguments, including the original client_id, so replaying can never
 * create a duplicate. `preview` is what the UI shows meanwhile.
 */
export type QueueItem =
  | (QueueBase & { kind: "create_expense"; params: Record<string, unknown>; preview: ExpenseWithLines })
  | (QueueBase & { kind: "update_expense"; params: Record<string, unknown>; preview: ExpenseWithLines; before: ExpenseWithLines })
  | (QueueBase & { kind: "delete_expense"; params: { p_expense_id: string }; before: ExpenseWithLines })
  | (QueueBase & { kind: "record_settlement"; params: Record<string, unknown>; preview: Settlement });

export interface QueueBase {
  /** client_id for creates/records; a fresh id for edits/deletes. */
  id: string;
  userId: string;
  groupId: string;
  createdAt: number;
  status: "pending" | "failed";
  /** Why the server refused it (status "failed"). */
  error?: string;
  /** "Dinner · ₹900.00" for the Couldn't sync list. */
  label: string;
}

export type QueueKind = QueueItem["kind"];
