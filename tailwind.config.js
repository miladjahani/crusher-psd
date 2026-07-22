/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#070b10', 900: '#0b0f14', 800: '#121820', 700: '#1a222d' },
        // driven by CSS variable so the accent is user-switchable at runtime
        accent: 'rgb(var(--accent) / <alpha-value>)',
      },
      boxShadow: {
        glow: '0 0 22px rgb(var(--accent) / 0.35)',
      },
    },
  },
  plugins: [],
};
