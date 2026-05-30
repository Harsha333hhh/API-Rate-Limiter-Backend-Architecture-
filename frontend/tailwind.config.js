/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        sans: ['"Plus Jakarta Sans", "Manrope"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        // Light theme (default)
        bg: 'var(--color-bg, #f4f7fb)',
        surface: 'var(--color-surface, #ffffff)',
        raised: 'var(--color-raised, #f9fafb)',
        line: 'var(--color-line, #e5e7eb)',
        text: 'var(--color-text, #1f2937)',
        'text-secondary': 'var(--color-text-secondary, #6b7280)',
        muted: 'var(--color-muted, #9ca3af)',
        primary: 'var(--color-primary, #5b8def)',
        'primary-dim': 'var(--color-primary-dim, #4a7bce)',
        sent: 'var(--color-sent, #5b8def)',
        received: 'var(--color-received, #e8eef7)',
        accent: 'var(--color-accent, #ffb38a)',
        'accent-dim': 'var(--color-accent-dim, #ff9f6e)',
        danger: '#ef4444',
        ok: '#10b981',
      },
    },
  },
  plugins: [],
}
