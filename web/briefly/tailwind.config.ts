import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem"
    },
    extend: {
      colors: {
        midnight: "#132a3b",
        surface: "#1f3a4e",
        overlay: "#0f2231",
        accent: "#ffa563",
        teal: "#37a8ae",
        tealDeep: "#2a7997",
        tealSoft: "#93c8c2",
        muted: "#c7d9e7",
        ink: "#0c1824",
        borderSoft: "rgba(147,200,194,0.28)"
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"]
      },
      boxShadow: {
        glow: "0 20px 80px rgba(55,168,174,0.22)",
        accent: "0 16px 45px rgba(255,165,99,0.35)"
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at 10% 20%, rgba(55,168,174,0.25), transparent 22%), radial-gradient(circle at 80% 0%, rgba(255,165,99,0.25), transparent 28%), radial-gradient(circle at 40% 70%, rgba(42,121,151,0.2), transparent 32%)",
        grain: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 0)",
        "glow-border": "linear-gradient(120deg, rgba(55,168,174,0.45), rgba(255,165,99,0.45), rgba(55,168,174,0.45))"
      },
      animation: {
        float: "float 12s ease-in-out infinite",
        shimmer: "shimmer 18s ease-in-out infinite",
        "slide-up": "slide-up 0.6s ease-out both"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" }
        },
        shimmer: {
          "0%": { opacity: 0.55 },
          "50%": { opacity: 1 },
          "100%": { opacity: 0.55 }
        },
        "slide-up": {
          "0%": { opacity: 0, transform: "translateY(20px)" },
          "100%": { opacity: 1, transform: "translateY(0px)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
