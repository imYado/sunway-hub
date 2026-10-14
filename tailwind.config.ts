import type { Config } from "tailwindcss";

// Monochrome editorial design: black and white with one grey surface, 1px dividers,
// pill buttons. Light and dark mode share everything except the colour values, which
// come from CSS variables in globals.css. Gradients, shadows and blur are disabled.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: v("bg"),
      surface: v("surface"),
      ink: v("ink"),
      muted: v("muted"),
      line: v("line"),
      // "On ink": text placed on an ink-filled element such as the primary button.
      "on-ink": v("bg"),
      white: v("bg"),
      accent: { DEFAULT: v("ink"), dark: v("ink") },
      // Red is kept only for errors and destructive actions, so they stay recognisable.
      danger: v("danger"),
      success: v("ink"),
      skeleton: v("line"),
    },
    borderRadius: { none: "0", DEFAULT: "8px", full: "9999px" },
    boxShadow: { none: "none" },
    backgroundImage: {},
    backdropBlur: {},
    blur: {},
    dropShadow: {},
    fontFamily: {
      sans: ['"Hanken Grotesk Variable"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      display: ['"Archivo Variable"', '"Hanken Grotesk Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
    },
    fontSize: {
      sm: ["0.9375rem", { lineHeight: "1.5" }],
      base: ["1.0625rem", { lineHeight: "1.6" }],
      lg: ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
      xl: ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.035em" }],
    },
    extend: {
      maxWidth: { content: "1200px" },
    },
  },
  plugins: [],
};
export default config;
