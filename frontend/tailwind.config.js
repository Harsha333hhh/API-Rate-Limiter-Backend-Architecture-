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
        'primary-hover': 'var(--color-primary-hover, #4a7bce)',
        'primary-soft': 'var(--color-primary-soft, #e8f0ff)',
        'primary-soft-strong': 'var(--color-primary-soft-strong, #d9e6ff)',
        sent: 'var(--color-sent, #5b8def)',
        received: 'var(--color-received, #e8eef7)',
        meter: 'var(--color-meter, #f59e0b)',
        danger: '#ef4444',
        ok: '#10b981',
      },
    },
  },
  plugins: [],
}
