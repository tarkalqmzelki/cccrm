import { initials } from '../../lib/format'

const palette = ['#0A0A0A', '#262626', '#404040', '#525252', '#737373']

export function Avatar({ name, color, url, size = 36 }: { name: string; color?: string; url?: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  const bg = color || palette[name.charCodeAt(0) % palette.length]
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white font-medium select-none"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name) || '?'}
    </span>
  )
}
