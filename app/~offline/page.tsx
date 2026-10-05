export const metadata = { title: "Offline · Settld" };

/** Shown by the service worker for pages you haven't opened before while offline. */
export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col items-center justify-center px-5 text-center">
      <p aria-hidden className="font-display text-[104px] uppercase leading-[0.85] text-ink-faded">
        You&apos;re
        <br />
        offline
      </p>
      <h1 className="sr-only">You&apos;re offline</h1>
      <p className="mt-6 max-w-[280px] text-[15px] font-medium text-ink/60">
        This screen hasn&apos;t been saved on this phone yet. Groups you&apos;ve opened before still work, and anything you add syncs when you&apos;re back online.
      </p>
      <a href="/groups" className="mt-6 inline-flex h-14 items-center rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel">
        My groups
      </a>
    </main>
  );
}
