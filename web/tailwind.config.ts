import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DeltaK terminal palette
        quantum: {
          DEFAULT: "#00f0ff",
          dim: "#0891a3",
          glow: "rgba(0, 240, 255, 0.16)",
        },
        aegis: "#10b981",
        zenith: "#f43f5e",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        quantum: "0 0 0 1px rgba(0,240,255,0.28), 0 0 22px rgba(0,240,255,0.10)",
        panel: "inset 0 1px 0 0 rgba(255,255,255,0.03)",
      },
      keyframes: {
        "tick-up": {
          "0%": { backgroundColor: "rgba(16,185,129,0.28)" },
          "100%": { backgroundColor: "transparent" },
        },
        "tick-down": {
          "0%": { backgroundColor: "rgba(244,63,94,0.28)" },
          "100%": { backgroundColor: "transparent" },
        },
        "pulse-ring": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        drift: {
          "0%, 100%": { transform: "translate(-50%, -50%) scale(1)", opacity: "0.7" },
          "50%": { transform: "translate(-50%, -50%) scale(1.2)", opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "hazard-scroll": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "24px 0" },
        },
      },
      animation: {
        "tick-up": "tick-up 620ms ease-out",
        "tick-down": "tick-down 620ms ease-out",
        "pulse-ring": "pulse-ring 2s ease-in-out infinite",
        scan: "scan 5s linear infinite",
        drift: "drift 6s ease-in-out infinite",
        "fade-up": "fade-up 500ms ease-out both",
        "hazard-scroll": "hazard-scroll 1600ms linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
