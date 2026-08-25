import { CloudRain, Crown, Flag, Flame, Gem, Zap } from 'lucide-react'
import type { AchievementKey } from '../../lib/gamification'

const MEDAL_STYLE: Record<AchievementKey, { icon: React.ReactNode; cls: string }> = {
  first_deal:   { icon: <Flag size={11} strokeWidth={2} />,        cls: 'bg-infoBg text-info border-info/25' },
  club_10k:     { icon: <Gem size={11} strokeWidth={2} />,          cls: 'bg-warnBg text-warn border-warn/25' },
  deal_machine: { icon: <Zap size={11} strokeWidth={2} />,          cls: 'bg-posBg text-pos border-pos/25' },
  rainmaker:   { icon: <CloudRain size={11} strokeWidth={2} />,    cls: 'bg-infoBg text-info border-info/25' },
  crown:        { icon: <Crown size={11} strokeWidth={2} />,        cls: 'bg-amber-100 text-amber-600 border-amber-300 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/30' },
  on_fire:      { icon: <Flame size={11} strokeWidth={2} />,        cls: 'bg-negBg text-neg border-neg/25' },
}

/** Row of mini medal chips. `max` limits how many show before a +n chip. */
export function AchievementMedals({ achievements, max = 6 }: { achievements: AchievementKey[]; max?: number }) {
  if (achievements.length === 0) return null
  const shown = achievements.slice(0, max)
  const hidden = achievements.length - shown.length
  return (
    <span className="inline-flex items-center gap-1">
      {shown.map((k) => (
        <span
          key={k}
          title={`${MEDAL_STYLE[k].icon ? '' : ''}${k.replace(/_/g, ' ')}`}
          aria-label={k.replace(/_/g, ' ')}
          className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border ${MEDAL_STYLE[k].cls}`}
        >
          {MEDAL_STYLE[k].icon}
        </span>
      ))}
      {hidden > 0 && <span className="text-2xs font-semibold text-ink-300">+{hidden}</span>}
    </span>
  )
}

export function medalLabel(k: AchievementKey): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
