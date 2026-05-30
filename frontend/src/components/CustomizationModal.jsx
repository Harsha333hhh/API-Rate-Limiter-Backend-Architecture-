import { useTheme, ACCENT_PRESETS } from '../context/ThemeContext'

export default function CustomizationModal({ isOpen, onClose }) {
  const { theme, toggleTheme, accentPreset, setAccent } = useTheme()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-md p-6 slide-down">
        <h2 className="text-xl font-semibold text-text mb-6">Appearance</h2>

        <div className="space-y-6">
          {/* Theme Toggle */}
          <div>
            <div className="label block mb-3">Theme</div>
            <div className="flex gap-2">
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${
                  theme === 'light'
                    ? 'bg-primary text-white'
                    : 'bg-raised text-text hover:bg-raised/80 border border-line'
                }`}
              >
                ☀️ Light
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${
                  theme === 'dark'
                    ? 'bg-primary text-white'
                    : 'bg-raised text-text hover:bg-raised/80 border border-line'
                }`}
              >
                🌙 Dark
              </button>
            </div>
          </div>

          {/* Accent Presets */}
          <div>
            <div className="label block mb-3">Accent Preset</div>
            <div className="space-y-2">
              {Object.values(ACCENT_PRESETS).map((preset) => {
                const isPrimary = accentPreset === preset.id
                const isSelected = preset.id === accentPreset
                return (
                  <button
                    key={preset.id}
                    onClick={() => setAccent(preset.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition border ${
                      isSelected
                        ? 'bg-primary/10 border-primary'
                        : 'bg-raised border-line hover:bg-raised/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text">{preset.name}</span>
                      {isSelected && <span className="text-primary font-bold">✓</span>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: preset.colors.primary }}
                      />
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: preset.colors.accent }}
                      />
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
