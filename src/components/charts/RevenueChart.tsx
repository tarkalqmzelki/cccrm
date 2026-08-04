import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { eur } from '../../lib/format'

export function RevenueChart({ data, height = 220 }: { data: { label: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A0A0A" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#0A0A0A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#A3A3A3' }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#A3A3A3' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => eur(v as number)}
        />
        <Tooltip
          cursor={{ stroke: '#D4D4D4', strokeWidth: 1 }}
          contentStyle={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.6)',
            borderRadius: 12,
            fontSize: 12,
            boxShadow: '0 8px 32px rgba(10,10,10,0.10)',
            padding: '8px 12px',
          }}
          formatter={(v: number) => [eur(v), 'Revenue']}
          labelStyle={{ color: '#525252', fontWeight: 500 }}
        />
        <Area type="monotone" dataKey="value" stroke="#0A0A0A" strokeWidth={2} fill="url(#rev)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
