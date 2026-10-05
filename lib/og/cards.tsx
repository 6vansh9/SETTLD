/* Satori layouts (next/og): flexbox only, inline styles, hex colors. */
import { formatParts, type CurrencyCode } from "@/lib/money";
import { PASTEL_HEX, type Pastel } from "@/lib/pastels";

const INK = "#0E0E0E";
const CORAL = "#EE6A4B";
const micro = (size: number) => ({ fontFamily: "Inter", fontSize: size, letterSpacing: size * 0.08, textTransform: "uppercase" as const, opacity: 0.6 });

function Wordmark({ size }: { size: number }) {
  return <div style={{ fontFamily: "Anton", fontSize: size, textTransform: "uppercase", color: INK, display: "flex" }}>Settld</div>;
}

/** Faded-digit rule: symbol and decimals at 35%, whole number full strength (Jersey 10, ₹ via Inter fallback). */
function Money({ minor, currency, size }: { minor: number; currency: CurrencyCode; size: number }) {
  const p = formatParts(minor, currency);
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Jersey 10, Inter", fontSize: size, lineHeight: 1, color: INK }}>
      <span style={{ opacity: 0.35 }}>{p.symbol}</span>
      <span>{p.whole}</span>
      <span style={{ opacity: 0.35 }}>{p.fraction}</span>
    </div>
  );
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 12.5l5 5L20 6.5" stroke={INK} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface InviteCardData {
  name: string;
  emoji: string;
  color: Pastel;
  memberCount: number;
}

/** 1200×630 link preview for /join/<token>. */
export function InviteCard({ name, emoji, color, memberCount }: InviteCardData) {
  const bg = PASTEL_HEX[color] ?? PASTEL_HEX.pink;
  const long = name.length > 14;
  return (
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: bg, color: INK }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={40} />
        <div style={{ ...micro(24), display: "flex" }}>You&apos;re invited</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 110, display: "flex" }}>{emoji}</div>
        <div style={{ fontFamily: "Anton", fontSize: long ? 120 : 170, lineHeight: 0.9, textTransform: "uppercase", display: "flex", marginTop: 12 }}>{name}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <div style={{ fontFamily: "Jersey 10", fontSize: 72, lineHeight: 1, display: "flex" }}>{String(memberCount)}</div>
          <div style={{ ...micro(26), display: "flex" }}>{memberCount === 1 ? "member" : "members"} · splitting live</div>
        </div>
        <div style={{ display: "flex", background: CORAL, borderRadius: 999, padding: "20px 40px", fontFamily: "Big Shoulders Display", fontSize: 40, textTransform: "uppercase" }}>
          Tap to join
        </div>
      </div>
    </div>
  );
}

export interface ReceiptCardData {
  from: string;
  to: string;
  amount: number;
  currency: CurrencyCode;
  groupName: string;
  color: Pastel;
  date: string; // e.g. "05 OCT 2026"
}

/** Settle-up receipt: 1080×1920 (stories) or 1200×630 (chats). */
export function ReceiptCard({ data, size }: { data: ReceiptCardData; size: "story" | "chat" }) {
  const bg = PASTEL_HEX[data.color] ?? PASTEL_HEX.pink;
  const first = (s: string) => s.split(" ")[0];
  const story = size === "story";
  const W = story ? 1080 : 1200;
  const H = story ? 1920 : 630;
  const names = `${first(data.from)} → ${first(data.to)}`;
  const nameSize = story ? (names.length > 16 ? 150 : 190) : names.length > 16 ? 96 : 120;

  const stamp = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: story ? 14 : 10,
        border: `${story ? 6 : 5}px solid ${INK}`,
        borderRadius: 999,
        padding: story ? "18px 34px" : "12px 26px",
        transform: "rotate(-8deg)",
        fontFamily: "Big Shoulders Display",
        fontSize: story ? 64 : 44,
        textTransform: "uppercase",
      }}
    >
      Settld <Check size={story ? 56 : 40} />
    </div>
  );

  return (
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: story ? 96 : 64, background: bg, color: INK }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={story ? 56 : 40} />
        <div style={{ ...micro(story ? 30 : 22), display: "flex" }}>{data.date}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: story ? 40 : 16 }}>
        <div style={{ ...micro(story ? 32 : 22), display: "flex" }}>{data.groupName} · settled up</div>
        <div style={{ fontFamily: "Anton", fontSize: nameSize, lineHeight: 0.9, textTransform: "uppercase", display: "flex", flexWrap: "wrap" }}>{names}</div>
        <Money minor={data.amount} currency={data.currency} size={story ? 260 : 150} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ ...micro(story ? 26 : 18), display: "flex" }}>Split it. Settle it.</div>
        {stamp}
      </div>
    </div>
  );
}
