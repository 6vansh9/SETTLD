import { describe, expect, it } from "vitest";
import { capNodes, edgePath, edgesFor, layout, MAX_NODES, OTHERS_ID, placeLabels, radiusFor, type GraphMember } from "./debt-graph";

const m = (id: string, net: number, isMe = false): GraphMember => ({ id, name: id, color: "pink", net, isMe });

describe("capNodes", () => {
  it("keeps everyone up to 12", () => {
    const ms = Array.from({ length: 12 }, (_, i) => m(`m${i}`, i));
    expect(capNodes(ms).nodes).toHaveLength(12);
  });

  it("folds the smallest balances into +N, always keeping me", () => {
    const ms = [m("me", 1, true), ...Array.from({ length: 15 }, (_, i) => m(`m${i}`, (i + 1) * 100 * (i % 2 ? -1 : 1)))];
    const { nodes, nodeOf, folded } = capNodes(ms);
    expect(nodes).toHaveLength(MAX_NODES);
    expect(nodes.some((n) => n.id === "me")).toBe(true);
    const others = nodes.find((n) => n.id === OTHERS_ID)!;
    expect(others.name).toBe(`+${folded.length}`);
    expect(folded).toHaveLength(16 - 11);
    expect(others.net).toBe(folded.reduce((a, id) => a + ms.find((x) => x.id === id)!.net, 0));
    expect(nodeOf.get(folded[0])).toBe(OTHERS_ID);
  });
});

describe("edgesFor", () => {
  const id = new Map(["a", "b", "c", "d"].map((x) => [x, x]));
  it("merges parallel and nets opposite edges", () => {
    expect(
      edgesFor(
        [
          { from: "a", to: "b", amount: 100 },
          { from: "a", to: "b", amount: 50 },
          { from: "b", to: "a", amount: 30 },
          { from: "c", to: "d", amount: 10 },
          { from: "d", to: "c", amount: 10 },
        ],
        id,
      ),
    ).toEqual([{ id: "a->b", from: "a", to: "b", amount: 120 }]);
  });

  it("remaps folded members and drops self-loops inside +N", () => {
    const fold = new Map([["a", "a"], ["b", OTHERS_ID], ["c", OTHERS_ID]]);
    expect(edgesFor([{ from: "b", to: "a", amount: 5 }, { from: "c", to: "a", amount: 7 }, { from: "b", to: "c", amount: 9 }], fold)).toEqual([
      { id: `${OTHERS_ID}->a`, from: OTHERS_ID, to: "a", amount: 12 },
    ]);
  });
});

describe("layout", () => {
  const ms = [m("debtor", -500), m("creditor", 800), m("settled", 0), m("small", -300, true)];
  const nodes = layout(ms, 390, 360);

  it("debtors left, creditors right, settled in the middle", () => {
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.x]));
    expect(x.debtor).toBeLessThan(195);
    expect(x.small).toBeLessThan(195);
    expect(x.creditor).toBeGreaterThan(195);
    expect(Math.abs(x.settled - 195)).toBeLessThan(80);
  });

  it("is deterministic and stays inside the canvas", () => {
    expect(layout(ms, 390, 360)).toEqual(nodes);
    for (const n of nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0);
      expect(n.x + n.r).toBeLessThanOrEqual(390);
      expect(n.y - n.r).toBeGreaterThanOrEqual(0);
      expect(n.y + n.r).toBeLessThanOrEqual(360);
    }
  });

  it("circles don't overlap", () => {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const [a, b] = [nodes[i], nodes[j]];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
      }
  });

  it("size grows with |balance|; settled is smallest", () => {
    expect(radiusFor(800, 800)).toBeGreaterThan(radiusFor(-300, 800));
    expect(radiusFor(0, 800)).toBeLessThan(radiusFor(-1, 800));
  });
});

describe("edgePath", () => {
  it("starts and ends on the circle edges with a label midpoint", () => {
    const { d, mx, my } = edgePath({ x: 0, y: 0, r: 10 }, { x: 100, y: 0, r: 10 });
    expect(d.startsWith("M 12 0 Q")).toBe(true);
    expect(d.endsWith("82 0")).toBe(true);
    expect(mx).toBeCloseTo(47, 0);
    expect(my).not.toBe(0); // curved
  });
});

describe("placeLabels", () => {
  it("moves a label off a circle it sits on, deterministically and inside the canvas", () => {
    const nodes = [{ x: 100, y: 100, r: 30 }];
    const a = placeLabels([{ id: "e", x: 105, y: 100, w: 80, h: 22 }], nodes, 390, 300);
    const p = a.get("e")!;
    const cx = Math.min(Math.max(100, p.x - 40), p.x + 40);
    const cy = Math.min(Math.max(100, p.y - 11), p.y + 11);
    expect(Math.hypot(cx - 100, cy - 100)).toBeGreaterThanOrEqual(30);
    expect(placeLabels([{ id: "e", x: 105, y: 100, w: 80, h: 22 }], nodes, 390, 300)).toEqual(a);
    expect(p.x).toBeGreaterThanOrEqual(40);
    expect(p.y).toBeLessThanOrEqual(300 - 11);
  });

  it("separates two overlapping labels", () => {
    const m = placeLabels(
      [
        { id: "a", x: 200, y: 150, w: 90, h: 22 },
        { id: "b", x: 205, y: 152, w: 90, h: 22 },
      ],
      [],
      390,
      300,
    );
    const a = m.get("a")!;
    const b = m.get("b")!;
    const apart = Math.abs(a.y - b.y) >= 22 || Math.abs(a.x - b.x) >= 90;
    expect(apart).toBe(true);
  });
});
