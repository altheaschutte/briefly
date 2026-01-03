import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

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
        midnight: "#FFFFFF",
        surface: "#F3EFEA",
        overlay: "#E2DFDB",
        accent: "#A2845E",
        teal: "#A2845E",
        tealDeep: "#9F9A95",
        tealSoft: "#A2845E",
        muted: "#8A8A8E",
        ink: "#2E2E2E",
        borderSoft: "#E2DFDB",
        navBar: "#2F2F2F",
        navInactive: "#B3B3B3"
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"]
      },
      boxShadow: {
        glow: "0 20px 80px rgba(162,132,94,0.18)",
        accent: "0 16px 45px rgba(162,132,94,0.25)"
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at 10% 20%, rgba(162,132,94,0.18), transparent 28%), radial-gradient(circle at 80% 0%, rgba(226,223,219,0.8), transparent 32%), radial-gradient(circle at 40% 70%, rgba(159,154,149,0.18), transparent 30%)",
        grain: "radial-gradient(rgba(46,46,46,0.05) 1px, transparent 0)",
        "glow-border": "linear-gradient(120deg, rgba(162,132,94,0.35), rgba(159,154,149,0.25), rgba(162,132,94,0.35))"
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
          "0%": { opacity: "0.55" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0.55" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0px)" }
        }
      }
    }
  },
  plugins: [typography]
};

export default config;
