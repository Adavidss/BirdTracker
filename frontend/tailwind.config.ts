import type { Config } from "tailwindcss";

// Dark-first palette (same chassis as ConcertFinder): near-black canvas, muted
// slate chrome, and a leafy green accent for the seasonality charts.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Chrome colors are CSS variables so they flip between light/dark themes
        // (RGB triplets enable Tailwind's /alpha modifiers like bg-canvas/80).
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--c-surface-2) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        fg: "rgb(var(--c-fg) / <alpha-value>)", // primary text
        strong: "rgb(var(--c-strong) / <alpha-value>)", // emphasized text
        // Accent reads well on both themes — kept fixed.
        leaf: {
          DEFAULT: "#34d399",
          dim: "#059669",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
