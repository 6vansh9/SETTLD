"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, CornerDownLeft, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExpenseEditor } from "@/components/features/expense/ExpenseEditor";
import { useToast } from "@/components/providers/ToastProvider";
import { Amount, Avatar } from "@/components/ui";
import { CATEGORY_META } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { evaluateDraft, toRpcArgs, type ExpenseDraft } from "@/lib/expense-form";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import { activeMembers, memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import { fade, spring } from "@/lib/motion";
import { canSaveParsed, parseCommand, parsedToDraft, type ParseGroup, type ParseIssue, type ParsedExpense } from "@/lib/parser";
import { pastelVar } from "@/lib/pastels";
import { expenseKeys, useCreateExpense } from "@/lib/queries/expenses";
import { useQueryClient } from "@tanstack/react-query";
import { uuid } from "@/lib/uuid";

export const LAST_GROUP_KEY = "settld-last-group";

const EXAMPLES = ["dinner 2400", "cab 600 paid by rahul", "snacks 300 aman 200 me 100", "hotel $120 split 3", "rent 25k in flat"];

function readLastGroup(): string | null {
  try {
    return localStorage.getItem(LAST_GROUP_KEY);
  } catch {
    return null;
  }
}

/**
 * Command bar (PRD › Command bar): one text field, a live preview of the parsed expense, uncertain
 * parts underlined and fixable with a tap. Enter saves (optimistic create_expense with client_id);
 * Tab opens the full Add Expense sheet prefilled.
 */
export function CommandBar({
  open,
  onClose,
  groups,
  myUserId,
  initialGroupId,
}: {
  open: boolean;
  onClose: () => void;
  groups: GroupWithMembers[];
  myUserId: string;
  initialGroupId: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const { show } = useToast();
  const create = useCreateExpense("", myUserId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<ParseIssue | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rate, setRate] = useState<{ pair: string; rate: string } | null>(null);
  const [full, setFull] = useState<{ group: GroupWithMembers; draft: ExpenseDraft } | null>(null);
  const clientId = useRef("");

  useEffect(() => setMounted(true), []);

  const live = useMemo(() => groups.filter((g) => !g.archived_at), [groups]);

  // Fresh bar every time it opens; default to the given group, else the last one used.
  useEffect(() => {
    if (!open) return;
    setText("");
    setResolved({});
    setPicking(null);
    setConfirmed(false);
    clientId.current = uuid();
    const last = readLastGroup();
    setGroupId([initialGroupId, last, live[0]?.id].find((id) => id && live.some((g) => g.id === id)) ?? null);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, initialGroupId, live]);

  // Parse context: every group I'm in, with "recent" people from that group's cached expenses.
  const parseGroups: ParseGroup[] = useMemo(
    () =>
      live.map((g) => {
        const cached = qc.getQueryData<ExpenseWithLines[]>(expenseKeys.list(g.id)) ?? [];
        const recent = [...new Set(cached.flatMap((e) => [...e.payers.map((p) => p.member_id), ...e.splits.map((s) => s.member_id)]))];
        return {
          id: g.id,
          name: g.name,
          currency: g.base_currency,
          members: activeMembers(g).map((m) => ({ id: m.id, name: m.display_name, isMe: m.user_id === myUserId })),
          recent,
        };
      }),
    [live, myUserId, qc],
  );

  const parsed = parseCommand(text, { groups: parseGroups, currentGroupId: groupId, resolved });
  const group = live.find((g) => g.id === parsed.groupId) ?? null;
  const parseGroup = parseGroups.find((g) => g.id === parsed.groupId) ?? null;
  const foreign = !!group && parsed.currency !== group.base_currency;
  const pair = group ? `${parsed.currency}:${group.base_currency}` : "";

  // Foreign currency: fetch today's rate (server-side, cached) so Enter can save.
  useEffect(() => {
    if (!open || !foreign || rate?.pair === pair) return;
    const [from, to] = pair.split(":");
    const ctl = new AbortController();
    fetch(`/api/fx?from=${from}&to=${to}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.rate && setRate({ pair, rate: b.rate }))
      .catch(() => {});
    return () => ctl.abort();
  }, [open, foreign, pair, rate?.pair]);

  const baseDraft = parseGroup ? parsedToDraft(parsed, parseGroup) : null;
  // Same currency: rate 1. Foreign: today's rate once fetched (empty until then blocks saving).
  const draft = baseDraft && foreign ? { ...baseDraft, rate: rate?.pair === pair ? rate.rate : "" } : baseDraft;
  const evaluation = draft && group ? evaluateDraft(draft, activeMembers(group).map((m) => m.id), group.base_currency) : null;
  const ready = canSaveParsed(parsed) && (!parsed.needsConfirm || confirmed) && !!evaluation?.canSave;
  const blocking = parsed.issues.filter((i) => i.blocking);

  const save = () => {
    if (!ready || !draft || !evaluation || !group) return;
    create.mutate({ args: toRpcArgs(draft, evaluation), clientId: clientId.current, groupId: group.id });
    try {
      localStorage.setItem(LAST_GROUP_KEY, group.id);
    } catch {
      // ignore
    }
    show({ message: `Added “${draft.title}” to ${group.name}`, action: { label: "Open", onClick: () => router.push(`/g/${group.id}`) } });
    onClose();
  };

  const openFull = () => {
    if (!group || !draft) return;
    setFull({ group, draft });
    onClose();
  };

  const fix = (issue: ParseIssue, id: string) => {
    if (issue.field === "group") {
      if (issue.token) setResolved((r) => ({ ...r, [issue.token!]: id }));
      setGroupId(id);
    } else if (issue.token) setResolved((r) => ({ ...r, [issue.token!]: id }));
    setPicking(null);
    inputRef.current?.focus();
  };

  const me = group?.members.find((m) => m.user_id === myUserId && !m.left_at);

  return (
    <>
      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[58] flex justify-center" role="dialog" aria-modal="true" aria-label="Quick add expense">
            <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade} onClick={onClose} aria-hidden />
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? fade : spring}
              className="relative mt-[calc(12px+env(safe-area-inset-top))] h-fit max-h-[calc(100dvh-24px-env(safe-area-inset-top))] w-[calc(100%-24px)] max-w-app overflow-y-auto rounded-[28px] border-[1.5px] border-ink/[0.08] bg-surface p-4 text-ink"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (picking) setPicking(null);
                  else onClose();
                }
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  openFull();
                }
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setConfirmed(false);
                  }}
                  placeholder="dinner 2400 me aman"
                  aria-label="Describe the expense"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  className="h-14 min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink/15 bg-bg px-4 text-[18px] font-semibold text-ink placeholder:text-ink/25 focus:border-ink focus:outline-none"
                />
                <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/5">
                  <X className="size-5" />
                </button>
              </form>

              {/* Group chip */}
              <div className="mt-3 flex items-center gap-2">
                <span className="micro text-ink-faded">In</span>
                <select
                  aria-label="Group"
                  value={parsed.groupId ?? ""}
                  onChange={(e) => {
                    setGroupId(e.target.value);
                    setResolved({});
                  }}
                  className="h-9 max-w-[70%] appearance-none truncate rounded-full border-[1.5px] border-ink/15 bg-bg px-3 pr-7 text-[13px] font-semibold text-ink"
                  style={group ? { backgroundColor: pastelVar(group.color), color: "#0E0E0E", borderColor: "transparent" } : undefined}
                >
                  {!parsed.groupId && <option value="">Pick a group</option>}
                  {live.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.emoji} {g.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="-ml-8 size-4 text-on-pastel/60" aria-hidden />
                {parsed.groupFromText && <span className="micro text-ink-faded">from “in …”</span>}
              </div>

              {text.trim() ? (
                <Preview parsed={parsed} group={group} myUserId={myUserId} onPick={setPicking} confirmed={confirmed} onConfirm={() => setConfirmed(true)} />
              ) : (
                <div className="mt-4 space-y-1.5">
                  <p className="micro text-ink-faded">Try</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          setText(ex);
                          inputRef.current?.focus();
                        }}
                        className="rounded-full bg-ink/[0.06] px-3 py-1.5 text-[13px] font-medium text-ink/70 hover:bg-ink/10"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {picking && (
                <div className="mt-3 rounded-2xl border-[1.5px] border-ink/10 p-3" role="listbox" aria-label={picking.message}>
                  <p className="text-[13px] font-semibold">{picking.message}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(picking.candidates ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => fix(picking, c.id)}
                        className="rounded-full border-[1.5px] border-ink/15 px-3 py-1.5 text-[13px] font-semibold hover:border-ink"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {text.trim() && blocking.length > 0 && !picking && (
                <p className="mt-3 text-[13px] font-medium text-ink/60" aria-live="polite">
                  {blocking[0].message}
                  {blocking[0].candidates?.length ? " Tap the underlined part to pick." : ""}
                </p>
              )}
              {foreign && !evaluation?.rate && <p className="mt-2 text-[13px] font-medium text-ink/60">Getting today&apos;s rate…</p>}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={openFull}
                  disabled={!group || !me}
                  className="flex h-12 items-center gap-2 rounded-full border-[1.5px] border-ink/15 px-4 text-[14px] font-semibold disabled:opacity-40"
                >
                  <SlidersHorizontal className="size-4" />
                  Full form
                  <kbd className="hidden rounded border border-ink/20 px-1 text-[11px] text-ink/50 sm:inline">Tab</kbd>
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!ready}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-coral font-display-alt text-[18px] uppercase tracking-wide text-on-pastel disabled:opacity-40"
                >
                  Add
                  <CornerDownLeft className="size-4" strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          </div>,
          document.body,
        )}

      {full && me && (
        <ExpenseEditor
          open
          onClose={() => setFull(null)}
          onSaved={(title) => {
            try {
              localStorage.setItem(LAST_GROUP_KEY, full.group.id);
            } catch {
              // ignore
            }
            show({ message: `Added “${title}” to ${full.group.name}` });
          }}
          group={full.group}
          myMemberId={me.id}
          myUserId={myUserId}
          initialDraft={full.draft}
        />
      )}
    </>
  );
}

/** Same card style as the Expenses list. Uncertain parts are underlined; tap to fix. */
function Preview({
  parsed,
  group,
  myUserId,
  onPick,
  confirmed,
  onConfirm,
}: {
  parsed: ParsedExpense;
  group: GroupWithMembers | null;
  myUserId: string;
  onPick: (issue: ParseIssue) => void;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const issue = (field: ParseIssue["field"]) => parsed.issues.find((i) => i.field === field && i.candidates?.length);
  const name = (id: string | null) => {
    const m = group?.members.find((x) => x.id === id);
    return !m ? "?" : m.user_id === myUserId ? "You" : m.display_name.split(" ")[0];
  };
  const { Icon } = CATEGORY_META[parsed.category];
  const Uncertain = ({ i, children }: { i: ParseIssue | undefined; children: React.ReactNode }) =>
    i ? (
      <button type="button" onClick={() => onPick(i)} className="font-semibold text-ink underline decoration-coral decoration-dotted decoration-2 underline-offset-4">
        {children}
      </button>
    ) : (
      <span>{children}</span>
    );

  const payerIssue = issue("payer");
  const splitIssues = parsed.issues.filter((i) => i.field === "split" && i.candidates?.length);
  const color = group?.color ?? "lilac";

  let splitText: React.ReactNode;
  if (parsed.split.kind === "everyone") splitText = `Split equally with everyone (${parsed.split.memberIds.length})`;
  else if (parsed.split.kind === "exact") {
    splitText = (
      <span className="flex flex-wrap items-baseline gap-x-2">
        {parsed.split.parts.map((p) => (
          <span key={p.memberId} className="inline-flex items-baseline gap-1">
            {name(p.memberId)} <Amount amount={p.amount} currency={parsed.currency} size="sm" className="text-[15px]" />
          </span>
        ))}
      </span>
    );
  } else {
    const people = parsed.split.memberIds.map(name).join(", ");
    splitText =
      parsed.split.kind === "first-n" && parsed.needsConfirm && !confirmed ? (
        <button type="button" onClick={onConfirm} className="text-left font-semibold underline decoration-coral decoration-dotted decoration-2 underline-offset-4">
          Split with {people}? Tap to confirm
        </button>
      ) : (
        `Split between ${people}`
      );
  }

  return (
    <div className="mt-4" aria-live="polite">
      <p className="micro mb-2 text-ink-faded">Preview</p>
      <div
        className="flex items-start gap-3 rounded-[20px] border-[1.5px] border-ink/[0.08] p-3"
        style={{ backgroundColor: `color-mix(in srgb, ${pastelVar(color)} 22%, rgb(var(--surface-rgb)))` }}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-on-pastel" style={{ backgroundColor: pastelVar(color) }}>
          <Icon className="size-5" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[15px] font-semibold", !parsed.title && "text-ink/35")}>{parsed.title || "What was it?"}</span>
          <span className="mt-1 flex flex-wrap items-baseline gap-1 text-[13px] font-medium text-ink/70">
            <Uncertain i={payerIssue}>{payerIssue ? `“${payerIssue.token ?? "?"}”` : name(parsed.payerId)}</Uncertain>
            paid
            {parsed.amount !== null ? (
              <Amount amount={parsed.amount} currency={parsed.currency} size="sm" className="text-[16px] text-ink" />
            ) : (
              <span className="text-ink/35">…</span>
            )}
          </span>
          <span className="mt-1 block text-[13px] font-medium text-ink/60">{splitText}</span>
          {splitIssues.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-2 text-[13px]">
              {splitIssues.map((i) => (
                <Uncertain key={`${i.token}`} i={i}>
                  “{i.token}”?
                </Uncertain>
              ))}
            </span>
          )}
        </span>
        {group && parsed.payerId && (
          <Avatar {...memberAvatar(group.members.find((m) => m.id === parsed.payerId) ?? group.members[0])} size="sm" />
        )}
      </div>
    </div>
  );
}
