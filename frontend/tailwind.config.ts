import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    {
      pattern: /^(bg|border|text|from|to|shadow)-(emerald|cyan|blue|red|orange|indigo|yellow|pink|fuchsia|teal|slate|zinc|violet|rose|lime)-(50|100|200|300|400|500|600|700|800|900)$/,
    },
    {
      pattern: /^(shadow)-(emerald|cyan|blue|red|orange|indigo|yellow|pink|fuchsia|teal|slate|zinc|violet|rose|lime)-500\/(20|30|40)$/,
    }
  ],
  theme: {
    extend: {
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translate3d(-4px, 0, 0)' },
          '20%, 40%, 60%, 80%': { transform: 'translate3d(4px, 0, 0)' },
        },
        shimmer: {
          '100%': { left: '100%' },
        }
      },
      animation: {
        shake: 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both',
        shimmer: 'shimmer 1s ease-out infinite'
      },
      fontSize: {
        xs: ['var(--text-xs, 0.75rem)', { lineHeight: 'var(--lh-xs, 1rem)' }],
        sm: ['var(--text-sm, 0.875rem)', { lineHeight: 'var(--lh-sm, 1.25rem)' }],
        base: ['var(--text-base, 1rem)', { lineHeight: 'var(--lh-base, 1.5rem)' }],
        lg: ['var(--text-lg, 1.125rem)', { lineHeight: 'var(--lh-lg, 1.75rem)' }],
        xl: ['var(--text-xl, 1.25rem)', { lineHeight: 'var(--lh-xl, 1.75rem)' }],
        '2xl': ['var(--text-2xl, 1.5rem)', { lineHeight: 'var(--lh-2xl, 2rem)' }],
        '3xl': ['var(--text-3xl, 1.875rem)', { lineHeight: 'var(--lh-3xl, 2.25rem)' }],
        '4xl': ['var(--text-4xl, 2.25rem)', { lineHeight: 'var(--lh-4xl, 2.5rem)' }],
        '5xl': ['var(--text-5xl, 3rem)', { lineHeight: 'var(--lh-5xl, 1)' }],
        '6xl': ['var(--text-6xl, 3.75rem)', { lineHeight: 'var(--lh-6xl, 1)' }],
        '7xl': ['var(--text-7xl, 4.5rem)', { lineHeight: 'var(--lh-7xl, 1)' }],
        '8xl': ['var(--text-8xl, 6rem)', { lineHeight: 'var(--lh-8xl, 1)' }],
        '9xl': ['var(--text-9xl, 8rem)', { lineHeight: 'var(--lh-9xl, 1)' }],
      },
    },
  },
  plugins: [],
};

export default config;
