"use client";

import { NudgeButton } from "@/components/features/social/NudgeButton";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BellRing, HandCoins } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivacy } from "@/components/providers/PrivacyProvider";
import { Amount, Avatar, Button } from "@/components/ui";
import { initials } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { capNodes, edgePath, edgesFor, labelWidth, layout, OTHERS_ID, placeLabels, type GraphMember } from "@/lib/debt-graph";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import { memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import { formatParts, type CurrencyCode } from "@/lib/money";
import { pastelVar, type Pastel } from "@/lib/pastels";
import { countsTowardBalances } from "@/lib/settle";
import { pairwiseDebts, simplifyDebts, type Transfer } from "@/lib/simplify";
import type { GroupBalance, Settlement } from "@/lib/supabase/types";

const MORPH_S = 0.8; // PRD: simplify animates over ~800 ms

/**
 * Debt Graph (PRD › Debt Graph): circles in avatar colors sized by |balance|, debtors left,
 * creditors right; arrows debtor → creditor, thickness by amount. The Simplify toggle morphs raw
 * debts into the simplified set; tap a person for Settle / Nudge. Live via GroupScreen's data.
 */
export function DebtGraph({
  group,
  balances,
  expenses,
  settlements,
  myMemberId,
  onSettle,
}: {
  group: GroupWithMembers;
  balances: GroupBalance[];
  expenses: ExpenseWithLines[];
  settlements: Settlement[];
  myMemberId: string;
  onSettle: (prefill: Transfer | null) => void;
}) {
  const reduce = useReducedMotion();
  const { blurred } = usePrivacy();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(350);
  const [simplified, setSimplified] = useState(group.simplify);
  const [selected, setSelected] = useState<string | null>(null);
  const currency = group.base_currency;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    const netOf = new Map(balances.map((b) => [b.member_id, b.net]));
    const members: GraphMember[] = group.members
      .filter((m) => !m.left_at || (netOf.get(m.id) ?? 0) !== 0)
      .map((m) => ({
        id: m.id,
        name: m.id === myMemberId ? "You" : m.display_name.split(" ")[0],
        color: (m.profile?.avatar_color ?? "lilac") as Pastel,
        net: netOf.get(m.id) ?? 0,
        isMe: m.id === myMemberId,
        photo: m.is_ghost ? null : (m.profile?.avatar_url ?? null),
      }));
    const { nodes, nodeOf, folded } = capNodes(members);

    let raw: Transfer[] = [];
    let simple: Transfer[] = [];
    try {
      raw = pairwiseDebts(
        expenses.map((e) => ({
          payers: e.payers.map((p) => ({ memberId: p.member_id, amount: p.amount_base })),
          splits: e.splits.map((s) => ({ memberId: s.member_id, amount: s.amount_base })),
        })),
        settlements.filter(countsTowardBalances).map((s) => ({ from: s.from_member, to: s.to_member, amount: s.amount_base })),
      );
      simple = simplifyDebts(group.members.map((m) => ({ memberId: m.id, net: netOf.get(m.id) ?? 0 })));
    } catch {
      // balances that don't sum to zero would be a server bug; draw nodes only
    }
    const rawEdges = edgesFor(raw, nodeOf);
    // Taller canvas when there are many raw debts, so their labels have room (same height in both
    // views, so toggling only morphs the arrows).
    const height = Math.max(300, Math.min(600, 100 + nodes.length * 44 + rawEdges.length * 10));
    const placed = layout(nodes, width, height).map((n) => (n.id === OTHERS_ID ? { ...n, folded } : n));
    return { nodes: placed, height, raw: rawEdges, simple: edgesFor(simple, nodeOf), rawTransfers: raw, simpleTransfers: simple };
  }, [balances, expenses, settlements, group.members, myMemberId, width]);

  const edges = simplified ? graph.simple : graph.raw;
  const maxEdge = Math.max(1, ...edges.map((e) => e.amount));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const sel = selected ? byId.get(selected) : null;
  const labelAt = useMemo(() => {
    const at = new Map(graph.nodes.map((n) => [n.id, n]));
    const boxes = edges.flatMap((e) => {
      const a = at.get(e.from);
      const b = at.get(e.to);
      if (!a || !b) return [];
      const { mx, my } = edgePath(a, b, 8, bowFor(a, b, width));
      const p = formatParts(e.amount, currency);
      return [{ id: e.id, x: mx, y: my, w: labelWidth(p.symbol.length + p.whole.length + p.fraction.length), h: 22 }];
    });
    // Circles plus the name under each one.
    const obstacles = graph.nodes.flatMap((n) => [n, { x: n.x, y: n.y + n.r + 12, r: 11 }]);
    return placeLabels(boxes, obstacles, width, graph.height);
  }, [edges, graph, width, currency]);
  const touches = (e: { from: string; to: string }) => !selected || e.from === selected || e.to === selected;

  // Settle from the mini card: the shown transfer between me and the tapped person, if any.
  const transfers = simplified ? graph.simpleTransfers : graph.rawTransfers;
  const withMe = sel && sel.id !== myMemberId ? transfers.find((t) => (t.from === myMemberId && t.to === sel.id) || (t.to === myMemberId && t.from === sel.id)) : null;
  const canSettle = !!sel && sel.id !== OTHERS_ID && (sel.id === myMemberId ? transfers.some((t) => t.from === myMemberId || t.to === myMemberId) : !!withMe);

  const morph = reduce ? { duration: 0.25 } : { duration: MORPH_S, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Debts shown" className="grid grid-cols-2 rounded-full bg-ink/[0.06] p-1">
          {[
            { v: true, label: "Simplified" },
            { v: false, label: "Every debt" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={simplified === o.v}
              onClick={() => setSimplified(o.v)}
              className={cn(
                "h-9 rounded-full px-3 text-[13px] font-semibold transition-colors",
                simplified === o.v ? "bg-surface text-ink shadow-[0_0_0_1.5px_rgb(var(--ink-rgb)/0.08)]" : "text-ink/50",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="micro text-ink-faded">
          {edges.length} {edges.length === 1 ? "payment" : "payments"}
        </span>
      </div>

      <div ref={box} className="relative mt-3 overflow-hidden rounded-card border-[1.5px] border-ink/[0.08] bg-surface">
        <span className="micro pointer-events-none absolute left-3 top-3 text-ink-faded">← Owes</span>
        <span className="micro pointer-events-none absolute right-3 top-3 text-ink-faded">Gets back →</span>
        <svg
          width={width}
          height={graph.height}
          viewBox={`0 0 ${width} ${graph.height}`}
          role="img"
          aria-label={`Debt graph: ${edges.map((e) => `${byId.get(e.from)?.name} pays ${byId.get(e.to)?.name}`).join(", ") || "nobody owes anybody"}`}
          onClick={() => setSelected(null)}
          className="block touch-manipulation select-none"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="13" markerHeight="13" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--ink-rgb))" />
            </marker>
          </defs>

          <AnimatePresence initial={false}>
            {edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const { d } = edgePath(a, b, 8, bowFor(a, b, width));
              const stroke = 2 + 7 * (e.amount / maxEdge);
              const on = touches(e);
              return (
                <motion.g key={e.id} initial={{ opacity: 0 }} animate={{ opacity: on ? 1 : 0.12 }} exit={{ opacity: 0 }} transition={morph}>
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="rgb(var(--ink-rgb))"
                    strokeOpacity={0.55}
                    strokeLinecap="round"
                    markerEnd="url(#arrow)"
                    initial={reduce ? false : { d, pathLength: 0, strokeWidth: stroke }}
                    animate={{ d, pathLength: 1, strokeWidth: stroke }}
                    transition={morph}
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>

          {graph.nodes.map((n) => {
            const settled = n.net === 0;
            const isSel = selected === n.id;
            return (
              <motion.g
                key={n.id}
                initial={false}
                animate={{ x: n.x, y: n.y, opacity: settled && !isSel ? 0.45 : 1 }}
                transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 400, damping: 30 }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelected((s) => (s === n.id ? null : n.id));
                }}
                role="button"
                aria-label={`${n.name}: ${n.net > 0 ? "gets back" : n.net < 0 ? "owes" : "settled"}`}
                className="cursor-pointer"
              >
                <circle r={n.r} fill={pastelVar(n.color)} stroke={isSel ? "rgb(var(--ink-rgb))" : "rgb(14 14 14 / 0.1)"} strokeWidth={isSel ? 3 : 1.5} />
{n.photo ? (
                  <>
                    <clipPath id={`photo-${n.id}`}>
                      <circle r={n.r - 3} />
                    </clipPath>
                    <image
                      href={n.photo}
                      x={-(n.r - 3)}
                      y={-(n.r - 3)}
                      width={(n.r - 3) * 2}
                      height={(n.r - 3) * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#photo-${n.id})`}
                    />
                  </>
                ) : (
                                  <text textAnchor="middle" dy="0.35em" fontSize={Math.max(11, n.r * 0.55)} fontWeight={600} fill="#0E0E0E" style={{ fontFamily: "var(--font-inter)" }}>
                  {n.id === OTHERS_ID ? n.name : initials(n.name === "You" ? (group.members.find((m) => m.id === n.id)?.display_name ?? "You") : n.name)}
                </text>
                )}
                <text y={n.r + 14} textAnchor="middle" fontSize={11} fontWeight={600} fill="rgb(var(--ink-rgb))" style={{ fontFamily: "var(--font-inter)" }}>
                  {n.id === OTHERS_ID ? "others" : n.name}
                </text>
              </motion.g>
            );
          })}

          {/* Amount labels above the circles so a big circle never hides one. */}
          <AnimatePresence initial={false}>
            {edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const at = labelAt.get(e.id);
              if (!at) return null;
              return (
                <motion.g
                  key={e.id}
                  className="pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: touches(e) ? 1 : 0.12 }}
                  exit={{ opacity: 0 }}
                  transition={morph}
                >
                  <SvgAmount x={at.x} y={at.y} minor={e.amount} currency={currency} blurred={blurred} />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
        {edges.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[13px] font-medium text-ink/50">Nobody owes anybody. 🎉</p>
        )}
      </div>

      {sel && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center gap-3 rounded-card border-[1.5px] border-ink/[0.08] bg-surface p-4"
        >
          {sel.id === OTHERS_ID ? (
            <span className="flex size-9 items-center justify-center rounded-full bg-lilac text-[12px] font-semibold text-on-pastel">{sel.name}</span>
          ) : (
            <Avatar {...memberAvatar(group.members.find((m) => m.id === sel.id)!)} size="md" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{sel.id === OTHERS_ID ? `${sel.folded.length} more people` : sel.name}</span>
            <span className="mt-1 flex flex-wrap items-baseline gap-x-1 text-[12px] font-semibold text-ink/60">
              <span className="whitespace-nowrap">{sel.net > 0 ? "Gets back" : sel.net < 0 ? "Owes" : "Settled up"}</span>
              {sel.net !== 0 && <Amount amount={Math.abs(sel.net)} currency={currency} size="sm" sign={sel.net > 0 ? "owed" : "owe"} className="text-[18px]" />}
            </span>
          </span>
          <Button
            variant="secondary"
            className="h-10 px-3 text-[13px]"
            disabled={!canSettle}
            onClick={() => onSettle(sel.id === myMemberId ? null : (withMe ?? null))}
            title={canSettle ? undefined : "Nothing between you two"}
          >
            <HandCoins className="size-4" />
            Settle
          </Button>
          {withMe && withMe.from === sel.id && withMe.to === myMemberId ? (
            <NudgeButton group={group} myMemberId={myMemberId} toMemberId={sel.id} amount={withMe.amount} />
          ) : (
            sel.id !== myMemberId &&
            sel.id !== OTHERS_ID && (
              <Button variant="ghost" className="h-10 px-3 text-[13px]" disabled title="They don't owe you anything">
                <BellRing className="size-4" />
                Nudge
              </Button>
            )
          )}
        </motion.div>
      )}
    </div>
  );
}

/** Same-column edges bow outward, but only as far as the canvas edge allows. */
function bowFor(a: { x: number; r: number }, b: { x: number; r: number }, w: number) {
  const left = (a.x + b.x) / 2 < w / 2;
  const outer = left ? Math.min(a.x - a.r, b.x - b.r) : w - Math.max(a.x + a.r, b.x + b.r);
  return { side: (left ? -1 : 1) as -1 | 1, room: Math.max(0, outer - 6) + Math.min(a.r, b.r) };
}

/** Amount label inside the SVG: Jersey 10, symbol and decimals faded (same rule as <Amount />). */
function SvgAmount({ x, y, minor, currency, blurred }: { x: number; y: number; minor: number; currency: CurrencyCode; blurred: boolean }) {
  const p = formatParts(minor, currency);
  const w = labelWidth(p.symbol.length + p.whole.length + p.fraction.length);
  return (
    <g transform={`translate(${x} ${y})`} style={blurred ? { filter: "blur(4px)" } : undefined}>
      <rect x={-w / 2} y={-12} width={w} height={22} rx={11} fill="rgb(var(--surface-rgb))" stroke="rgb(var(--ink-rgb) / 0.12)" />
      <text textAnchor="middle" dy="0.35em" fontSize={18} fill="rgb(var(--ink-rgb))" style={{ fontFamily: "var(--font-jersey), var(--font-inter)" }}>
        <tspan opacity={0.35}>{p.symbol}</tspan>
        <tspan>{p.whole}</tspan>
        <tspan opacity={0.35}>{p.fraction}</tspan>
      </text>
    </g>
  );
}
