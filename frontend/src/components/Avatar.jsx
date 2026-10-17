import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

export default function Avatar({
  name = '',
  size = 'md',
  className = '',
  style = {},
  userId,
  profilePictureId,
}) {
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
  const imageUrl = userId && profilePictureId
    ? api.getUri({
        url: `/user-api/profile-picture/${encodeURIComponent(userId)}`,
        params: { v: profilePictureId },
      })
    : ''
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  return (
    <div
      className={`
        ${sizeClasses[size]}
        relative overflow-hidden rounded-full flex items-center justify-center font-semibold text-white shrink-0
        ${className}
      `}
      style={{ backgroundColor: 'var(--color-primary)', ...style }}
      role="img"
      aria-label={name ? `${name}'s profile picture` : 'Profile picture'}
    >
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt=""
          crossOrigin="use-credentials"
          loading="lazy"
          draggable="false"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{fallback}</span>
      )}
    </div>
  )
}
