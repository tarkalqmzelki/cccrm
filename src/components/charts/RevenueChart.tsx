import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { eur } from '../../lib/format'

export function RevenueChart({ data, height = 220 }: { data: { label: string; value: number }[]; height?: number }) {
  return (
    <div className="text-ink-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.12} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'currentColor' }}
            axisLine={false}
            tickLine={false}
            dy={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'currentColor' }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => eur(v as number)}
          />
          <Tooltip
            cursor={{ stroke: 'currentColor', strokeWidth: 1 }}
            contentStyle={{
              background: 'var(--glass-strong-bg)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-strong-border)',
              borderRadius: 12,
              fontSize: 12,
              boxShadow: '0 8px 32px var(--shadow-glass)',
              padding: '8px 12px',
              color: 'rgb(var(--ink))',
            }}
            formatter={(v: number) => [eur(v), 'Revenue']}
            labelStyle={{ color: 'rgb(var(--ink-500))', fontWeight: 500 }}
          />
          <Area type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
