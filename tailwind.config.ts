import type { Config } from "tailwindcss";

/** Colors are CSS variables (see app/globals.css) stored as RGB channels so opacity modifiers work. */
const token = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        ink: {
          DEFAULT: token("ink"),
          faded: "var(--ink-faded)",
        },
        surface: token("surface"),
        pink: token("pink"),
        sky: token("sky"),
        mint: token("mint"),
        butter: token("butter"),
        lilac: token("lilac"),
        peach: token("peach"),
        coral: token("coral"),
        owe: token("owe"),
        owed: token("owed"),
        "owe-ink": token("owe-ink"),
        "owed-ink": token("owed-ink"),
        "on-pastel": token("on-pastel"),
      },
      fontFamily: {
        display: ["var(--font-anton)", "Impact", "sans-serif"],
        "display-alt": ["var(--font-big-shoulders)", "var(--font-inter)", "sans-serif"],
        // Jersey 10 lacks some currency glyphs (₹ €); the browser falls back to Inter per glyph.
        num: ["var(--font-jersey)", "var(--font-inter)", "monospace"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "24px",
      },
      maxWidth: {
        app: "480px",
      },
      spacing: {
        screen: "20px",
      },
    },
  },
  plugins: [],
};
export default config;
