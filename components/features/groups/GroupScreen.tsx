"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Plus, Settings2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityList } from "@/components/features/activity/ActivityList";
import { DebtGraph } from "@/components/features/debt-graph/DebtGraph";
import { useCommandBar } from "@/components/features/command-bar/CommandBarProvider";
import { usePillQueue } from "@/components/features/activity/usePillQueue";
import { useToast } from "@/components/providers/ToastProvider";
import { BalancesTab } from "@/components/features/expense/BalancesTab";
import { ExpenseDetailSheet } from "@/components/features/expense/ExpenseDetailSheet";
import { ExpenseEditor } from "@/components/features/expense/ExpenseEditor";
import { ExpenseList } from "@/components/features/expense/ExpenseList";
import { SettleSheet } from "@/components/features/settle/SettleSheet";
import { NewRoomButton, RoomBanner } from "@/components/features/split-room/RoomEntry";
import { SettlementSheet } from "@/components/features/settle/SettlementSheet";
import { AnimatedAmount, Avatar, Button, Confetti, PresencePill, SplitBar } from "@/components/ui";
import { describeActivity, pillText, type ActivityRow, type ActivityTarget } from "@/lib/activity";
import { cn } from "@/lib/cn";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import { GROUP_TYPES } from "@/lib/groups";
import { activeMembers, memberAvatar, myMember, type GroupWithMembers } from "@/lib/groups-data";
import { CURRENCIES } from "@/lib/money";
import { fade, spring } from "@/lib/motion";
import { pastelVar, type Pastel } from "@/lib/pastels";
import { presenceText } from "@/lib/presence";
import { useGroupActivity } from "@/lib/queries/activity";
import { useBalances, useDeleteExpense, useExpenses, useRestoreExpense } from "@/lib/queries/expenses";
import { useGroup } from "@/lib/queries/groups";
import {
  useConfirmSettlement,
  useDeleteSettlement,
  useDisputeSettlement,
  useRestoreSettlement,
  useSettlements,
} from "@/lib/queries/settlements";
import { useGroupRealtime } from "@/lib/realtime/useGroupRealtime";
import { myTransfers, settlementPlan } from "@/lib/settle";
import type { Transfer } from "@/lib/simplify";
import type { GroupBalance, Settlement } from "@/lib/supabase/types";
import { GroupSettingsSheet } from "./GroupSettingsSheet";
import { COVER_FADED } from "@/lib/images";
import { CoverBackdrop } from "./CoverBackdrop";
import { InviteSheet } from "./InviteSheet";
import { MembersSheet } from "./MembersSheet";

const UNDO_MS = 10_000;

