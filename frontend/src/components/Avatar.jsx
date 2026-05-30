export default function Avatar({ name, size = 'md', className = '', bgColor = 'bg-primary' }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-2xl',
  }

  return (
    <div
      className={`
        ${sizeClasses[size]} ${bgColor}
        rounded-full flex items-center justify-center font-semibold text-white
        ${className}
      `}
    >
      {initials}
    </div>
  )
}
