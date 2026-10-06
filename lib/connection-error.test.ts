import { describe, expect, it } from "vitest";
import { isChunkError, isConnectionError } from "./chunk-error";
import { friendlyError } from "./groups";

const safariSw = new TypeError("FetchEvent.respondWith received an error: TypeError: Load failed");

describe("dropped connections are recognised (and never shown raw)", () => {
  it("Safari through the service worker, Safari, Chrome, Firefox", () => {
    for (const e of [safariSw, new TypeError("Load failed"), new TypeError("Failed to fetch"), new TypeError("NetworkError when attempting to fetch resource."), new Error("The network connection was lost.")]) {
      expect(isConnectionError(e), e.message).toBe(true);
    }
  });

  it("not for real bugs or stale-deploy chunks (those have their own handling)", () => {
    expect(isConnectionError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    const chunk = Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" });
    expect(isChunkError(chunk)).toBe(true);
    expect(isConnectionError(chunk)).toBe(false);
  });

  it("friendly text for every wording", () => {
    expect(friendlyError(safariSw)).toBe("You're offline. Check your connection and try again.");
    expect(friendlyError(new TypeError("Load failed"))).toBe("You're offline. Check your connection and try again.");
  });
});
