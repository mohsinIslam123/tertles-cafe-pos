/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Turtles Cafe brand: deep forest green
        brand: {
          50:  '#eef7f1',
          100: '#d5eadc',
          200: '#aed4bd',
          300: '#7db69a',
          400: '#4e9478',
          500: '#2d7a59',
          600: '#1a4731',  // primary
          700: '#163c29',
          800: '#122f21',
          900: '#0d221a',
        },
      },
      fontFamily: {
        // Clean, high-legibility sans for POS readability
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      screens: {
        // Primary target: Android phone in portrait
        xs: '360px',
      },
    },
  },
  plugins: [],
};
