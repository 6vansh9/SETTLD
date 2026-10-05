import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { JoinScreen, type InvitePreview } from "@/components/features/join/JoinScreen";
import { getUserAndProfile } from "@/lib/auth";
import { PASTEL_HEX } from "@/lib/pastels";
import { requestOrigin } from "@/lib/request-origin";
import { friendlyError } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";

type Params = { params: { token: string } };

/** Public preview (works signed out, which is how WhatsApp and iMessage fetch link previews). */
const getPreview = cache(async (token: string): Promise<InvitePreview | null> => {
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(token)) return null;
  const { data } = await createClient().rpc("preview_invite", { p_token: token });
  return data?.[0] ?? null;
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const preview = await getPreview(params.token);
  if (!preview) return { title: "Invite expired · Settld", robots: { index: false } };

  const title = `Join ${preview.name} on Settld`;
  const h = headers();
  const origin = requestOrigin(h, `https://${h.get("host") ?? "settld-omega.vercel.app"}/`);
  const image = `${origin}/api/og/invite/${encodeURIComponent(params.token)}`;
  const description = `${preview.emoji} ${preview.member_count} ${
    preview.member_count === 1 ? "person is" : "people are"
  } splitting expenses live. Tap to join.`;
  return {
    title,
    description,
    robots: { index: false },
    // Absolute URL from the request's own origin (WhatsApp/iMessage need it absolute).
    openGraph: {
      title,
      description,
      siteName: "Settld",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${preview.emoji} ${preview.name} on Settld` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const preview = await getPreview(params.token);
  return preview ? { themeColor: PASTEL_HEX[preview.color] } : {};
}

export default async function JoinPage({ params, searchParams }: Params & { searchParams: { auto?: string } }) {
  const { token } = params;
  // Set on the sign-up / sign-in links from this screen: someone who just made an account from a
  // personal claim link takes their spot without another tap.
  const auto = searchParams.auto === "1";
  const here = `/join/${token}${auto ? "?auto=1" : ""}`;
  const preview = await getPreview(token);
  if (!preview) return <ExpiredInvite />;

  const { user, profile } = await getUserAndProfile();
  if (!user) return <JoinScreen token={token} preview={preview} details={null} />;

  // Signed in but not onboarded: finish onboarding, then come back here.
  if (!profile?.onboarded_at) redirect(`/onboarding?next=${encodeURIComponent(here)}`);

  const { data: details } = await createClient().rpc("invite_details", { p_token: token });
  if (!details) return <ExpiredInvite />;
  if (details.member_group_id) redirect(`/g/${details.member_group_id}`);

  // Personal claim link + fresh account: claim the spot now (the link is the proof; a phone number
  // never is). join_group takes the ghost's spot for personal links.
  let autoError: string | null = null;
  if (auto && details.claim) {
    const { data: groupId, error } = await createClient().rpc("join_group", { p_token: token });
    if (!error && groupId) redirect(`/g/${groupId}?welcome=1`);
    autoError = error ? friendlyError(error) : "Couldn't join just now. Try again.";
  }

  return <JoinScreen token={token} preview={preview} details={details} initialError={autoError} />;
}

function ExpiredInvite() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col items-center justify-center px-5 text-center">
      <p aria-hidden className="font-display text-[110px] uppercase leading-[0.85] text-ink-faded">
        Link
        <br />
        expired
      </p>
      <p className="mt-6 max-w-[280px] text-[15px] font-medium text-ink/60">
        This invite was reset or the group was archived. Ask a friend in the group for a fresh link.
      </p>
      <a
        href="/"
        className="mt-6 inline-flex h-14 items-center rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
      >
        Go to Settld
      </a>
    </main>
  );
}
