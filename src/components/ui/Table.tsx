import { useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
  sortable?: boolean
  sortValue?: (row: T) => string | number
  className?: string
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowContext,
  sort,
  onSortChange,
  loading,
  empty,
  onRowClick,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowContext?: (e: ReactMouseEvent, row: T) => void
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSortChange?: (key: string) => void
  loading?: boolean
  empty?: ReactNode
  onRowClick?: (row: T) => void
}) {
  const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left')

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={`py-2.5 px-4 text-2xs font-medium uppercase tracking-wide text-ink-400 ${alignClass(c.align)} ${c.sortable ? 'cursor-pointer select-none' : ''}`}
                onClick={() => c.sortable && onSortChange?.(c.key)}
              >
                <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                  {c.header}
                  {c.sortable &&
                    (sort?.key === c.key ? (
                      sort.dir === 'asc' ? <ChevronUp size={12} strokeWidth={1.75} /> : <ChevronDown size={12} strokeWidth={1.75} />
                    ) : (
                      <ChevronsUpDown size={12} strokeWidth={1.75} className="text-ink-200" />
                    ))}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-line">
                {columns.map((c) => (
                  <td key={c.key} className="py-3 px-4">
                    <div className="skeleton h-4 w-24 rounded" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-12 px-4 text-center text-sm text-ink-400">
                {empty || 'No data yet'}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                onContextMenu={(e) => onRowContext?.(e, row)}
                className={`border-b border-line transition-colors ${onRowClick ? 'cursor-pointer' : ''} hover:bg-ink-50`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`py-3.5 px-4 text-sm text-ink-700 ${alignClass(c.align)} ${c.className || ''}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

export function useSort<T>(defaultKey: string, defaultDir: 'asc' | 'desc' = 'desc') {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: defaultKey, dir: defaultDir })
  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  return { sort, toggle }
}
