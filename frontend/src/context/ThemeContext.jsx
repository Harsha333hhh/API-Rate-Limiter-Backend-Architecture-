import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export const ACCENT_PRESETS = {
  'soft-blue-peach': {
    id: 'soft-blue-peach',
    name: 'Soft Blue + Peach',
    colors: {
      primary: '#5b8def',
      accent: '#ffb38a',
    },
  },
  'mint-cream': {
    id: 'mint-cream',
    name: 'Mint + Cream',
    colors: {
      primary: '#14b8a6',
      accent: '#fef3c7',
    },
  },
  'indigo-amber': {
    id: 'indigo-amber',
    name: 'Indigo + Amber',
    colors: {
      primary: '#6366f1',
      accent: '#fbbf24',
    },
  },
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')
  const [accentPreset, setAccentPreset] = useState('soft-blue-peach')
  const [isLoaded, setIsLoaded] = useState(false)

  // Load theme and accent from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'light'
    const savedAccent = localStorage.getItem('app-accent') || 'soft-blue-peach'
    setTheme(savedTheme)
    setAccentPreset(savedAccent)
    applyTheme(savedTheme, savedAccent)
    setIsLoaded(true)
  }, [])

  const applyTheme = (themeValue, accentValue) => {
    const htmlElement = document.documentElement

    // Set theme attribute
    if (themeValue === 'dark') {
      htmlElement.setAttribute('data-theme', 'dark')
    } else {
      htmlElement.removeAttribute('data-theme')
    }

    // Set accent attribute
    htmlElement.setAttribute('data-accent', accentValue)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('app-theme', newTheme)
    applyTheme(newTheme, accentPreset)
  }

  const setAccent = (presetId) => {
    setAccentPreset(presetId)
    localStorage.setItem('app-accent', presetId)
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
