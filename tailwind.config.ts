import type { Config } from "tailwindcss";

// Flat design system: solid colours only, 1px borders, 6px radius, 8px grid.
// Gradients, shadows and blur are deliberately disabled below.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#FFFFFF",
      bg: "#FFFFFF",
      surface: "#F7F7F8",
      ink: "#111111",
      muted: "#6B7280",
      line: "#E5E7EB",
      accent: { DEFAULT: "#1D4ED8", dark: "#1E40AF" },
      danger: "#B91C1C",
      success: "#15803D",
      skeleton: "#E5E7EB",
    },
    borderRadius: { none: "0", DEFAULT: "6px", full: "9999px" },
    boxShadow: { none: "none" },
    backgroundImage: {},
    backdropBlur: {},
    blur: {},
    dropShadow: {},
    fontFamily: {
      sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
    },
    // Max three text sizes in body content: sm, base, lg (plus xl for page titles).
    fontSize: {
      sm: ["0.875rem", { lineHeight: "1.25rem" }],
      base: ["1rem", { lineHeight: "1.5rem" }],
      lg: ["1.25rem", { lineHeight: "1.75rem" }],
      xl: ["1.75rem", { lineHeight: "2.25rem" }],
    },
    extend: {},
  },
  plugins: [],
};
export default config;
