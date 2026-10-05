"use client";

import { CloudOff } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { useQueryClient } from "@tanstack/react-query";
import { isReachable, startConnectivity, subscribeConnectivity } from "@/lib/offline/connectivity";
import { isOffline } from "@/lib/offline/net";
import { replayQueue } from "@/lib/offline/replay";
import { subscribe } from "@/lib/offline/store";
import { useOfflineQueue } from "@/lib/offline/useOfflineQueue";
import { registerServiceWorker } from "@/lib/push-client";
import { BUILD_SHA, deployedSha } from "@/lib/sw-client";

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * App-wide PWA plumbing (Milestone 9):
 *  • registers the service worker (offline shell + push);
 *  • "New version · Reload" when a new build is deployed, instead of mixing old and new code:
 *    a waiting service worker, or /api/version differing from this build (no-SW browsers too).
 *    Reload activates the waiting worker first, then reloads once it has taken over;
 *  • "Offline · showing saved data" banner (+ how many changes are waiting to sync).
 */
export function AppShell() {
  const { show } = useToast();
  const online = useSyncExternalStore(subscribeConnectivity, isReachable, () => true);
  const announced = useRef(false);
  const { pending, failed, userId } = useOfflineQueue();
  const qc = useQueryClient();

  // Replay the offline queue: on start, when the connection comes back, whenever something is
  // queued while we're online (a dropped request), and every 30 s while anything is waiting.
  useEffect(() => {
    if (!userId) return;
    const run = () => {
      if (!isOffline()) void replayQueue(userId, qc);
    };
    run();
    window.addEventListener("online", run);
    const unsub = subscribe(() => setTimeout(run, 300));
    // Back from offline (as our probe sees it): sync.
    const unsubNet = subscribeConnectivity(() => isReachable() && run());
    const t = setInterval(() => pending > 0 && run(), 30_000);
    return () => {
      window.removeEventListener("online", run);
      unsub();
      unsubNet();
      clearInterval(t);
    };
  }, [userId, qc, pending]);

  useEffect(() => startConnectivity(), []);

  useEffect(() => {
    let reg: ServiceWorkerRegistration | null = null;
    let disposed = false;

    const offer = () => {
      if (announced.current || disposed) return;
      announced.current = true;
      show({
        message: "New version of Settld",
        duration: 24 * 60 * 60 * 1000,
        action: {
          label: "Reload",
          onClick: () => {
            const waiting = reg?.waiting;
            if (waiting && navigator.serviceWorker.controller) {
              navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
              waiting.postMessage({ type: "SKIP_WAITING" });
              // If the worker never takes over (e.g. it was replaced), reload anyway.
              setTimeout(() => window.location.reload(), 3000);
            } else {
              window.location.reload();
            }
          },
        },
      });
    };

    const watch = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) offer();
      r.addEventListener("updatefound", () => {
        const w = r.installing;
        w?.addEventListener("statechange", () => {
          // A first install isn't an update; only offer when an older worker is in control.
          if (w.state === "installed" && navigator.serviceWorker.controller) offer();
        });
      });
    };

    const check = async () => {
      if (document.visibilityState !== "visible" || isOffline()) return;
      void reg?.update().catch(() => undefined);
      if (BUILD_SHA === "dev") return;
      const live = await deployedSha();
      if (live && live !== "dev" && live !== BUILD_SHA) offer();
    };

    void registerServiceWorker().then((r) => {
      if (disposed || !r) return;
      reg = r;
      watch(r);
    });
    const t = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      disposed = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [show]);

  if (online && failed === 0) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(8px+env(safe-area-inset-top))] z-[64] flex justify-center px-5">
      <span className="flex max-w-full items-center gap-2 rounded-full bg-[#0E0E0E] px-4 py-2 text-[13px] font-semibold text-[#F4F1EC] shadow-[0_0_0_1px_rgba(244,241,236,0.08)]">
        <CloudOff className="size-4 shrink-0" aria-hidden />
        <span className="truncate">
          {online ? "" : "Offline · showing saved data"}
          {pending > 0 && `${online ? "" : " · "}${pending} waiting to sync`}
          {failed > 0 && `${online && pending === 0 ? "" : " · "}${failed} couldn't sync`}
        </span>
      </span>
    </div>
  );
}
