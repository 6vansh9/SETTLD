import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { isChunkError } from "./chunk-error";
import { compatScript } from "./compat";
import { isSingleEmoji } from "./groups";
import { uuid } from "./uuid";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A bare "old Safari" realm: none of the newer methods, then run the inline script in it. */
function oldSafari() {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const store = new Map<string, string>();
  const reload = vi.fn();
  const ctx = vm.createContext({
    Uint8Array,
    Math,
    Date,
    String,
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    location: { reload },
    crypto: { getRandomValues: (b: Uint8Array) => b.map(() => Math.floor(Math.random() * 256)) },
  });
  vm.runInContext(
    `delete Array.prototype.at; delete String.prototype.at; delete Array.prototype.findLast; delete Array.prototype.findLastIndex; delete Object.hasOwn;
     var window = this; window.crypto = crypto; window.addEventListener = function(t, f){ (listeners[t] = listeners[t] || []).push(f); };`,
    Object.assign(ctx, { listeners }),
  );
  vm.runInContext(compatScript, ctx);
  return { run: (code: string) => vm.runInContext(code, ctx), listeners, reload };
}

describe("compat script (older iOS Safari)", () => {
  it("is plain ES5 that parses", () => {
    expect(() => new vm.Script(compatScript)).not.toThrow();
    expect(compatScript).not.toMatch(/=>|\?\?|\?\.|`|\blet\b|\bconst\b/);
  });

  it("adds the missing methods", () => {
    const s = oldSafari();
    expect(s.run("[1,2,3].at(-1)")).toBe(3);
    expect(s.run("'abc'.at(0)")).toBe("a");
    expect(s.run("[1,2,3,4].findLast(function(x){return x%2})")).toBe(3);
    expect(s.run("[1,2,3,4].findLastIndex(function(x){return x>9})")).toBe(-1);
    expect(s.run("Object.hasOwn({a:1}, 'a')")).toBe(true);
    expect(s.run("crypto.randomUUID()")).toMatch(UUID);
  });

  it("reloads once on a stale chunk, not in a loop, and ignores other errors", () => {
    const s = oldSafari();
    const fire = (t: string, e: unknown) => s.listeners[t].forEach((f) => f(e));
    fire("error", { error: new Error("TypeError: x is undefined") });
    expect(s.reload).not.toHaveBeenCalled();
    fire("unhandledrejection", { reason: { name: "ChunkLoadError", message: "Loading chunk 283 failed." } });
    expect(s.reload).toHaveBeenCalledTimes(1);
    fire("error", { error: { name: "ChunkLoadError", message: "Loading chunk 9 failed." } });
    expect(s.reload).toHaveBeenCalledTimes(1);
  });
});

describe("chunk errors", () => {
  it("recognises the usual stale-deploy messages", () => {
    expect(isChunkError({ name: "ChunkLoadError", message: "Loading chunk 283 failed." })).toBe(true);
    expect(isChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/a.js"))).toBe(true);
    expect(isChunkError(new Error("Loading CSS chunk 12 failed"))).toBe(true);
    expect(isChunkError(new TypeError("undefined is not an object"))).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });
});

describe("uuid()", () => {
  it("is v4 with or without crypto.randomUUID", () => {
    expect(uuid()).toMatch(UUID);
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const a = uuid();
      expect(a).toMatch(UUID);
      expect(uuid()).not.toBe(a);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});

describe("isSingleEmoji without Intl.Segmenter (iOS < 14.5)", () => {
  it("matches the Segmenter answers", () => {
    // (Edge cases where the two differ and nobody picks them as a group emoji: keycaps, a lone flag letter.)
    const cases = ["🏝️", "🍕", "👍🏽", "👨‍👩‍👧", "🇮🇳", "🏳️‍🌈", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "🍕🍕", "a", "", "ab", "🇮🇳🇮🇳"];
    const withSegmenter = cases.map(isSingleEmoji);
    const seg = (Intl as unknown as { Segmenter?: unknown }).Segmenter;
    delete (Intl as unknown as { Segmenter?: unknown }).Segmenter;
    try {
      expect(cases.map((c) => [c, isSingleEmoji(c)])).toEqual(cases.map((c, i) => [c, withSegmenter[i]]));
    } finally {
      (Intl as unknown as { Segmenter?: unknown }).Segmenter = seg;
    }
  });
});
