import { forceCollide, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Transfer } from "@/lib/simplify";

/** PRD › Debt Graph: max 12 nodes shown, others grouped as "+N". */
export const MAX_NODES = 12;
export const OTHERS_ID = "__others";

export interface GraphMember {
  id: string;
  name: string;
  color: string;
  net: number;
  isMe?: boolean;
}

export interface GraphNode extends GraphMember {
  /** Members folded into "+N" (empty for real people). */
  folded: string[];
  r: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  amount: number;
}

/**
 * Keep the 11 biggest balances (always including me) and fold the rest into one "+N" node.
 * Returns the node list and a member → node id map for remapping edges.
 */
export function capNodes(members: GraphMember[], max = MAX_NODES): { nodes: GraphMember[]; nodeOf: Map<string, string>; folded: string[] } {
  if (members.length <= max) return { nodes: members, nodeOf: new Map(members.map((m) => [m.id, m.id])), folded: [] };
  const ranked = [...members].sort((a, b) => Number(!!b.isMe) - Number(!!a.isMe) || Math.abs(b.net) - Math.abs(a.net));
  const kept = ranked.slice(0, max - 1);
  const rest = ranked.slice(max - 1);
  const others: GraphMember = { id: OTHERS_ID, name: `+${rest.length}`, color: "lilac", net: rest.reduce((a, m) => a + m.net, 0) };
  const nodeOf = new Map<string, string>([...kept.map((m) => [m.id, m.id] as const), ...rest.map((m) => [m.id, OTHERS_ID] as const)]);
  return { nodes: [...kept, others], nodeOf, folded: rest.map((m) => m.id) };
}

/** Remap transfers onto shown nodes; merge parallel edges, net opposite ones, drop self-loops. */
export function edgesFor(transfers: Transfer[], nodeOf: Map<string, string>): GraphEdge[] {
  const sums = new Map<string, number>(); // "a→b" signed by direction a<b
  for (const t of transfers) {
    const a = nodeOf.get(t.from);
    const b = nodeOf.get(t.to);
    if (!a || !b || a === b) continue;
    const [lo, hi, sign] = a < b ? [a, b, 1] : [b, a, -1];
    const key = `${lo}|${hi}`;
    sums.set(key, (sums.get(key) ?? 0) + sign * t.amount);
  }
  const out: GraphEdge[] = [];
  for (const [key, v] of sums) {
    if (v === 0) continue;
    const [lo, hi] = key.split("|");
    const [from, to] = v > 0 ? [lo, hi] : [hi, lo];
    out.push({ id: `${from}->${to}`, from, to, amount: Math.abs(v) });
  }
  return out.sort((x, y) => y.amount - x.amount || x.id.localeCompare(y.id));
}

/** Circle radius: settled small; otherwise sqrt-scaled by |balance| so area tracks the amount. */
export function radiusFor(net: number, maxAbs: number, scale = 1): number {
  if (net === 0 || maxAbs === 0) return 14 * scale;
  return (18 + 26 * Math.sqrt(Math.abs(net) / maxAbs)) * scale;
}

type SimNode = SimulationNodeDatum & { id: string; r: number; tx: number; ty: number; settled: boolean };

/**
 * Deterministic force layout (same input → same picture): debtors pulled left, creditors right,
 * settled people in the middle; collision keeps circles apart; positions clamped to the canvas.
 */
export function layout(members: GraphMember[], width: number, height: number): GraphNode[] {
  const maxAbs = Math.max(0, ...members.map((m) => Math.abs(m.net)));
  const scale = width < 360 ? 0.85 : 1;
  const pad = 8;
  // Each column (owes / gets back) gets evenly spaced row slots; settled people sit in a row along
  // the bottom, out of the arrows' way. Rows zigzag slightly so debts between two people in the
  // same column (raw view) aren't drawn straight through a circle.
  const anySettled = members.some((m) => m.net === 0);
  const top = 34;
  const bottom = anySettled ? height - 64 : height - 22;
  const count = (sign: number) => members.filter((o) => Math.sign(o.net) === sign).length;
  const sim: SimNode[] = members.map((m, i) => {
    const r = radiusFor(m.net, maxAbs, scale);
    const sign = Math.sign(m.net);
    const settled = sign === 0;
    const j = members.slice(0, i).filter((o) => Math.sign(o.net) === sign).length;
    const k = count(sign);
    const lane = k > 2 ? (j % 2 ? 0.06 : -0.06) : 0;
    const tx = sign > 0 ? width * (0.74 - lane) : sign < 0 ? width * (0.26 + lane) : width * 0.5;
    const ty = settled ? height - r - 24 : top + ((j + 0.5) * (bottom - top)) / k;
    return { id: m.id, r, tx, ty, settled, x: tx, y: ty };
  });
  const s = forceSimulation(sim)
    .force("x", forceX<SimNode>((d) => d.tx).strength((d) => (d.settled ? 0.05 : 0.35)))
    .force("y", forceY<SimNode>((d) => d.ty).strength((d) => (d.settled ? 0.8 : 0.3)))
    .force("charge", forceManyBody<SimNode>().strength(-30))
    .force("collide", forceCollide<SimNode>((d) => d.r + 14).iterations(3))
    .stop();
  for (let i = 0; i < 300; i++) s.tick();

  return members.map((m, i) => {
    const n = sim[i];
    const r = n.r;
    return {
      ...m,
      folded: [],
      r,
      x: Math.min(width - r - pad, Math.max(r + pad, n.x ?? n.tx)),
      y: Math.min(height - r - 22, Math.max(r + pad, n.y ?? height / 2)),
    };
  });
}

