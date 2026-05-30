import { useTheme, ACCENT_PRESETS } from '../context/ThemeContext.jsx'

export default function CustomizationModal({ isOpen, onClose }) {
  const { theme, toggleTheme, accentPreset, setAccent } = useTheme()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card surface-card w-full max-w-lg p-6 slide-down">
        <h2 className="font-display text-2xl text-text mb-2">Customization</h2>
        <p className="text-sm text-text-secondary mb-6">Choose your theme and a single accent that tints the most visible controls.</p>

        <div className="space-y-6">
          <div>
            <div className="label block mb-3">Theme</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition border ${
                  theme === 'light'
                    ? 'bg-primary text-white border-transparent'
                    : 'bg-raised text-text border-line hover:bg-primary-soft'
                }`}
              >
                <span aria-hidden>☀</span> Light
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition border ${
                  theme === 'dark'
                    ? 'bg-primary text-white border-transparent'
                    : 'bg-raised text-text border-line hover:bg-primary-soft'
                }`}
              >
                <span aria-hidden>☾</span> Dark
              </button>
            </div>
          </div>

          <div>
            <div className="label block mb-3">Accent</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.values(ACCENT_PRESETS).map((preset) => {
                const isSelected = preset.id === accentPreset
                return (
                  <button
                    key={preset.id}
                    onClick={() => setAccent(preset.id)}
                    className={`w-full text-left px-4 py-3 rounded-2xl transition border ${
                      isSelected
                        ? 'bg-primary-soft border-primary'
                        : 'bg-raised border-line hover:bg-primary-soft'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text">{preset.name}</span>
                      {isSelected && <span className="text-primary font-bold">✓</span>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.colors.primary }} />
                      <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.colors.primarySoft }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="pt-4">
            <button onClick={onClose} className="btn-primary w-full">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
