/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#F4F5F7",
        surface: "#FFFFFF",
        soft: "#F1F3F6",
        line: "#E4E7EC",
        primary: "#1D4ED8",
        success: "#15803D",
        warning: "#B45309",
        danger: "#B91C1C",
        text: "#0F172A",
        muted: "#64748B",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.05)",
        pop: "0 8px 24px -4px rgb(16 24 40 / 0.12), 0 2px 6px 0 rgb(16 24 40 / 0.05)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};