/** Curved path between two circle edges (curving to one side so opposite arrows don't overlap). */
export function edgePath(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
  arrowGap = 8,
  /** For edges inside one column: bow out toward this side (-1 left, 1 right), at most `room` px. */
  bow?: { side: -1 | 1; room: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = a.x + ux * (a.r + 2);
  const sy = a.y + uy * (a.r + 2);
  const ex = b.x - ux * (b.r + arrowGap);
  const ey = b.y - uy * (b.r + arrowGap);
  // Normal (-uy, ux); same-column edges get a wide bow on the outer side.
  const steep = bow !== undefined && Math.abs(dx) < len * 0.35;
  const sign = steep && Math.sign(-uy) !== bow.side ? -1 : 1;
  // A quadratic's peak sits at half the control offset, so 2×room keeps the curve on canvas.
  const bend = steep ? Math.min(len * 0.42, Math.max(24, 2 * bow.room)) : Math.min(36, len * 0.18);
  const cx = (sx + ex) / 2 - uy * bend * sign;
  const cy = (sy + ey) / 2 + ux * bend * sign;
  // Point on the curve at t = 0.5 (for the label).
  const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
  const my = 0.25 * sy + 0.5 * cy + 0.25 * ey;
  const r = (v: number) => Math.round(v * 10) / 10;
  return { d: `M ${r(sx)} ${r(sy)} Q ${r(cx)} ${r(cy)} ${r(ex)} ${r(ey)}`, mx, my };
}

export interface LabelBox {
  id: string;
  /** Anchor: the curve's midpoint. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Nudge amount labels off the circles and off each other (deterministic relaxation), keeping each
 * near its arrow's midpoint and inside the canvas.
 */
export function placeLabels(labels: LabelBox[], nodes: { x: number; y: number; r: number }[], width: number, height: number) {
  const pos = labels.map((l) => ({ ...l }));
  for (let it = 0; it < 80; it++) {
    for (const l of pos) {
      for (const n of nodes) {
        const cx = Math.min(Math.max(n.x, l.x - l.w / 2), l.x + l.w / 2);
        const cy = Math.min(Math.max(n.y, l.y - l.h / 2), l.y + l.h / 2);
        const dx = cx - n.x;
        const dy = cy - n.y;
        const d = Math.hypot(dx, dy);
        const need = n.r + 4;
        if (d >= need) continue;
        if (d < 0.01) {
          // Circle centre inside the label: hop it clear above or below (cheapest axis for a pill).
          l.y = n.y + (l.y > n.y ? 1 : -1) * (l.h / 2 + need);
          continue;
        }
        l.x += (dx / d) * (need - d) * 0.6;
        l.y += (dy / d) * (need - d) * 0.6;
      }
    }
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i];
        const b = pos[j];
        const ox = (a.w + b.w) / 2 + 4 - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 + 2 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        if (oy <= ox) {
          const s = (a.y <= b.y ? -1 : 1) * oy * 0.5;
          a.y += s;
          b.y -= s;
        } else {
          const s = (a.x <= b.x ? -1 : 1) * ox * 0.5;
          a.x += s;
          b.x -= s;
        }
      }
    }
    pos.forEach((l, i) => {
      l.x += (labels[i].x - l.x) * 0.04;
      l.y += (labels[i].y - l.y) * 0.04;
      l.x = Math.min(width - l.w / 2 - 2, Math.max(l.w / 2 + 2, l.x));
      l.y = Math.min(height - l.h / 2 - 2, Math.max(l.h / 2 + 2, l.y));
    });
  }
  return new Map(pos.map((l) => [l.id, { x: Math.round(l.x * 10) / 10, y: Math.round(l.y * 10) / 10 }]));
}

/** Width of an amount pill: matches the SVG label's text metrics. */
export const labelWidth = (chars: number) => 14 + chars * 8.5;
