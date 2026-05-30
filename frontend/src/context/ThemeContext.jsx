import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export const ACCENT_PRESETS = {
  'soft-blue': {
    id: 'soft-blue',
    name: 'Soft Blue',
    colors: {
      primary: '#5b8def',
      primaryHover: '#436fd9',
      primarySoft: '#e8f0ff',
      primarySoftStrong: '#d9e6ff',
    },
  },
  'warm-peach': {
    id: 'warm-peach',
    name: 'Warm Peach',
    colors: {
      primary: '#f59e7a',
      primaryHover: '#ea8456',
      primarySoft: '#ffefe6',
      primarySoftStrong: '#ffe1d2',
    },
  },
  'mint-green': {
    id: 'mint-green',
    name: 'Mint Green',
    colors: {
      primary: '#14b8a6',
      primaryHover: '#0f9488',
      primarySoft: '#e2fbf7',
      primarySoftStrong: '#cbf6ee',
    },
  },
  indigo: {
    id: 'indigo',
    name: 'Indigo',
    colors: {
      primary: '#6366f1',
      primaryHover: '#4f46e5',
      primarySoft: '#eceeff',
      primarySoftStrong: '#dde2ff',
    },
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    colors: {
      primary: '#ec6a8e',
      primaryHover: '#db4d75',
      primarySoft: '#fff0f5',
      primarySoftStrong: '#ffdce8',
    },
  },
}

const THEME_VARS = {
  light: {
    '--color-bg': '#f6f8fb',
    '--color-surface': '#ffffff',
    '--color-raised': '#f9fbfe',
    '--color-line': '#dfe6ef',
    '--color-text': '#1f2937',
    '--color-text-secondary': '#6b7280',
    '--color-muted': '#94a3b8',
    '--color-received': '#eef3fa',
    '--color-badge-text': '#ffffff',
    '--color-meter': '#f59e0b',
  },
  dark: {
    '--color-bg': '#0f1720',
    '--color-surface': '#18212d',
    '--color-raised': '#202a39',
    '--color-line': '#314055',
    '--color-text': '#f3f4f6',
    '--color-text-secondary': '#cbd5e1',
    '--color-muted': '#94a3b8',
    '--color-received': '#243244',
    '--color-badge-text': '#ffffff',
    '--color-meter': '#fbbf24',
  },
}

const STORAGE_THEME_KEY = 'whisper-theme'
const STORAGE_ACCENT_KEY = 'whisper-accent'

function applyTheme(themeValue, accentValue) {
  const root = document.documentElement
  const accent = ACCENT_PRESETS[accentValue] || ACCENT_PRESETS['soft-blue']
  const themeVars = THEME_VARS[themeValue] || THEME_VARS.light

  if (themeValue === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else {
    root.removeAttribute('data-theme')
  }

  root.setAttribute('data-accent', accent.id)

  for (const [key, value] of Object.entries(themeVars)) {
    root.style.setProperty(key, value)
  }

  root.style.setProperty('--color-primary', accent.colors.primary)
  root.style.setProperty('--color-primary-hover', accent.colors.primaryHover)
  root.style.setProperty('--color-primary-soft', accent.colors.primarySoft)
  root.style.setProperty('--color-primary-soft-strong', accent.colors.primarySoftStrong)
  root.style.setProperty('--color-sent', accent.colors.primary)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')
  const [accentPreset, setAccentPreset] = useState('soft-blue')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_THEME_KEY) || 'light'
    const savedAccent = localStorage.getItem(STORAGE_ACCENT_KEY) || 'soft-blue'
    setTheme(savedTheme)
    setAccentPreset(savedAccent)
    applyTheme(savedTheme, savedAccent)
    setIsLoaded(true)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem(STORAGE_THEME_KEY, newTheme)
    applyTheme(newTheme, accentPreset)
  }

  const setAccent = (presetId) => {
    setAccentPreset(presetId)
    localStorage.setItem(STORAGE_ACCENT_KEY, presetId)
    applyTheme(theme, presetId)
  }

  if (!isLoaded) return null

  return (
    <ThemeContext.Provider value={{ theme, accentPreset, toggleTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
