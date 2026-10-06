import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Fresh module state per test (reachable/fails are module-level). */
async function load() {
  vi.resetModules();
  return import("./connectivity");
}

describe("connectivity probe", () => {
  let online = true;
  beforeEach(() => {
    online = true;
    vi.stubGlobal("navigator", {
      get onLine() {
        return online;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("one slow or failed check (e.g. a cold start) doesn't show Offline; two in a row do", async () => {
    const c = await load();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    expect(await c.probe()).toBe(true);
    expect(c.isReachable()).toBe(true);
    expect(await c.probe()).toBe(false);
    expect(c.isReachable()).toBe(false);
  });

  it("a success in between resets the count", async () => {
    const c = await load();
    const fetch = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error("x"));
    vi.stubGlobal("fetch", fetch);
    await c.probe();
    await c.probe();
    expect(await c.probe()).toBe(true);
  });

  it("the browser saying offline counts at once, and recovery is immediate", async () => {
    const c = await load();
    online = false;
    expect(await c.probe()).toBe(false);
    online = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await c.probe()).toBe(true);
  });
});