const TABS = [
  { id: "expenses", label: "Expenses", empty: ["NO", "EXPENSES"], hint: "Add the first one: dinner, cab, rent, anything." },
  { id: "balances", label: "Balances", empty: ["ALL", "SQUARE"], hint: "Who owes whom shows up here once there are expenses." },
  { id: "graph", label: "Graph", empty: ["NO", "DEBTS"], hint: "Add an expense to see who owes whom, drawn live." },
  { id: "activity", label: "Activity", empty: ["QUIET", "HERE"], hint: "Every change in the group will show up here." },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function GroupScreen({
  initialGroup,
  initialExpenses,
  initialBalances,
  initialSettlements,
  myUserId,
}: {
  initialGroup: GroupWithMembers;
  initialExpenses: ExpenseWithLines[];
  initialBalances: GroupBalance[];
  initialSettlements: Settlement[];
  myUserId: string;
}) {
  const { show } = useToast();
  const router = useRouter();
  const commandBar = useCommandBar();
  const { data: group } = useGroup(initialGroup.id, initialGroup);
  const { data: expenses = initialExpenses } = useExpenses(initialGroup.id, initialExpenses);
  const { data: balances = initialBalances } = useBalances(initialGroup.id, initialBalances);
  const { data: settlements = initialSettlements } = useSettlements(initialGroup.id, initialSettlements);
  const confirmSettlement = useConfirmSettlement(initialGroup.id);
  const disputeSettlement = useDisputeSettlement(initialGroup.id);
  const deleteSettlement = useDeleteSettlement(initialGroup.id);
  const restoreSettlement = useRestoreSettlement(initialGroup.id);
  const [settle, setSettle] = useState<{ prefill: Transfer | null } | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [busySettlementId, setBusySettlementId] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(0);
  const deleteExpense = useDeleteExpense(initialGroup.id);
  const restoreExpense = useRestoreExpense(initialGroup.id);
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<TabId>("expenses");
  const [sheet, setSheet] = useState<"invite" | "members" | "settings" | null>(null);
  const [editor, setEditor] = useState<{ expense: ExpenseWithLines | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const g = group ?? initialGroup;
  const me = myMember(g, myUserId);
  const members = activeMembers(g);
  const detail = expenses.find((e) => e.id === detailId) ?? null;
  const openSettlement = settlements.find((x) => x.id === settlementId) ?? null;
  const { data: activity = [], isLoading: activityLoading } = useGroupActivity(initialGroup.id, tab === "activity");

  // Open an item from the activity feed, the pill, or /activity (?open=expense:<id>).
  const latest = useRef({ expenses, settlements });
  latest.current = { expenses, settlements };
  const openTarget = useCallback(
    (target: ActivityTarget) => {
      if (!target) return;
      if (target.type === "members") return setSheet("members");
      if (target.type === "room") return router.push(`/room/${target.code}`);
      const list = target.type === "expense" ? latest.current.expenses : latest.current.settlements;
      if (!list.some((x) => x.id === target.id)) {
        show({ message: target.type === "expense" ? "That expense was deleted." : "That payment was deleted." });
        return;
      }
      setTab("expenses");
      if (target.type === "expense") setDetailId(target.id);
      else setSettlementId(target.id);
    },
    [show, router],
  );

  const params = useSearchParams();
  useEffect(() => {
    const open = params.get("open");
    if (params.get("tab") === "activity") setTab("activity");
    if (!open) return;
    const [type, id] = open.split(":");
    if (type === "members") openTarget({ type: "members" });
    else if ((type === "expense" || type === "settlement") && id) openTarget({ type, id });
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: live sync, presence, and other people's activity in the pill.
  const names = useMemo(() => new Map(g.members.map((m) => [m.id, m.display_name])), [g.members]);
  const membersRef = useRef(g.members);
  membersRef.current = g.members;
  const pushRef = useRef<(item: import("@/components/ui").PillItem) => void>(() => {});
  const onActivity = useCallback(
    (a: ActivityRow) => {
      const actor = membersRef.current.find((m) => m.id === a.actor_member);
      const myName = membersRef.current.find((m) => m.user_id === myUserId)?.display_name;
      const line = describeActivity({ ...a, actor: actor ? { display_name: actor.display_name, user_id: actor.user_id } : null }, myUserId, myName);
      pushRef.current({
        key: `act:${a.id}`,
        text: pillText(line),
        amount: line.amount,
        person: actor ? memberAvatar(actor) : null,
        onTap: () => openTarget(line.target),
      });
    },
    [myUserId, openTarget],
  );
  const { status, presence, setScreen } = useGroupRealtime(initialGroup.id, me?.id ?? "", onActivity);
  const presenceWho = me ? presence.find((x) => x.member_id !== me.id && x.typing && x.screen !== "group") : undefined;
  const presenceMember = presenceWho ? g.members.find((m) => m.id === presenceWho.member_id) : undefined;
  const pill = usePillQueue(me ? presenceText(presence, me.id, names) : null, presenceMember ? memberAvatar(presenceMember) : null);
  pushRef.current = pill.push;
  const screen = editor ? "add-expense" : settle ? "settle" : "group";
  useEffect(() => setScreen(screen), [screen, setScreen]);

  // Who pays whom: simplified from the balances view, or raw debts net of (undisputed) payments.
  let plan: Transfer[] = [];
  let planError = false;
  try {
    plan = settlementPlan({
      simplify: g.simplify,
      balances: g.members.map((m) => ({ memberId: m.id, net: balances.find((b) => b.member_id === m.id)?.net ?? 0 })),
      expenses: expenses.map((e) => ({
        payers: e.payers.map((p) => ({ memberId: p.member_id, amount: p.amount_base })),
        splits: e.splits.map((x) => ({ memberId: x.member_id, amount: x.amount_base })),
      })),
      settlements: settlements.map((x) => ({ from: x.from_member, to: x.to_member, amount: x.amount_base, status: x.status, deleted_at: x.deleted_at })),
    });
  } catch {
    planError = true; // balances not summing to zero would be a server bug: show nets, no plan
  }

  // Removed from the group (or it was deleted) while the screen was open.
  if (group === null || !me) return <NotInGroup />;

  // Optimistic writes: failures roll back and show "… · Retry" from the hooks themselves.
  const respond = (x: Settlement, action: "confirm" | "dispute") => {
    setBusySettlementId(x.id);
    (action === "confirm" ? confirmSettlement : disputeSettlement).mutate({ settlement: x }, { onSettled: () => setBusySettlementId(null) });
  };
  const removeSettlement = (x: Settlement) => {
    setSettlementId(null);
    deleteSettlement.mutate(
      { settlement: x },
      {
        onSuccess: () =>
          show({
            message: "Payment deleted",
            duration: UNDO_MS,
            action: { label: "Undo", onClick: () => restoreSettlement.mutate({ settlement: x }) },
          }),
      },
    );
  };

  const remove = (e: ExpenseWithLines) => {
    setDetailId(null);
    deleteExpense.mutate(e, {
      onSuccess: () =>
        show({
          message: `Deleted “${e.title}”`,
          duration: UNDO_MS,
          action: { label: "Undo", onClick: () => restoreExpense.mutate(e) },
        }),
    });
  };

  const isAdmin = me.role === "admin";
  const myNet = balances.find((b) => b.member_id === me.id)?.net ?? 0;
  const paidSegments = balances
    .filter((b) => b.paid > 0)
    .map((b) => {
      const m = g.members.find((x) => x.id === b.member_id);
      return {
        name: m ? (m.id === me.id ? "You" : m.display_name.split(" ")[0]) : "Someone",
        color: (m?.profile?.avatar_color ?? "lilac") as Pastel,
        value: b.paid,
      };
    });
  const totalSpent = paidSegments.reduce((a, s) => a + s.value, 0);
  const archived = !!g.archived_at;
  const current = TABS.find((t) => t.id === tab)!;
  const typeLabel = GROUP_TYPES.find((t) => t.value === g.type)?.label ?? "Group";
  const cover = !!g.cover_url;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-app pb-[calc(190px+env(safe-area-inset-bottom))]">
      {/* Pastel header */}
      <header
        className={cn(
          "relative isolate overflow-hidden rounded-b-[32px] border-[1.5px] border-t-0 border-on-pastel/[0.08] px-5 pt-[calc(12px+env(safe-area-inset-top))]",
          // With a cover: white text over the scrim (faded parts at 60%), and room at the bottom for
          // the fade into the group's pastel.
          cover ? "pb-12 text-white" : "pb-6 text-on-pastel",
        )}
        style={{ backgroundColor: pastelVar(g.color), ...(cover ? { "--amount-faded": COVER_FADED } : {}) } as React.CSSProperties}
      >
        <CoverBackdrop url={g.cover_url} color={g.color} />
        <div className="flex h-11 items-center justify-between">
          <Link
            href="/groups"
            aria-label="Back to groups"
            className={cn(
              "flex size-11 items-center justify-center rounded-full",
              cover ? "-ml-1 bg-black/35 backdrop-blur-md" : "-ml-2 hover:bg-on-pastel/5",
            )}
          >
            <ArrowLeft className="size-5" strokeWidth={2.25} />
          </Link>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setSheet("settings")}
              aria-label="Group settings"
              className={cn(
                "flex size-11 items-center justify-center rounded-full",
                cover ? "-mr-1 bg-black/35 backdrop-blur-md" : "-mr-2 hover:bg-on-pastel/5",
              )}
            >
              <Settings2 className="size-5" strokeWidth={2.25} />
            </button>
          )}
        </div>

        <div className="mt-4 text-[56px] leading-none" aria-hidden>
          {g.emoji}
        </div>
        <h1 className="mt-3 break-words font-display text-[56px] uppercase leading-[0.9]">{g.name}</h1>
        <p className="micro mt-3 opacity-60">
          {typeLabel} · {CURRENCIES[g.base_currency].symbol} {g.base_currency}
          {archived && " · Archived"}
        </p>

        {/* Your position + who has paid so far. Dark text on the pastel (red/green fail contrast here). */}
        <div className="mt-6 flex items-end justify-between gap-3">
          <div>
            <p className="micro opacity-60">{myNet > 0 ? "You're owed" : myNet < 0 ? "You owe" : "You're all settled"}</p>
            <AnimatedAmount amount={Math.abs(myNet)} currency={g.base_currency} size="lg" className="mt-1" />
          </div>
          {totalSpent > 0 && (
            <div className="text-right">
              <p className="micro opacity-60">Group spend</p>
              <AnimatedAmount amount={totalSpent} currency={g.base_currency} size="sm" className="mt-1" />
            </div>
          )}
        </div>
        {paidSegments.length > 0 && (
          // Neutral card so member pastels never vanish into the group's own pastel.
          <div className="mt-4 rounded-2xl border-[1.5px] border-on-pastel/[0.08] bg-surface p-3 text-ink [--amount-faded:0.35]">
            <p className="micro mb-2 text-ink-faded">Who&apos;s paid</p>
            <SplitBar segments={paidSegments} />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSheet("members")}
            className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-2"
            aria-label={`${members.length} members, view all`}
            style={{ "--avatar-ring": pastelVar(g.color) } as React.CSSProperties}
          >
            <span className="flex">
              {members.slice(0, 5).map((m, i) => (
                <Avatar
                  key={m.id}
                  {...memberAvatar(m)}
                  size="md"
                  className={cn("ring-2 ring-[color:var(--avatar-ring)]", i > 0 && "-ml-2")}
                />
              ))}
            </span>
            <span className="micro whitespace-nowrap opacity-70">
              {members.length > 5 ? `+${members.length - 5} · ` : ""}
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </button>
          {!archived && (
            <button
              type="button"
              onClick={() => setSheet("invite")}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold",
                cover ? "bg-white text-on-pastel" : "bg-on-pastel text-[color:var(--avatar-ring,#fff)]",
              )}
              style={{ "--avatar-ring": pastelVar(g.color) } as React.CSSProperties}
            >
              <UserPlus className="size-4" strokeWidth={2.5} />
              Invite
            </button>
          )}
        </div>
      </header>

      {status === "reconnecting" && (
        <p role="status" className="mx-5 mt-3 flex items-center justify-center gap-2 text-[12px] font-semibold text-ink/50">
          <span className="size-2 animate-pulse rounded-full bg-butter" aria-hidden />
          Reconnecting… changes will catch up
        </p>
      )}

      <RoomBanner groupId={g.id} />
      {!archived && <NewRoomButton groupId={g.id} />}

      {archived && (
        <p className="mx-5 mt-4 rounded-2xl bg-ink/5 px-4 py-3 text-[14px] font-medium text-ink/70">
          Archived · read-only.{isAdmin ? " Unarchive from settings to make changes." : ""}
        </p>
      )}

      {/* Member list */}
      <section className="mt-6 px-5" aria-labelledby="members-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="members-heading" className="font-display-alt text-[28px] uppercase leading-none">
            Members
          </h2>
          <button type="button" onClick={() => setSheet("members")} className="micro text-ink-faded hover:text-ink">
            {isAdmin && !archived ? "Manage" : "See all"}
          </button>
        </div>
        <ul className="-mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {members.map((m) => (
            <li key={m.id} className="flex w-16 shrink-0 flex-col items-center gap-2 text-center">
              <Avatar {...memberAvatar(m)} size="lg" />
              <span className="w-full truncate text-[12px] font-semibold">
                {m.user_id === myUserId ? "You" : m.display_name.split(" ")[0]}
              </span>
            </li>
          ))}
          {isAdmin && !archived && (
            <li className="flex w-16 shrink-0 flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setSheet("members")}
                aria-label="Add someone"
                className="flex size-12 items-center justify-center rounded-full border-[1.5px] border-dashed border-ink/30 text-ink/50"
              >
                <UserPlus className="size-5" />
              </button>
              <span className="text-[12px] font-semibold text-ink/50">Add</span>
            </li>
          )}
        </ul>
      </section>

      {/* Tabs */}
      <div role="tablist" aria-label="Group sections" className="mx-5 mt-8 grid grid-cols-4 border-b-[1.5px] border-ink/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative h-12 text-[14px] font-semibold transition-colors",
              tab === t.id ? "text-ink" : "text-ink/40 hover:text-ink/70",
            )}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="group-tab-underline"
                transition={reduce ? fade : spring}
                className="absolute inset-x-2 -bottom-[1.5px] h-[3px] rounded-full bg-ink"
              />
            )}
          </button>
        ))}
      </div>

      <motion.section
        key={tab}
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={fade}
        className="px-5 py-6"
      >
        {tab === "expenses" && (expenses.length > 0 || settlements.length > 0) && (
          <ExpenseList
            expenses={expenses}
            settlements={settlements}
            group={g}
            myMemberId={me.id}
            myUserId={myUserId}
            onOpen={(e) => setDetailId(e.id)}
            onOpenSettlement={(x) => setSettlementId(x.id)}
            onConfirm={(x) => respond(x, "confirm")}
            onDispute={(x) => respond(x, "dispute")}
            busySettlementId={busySettlementId}
          />
        )}
        {tab === "balances" && expenses.length > 0 && (
          <BalancesTab
            group={g}
            balances={balances}
            plan={plan}
            planError={planError}
            myUserId={myUserId}
            onSettle={(t) => setSettle({ prefill: t })}
          />
        )}
        {tab === "graph" && expenses.length > 0 && (
          <DebtGraph
            group={g}
            balances={balances}
            expenses={expenses}
            settlements={settlements}
            myMemberId={me.id}
            onSettle={(prefill) => setSettle({ prefill })}
          />
        )}
        {tab === "activity" && activity.length > 0 && (
          <ActivityList rows={activity} myUserId={myUserId} myDisplayName={me.display_name} onOpen={(_row, target) => openTarget(target)} />
        )}
        {tab === "activity" && activityLoading && activity.length === 0 && (
          <div className="space-y-2" aria-label="Loading activity">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl" style={{ backgroundColor: pastelVar(g.color), opacity: 0.35 }} />
            ))}
          </div>
        )}
        {((tab === "graph" && expenses.length === 0) ||
          (tab === "activity" && !activityLoading && activity.length === 0) ||
          (tab !== "activity" && expenses.length === 0 && (tab === "balances" || settlements.length === 0))) && (
          <div className="flex flex-col items-center py-6 text-center">
            <p aria-hidden className="font-display text-[88px] uppercase leading-[0.85] text-ink-faded">
              {current.empty[0]}
              <br />
              {current.empty[1]}
            </p>
            <p className="mt-5 max-w-[260px] text-[14px] font-medium text-ink/60">{current.hint}</p>
            {tab === "expenses" && !archived && (
              <Button className="mt-6" onClick={() => setEditor({ expense: null })}>
                <Plus className="size-5" strokeWidth={2.5} />
                Add expense
              </Button>
            )}
          </div>
        )}
      </motion.section>

      {/* Add expense: floating above the SETTLE UP footer */}
      {!archived && expenses.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-app justify-end px-5" style={{ bottom: "calc(104px + env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={() => commandBar.open(g.id)}
            aria-label="Quick add expense"
            className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-ink text-bg transition-transform active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* SETTLE UP footer: opens the Settle sheet when you owe or are owed someone */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-app">
        <Button
          variant="footer"
          disabled={archived || myTransfers(plan, me.id).length === 0}
          aria-describedby="settle-hint"
          onClick={() => setSettle({ prefill: null })}
        >
          Settle up
        </Button>
        <span id="settle-hint" className="sr-only">
          {myTransfers(plan, me.id).length === 0 ? "You're all square in this group" : "Pay back or record a payment"}
        </span>
      </div>

      <InviteSheet open={sheet === "invite"} onClose={() => setSheet(null)} group={g} isAdmin={isAdmin} />
      <MembersSheet
        open={sheet === "members"}
        onClose={() => setSheet(null)}
        group={g}
        myUserId={myUserId}
        isAdmin={isAdmin}
      />
      {isAdmin && <GroupSettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} group={g} />}

      <ExpenseEditor
        open={!!editor}
        onClose={() => setEditor(null)}
        onSaved={(title, mode) => show({ message: mode === "created" ? `Added “${title}”` : `Saved “${title}”` })}
        group={g}
        myMemberId={me.id}
        myUserId={myUserId}
        expense={editor?.expense}
      />
      <ExpenseDetailSheet
        expense={detail}
        onClose={() => setDetailId(null)}
        group={g}
        myUserId={myUserId}
        onEdit={(e) => {
          setDetailId(null);
          setEditor({ expense: e });
        }}
        onDelete={remove}
      />
      <SettleSheet
        open={!!settle}
        onClose={() => setSettle(null)}
        group={g}
        me={me}
        plan={plan}
        prefill={settle?.prefill ?? null}
        onSettledUp={() => setConfetti((n) => n + 1)}
      />
      <SettlementSheet
        settlement={openSettlement}
        onClose={() => setSettlementId(null)}
        group={g}
        myUserId={myUserId}
        onDelete={removeSettlement}
      />
      <Confetti burst={confetti} colors={["var(--pink)", "var(--sky)", "var(--mint)", "var(--butter)", "var(--lilac)", "var(--peach)", "var(--coral)", pastelVar(g.color)]} />
      <PresencePill
        item={pill.shown}
        onTap={(item) => {
          item.onTap?.();
          pill.dismiss();
        }}
      />
    </div>
  );
}

function NotInGroup() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col items-center justify-center px-5 text-center">
      <p aria-hidden className="font-display text-[96px] uppercase leading-[0.85] text-ink-faded">
        Not
        <br />
        here
      </p>
      <p className="mt-5 max-w-[260px] text-[15px] font-medium text-ink/60">
        You&apos;re no longer in this group.
      </p>
      <Link href="/groups" className="mt-6 inline-flex h-14 items-center rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel">
        Back to groups
      </Link>
    </main>
  );
}
