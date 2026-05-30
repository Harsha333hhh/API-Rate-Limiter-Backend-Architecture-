export default function Avatar({ name = '', size = 'md', className = '', style = {} }) {
  const initials = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const fallback = initials || '?'

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-2xl',
  }

  return (
    <div
      className={`
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center font-semibold text-white
        ${className}
      `}
      style={{ backgroundColor: 'var(--color-primary)', ...style }}
    >
      {fallback}
    </div>
  )
}
