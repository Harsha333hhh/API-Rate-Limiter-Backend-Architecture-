/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        bg: '#0e0d0b',
        surface: '#16140f',
        raised: '#1e1b15',
        line: '#2c281f',
        cream: '#f3ead8',
        muted: '#9a917f',
        gold: '#c9a25e',
        golddim: '#9c7a42',
        sent: '#c9a25e',
        danger: '#d86b5a',
        ok: '#8aa873',
      },
    },
  },
  plugins: [],
}
