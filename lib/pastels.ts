export const PASTELS = ["pink", "sky", "mint", "butter", "lilac", "peach"] as const;
export type Pastel = (typeof PASTELS)[number];

/** CSS color for a pastel token, or pass through any other CSS color. */
export function pastelVar(color: Pastel | string): string {
  return (PASTELS as readonly string[]).includes(color) ? `var(--${color})` : color;
}

/** A slightly darker tint of a pastel (dog-ears, pressed states). */
export function pastelShade(color: Pastel | string, amount = 14): string {
  return `color-mix(in srgb, ${pastelVar(color)}, #000 ${amount}%)`;
}

/** Hex values (same as globals.css) for places CSS variables can't reach: meta theme-color, OG. */
export const PASTEL_HEX: Record<Pastel, string> = {
  pink: "#F6C9E4",
  sky: "#7FB2F0",
  mint: "#C8F2C2",
  butter: "#F7D58A",
  lilac: "#D7C6F5",
  peach: "#FFC7A8",
};
