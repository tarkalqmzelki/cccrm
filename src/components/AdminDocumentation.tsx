import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, FileText, Tag, BookOpen, X, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Skeleton } from './ui/Skeleton'
import { Modal } from './ui/Modal'
import { AdminDocEditor } from './AdminDocEditor'
import type { AdminDoc } from '../lib/types'
import { dateShort } from '../lib/format'

/**
 * Admin Documentation panel — shown under Settings → System → Admin
 * Documentation.  Search across title + body + tags; filter by a
 * custom category; click a row to read it (rendered markdown); edit
 * or delete via the header buttons.
 */
export function AdminDocumentation() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listAdminDocs(), [])
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<AdminDoc | null>(null)
  const [viewing, setViewing] = useState<AdminDoc | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminDoc | null>(null)

  const docs = data ?? []

  // Distinct categories — for the dropdown + the editor's datalist
  const categories = useMemo(
    () => Array.from(new Set(docs.map((d) => d.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [docs],
  )

  // Distinct tags — for quick-filter chips below the search bar
  const allTags = useMemo(
    () => Array.from(new Set(docs.flatMap((d) => d.tags))).sort((a, b) => a.localeCompare(b)),
    [docs],
  )
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return docs.filter((d) => {
      if (activeCategory !== 'all' && d.category !== activeCategory) return false
      if (activeTag && !d.tags.includes(activeTag)) return false
      if (!q) return true
      return (
        d.title.toLowerCase().includes(q) ||
        d.body.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        d.category.toLowerCase().includes(q)
      )
    })
  }, [docs, query, activeCategory, activeTag])

  function startNew() {
    setEditing(null)
    setEditorOpen(true)
  }
  function startEdit(d: AdminDoc) {
    setEditing(d)
    setViewing(null)
    setEditorOpen(true)
  }

  async function remove(d: AdminDoc) {
    try {
      await db.deleteAdminDoc(d.id)
      push({ tone: 'info', title: 'Document deleted' })
      setDeleteTarget(null)
      if (viewing?.id === d.id) setViewing(null)
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  const hasActiveFilters = query.trim() || activeCategory !== 'all' || activeTag

  function clearFilters() {
    setQuery('')
    setActiveCategory('all')
    setActiveTag(null)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + New button */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          {docs.length} document{docs.length === 1 ? '' : 's'}{hasActiveFilters ? ` · ${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : ''}
        </p>
        <Button size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={startNew}>New document</Button>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, body, tags…" className="pl-9 h-10" />
        </div>
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          className="h-10 w-40 rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink"
        >
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-2xs font-medium text-ink-500 hover:bg-ink-50">
            <X size={13} strokeWidth={1.75} /> Clear
          </button>
        )}
      </div>

      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => {
            const active = activeTag === t
            return (
              <button
                key={t}
                onClick={() => setActiveTag(active ? null : t)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors ${
                  active ? 'bg-ink text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                }`}
              >
                <Tag size={10} strokeWidth={2} />
                {t}
              </button>
            )
          })}
        </div>
      )}

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
          <BookOpen size={20} strokeWidth={1.75} className="text-ink-300 mx-auto" />
          <p className="mt-2 text-sm text-ink-400">
            {docs.length === 0 ? 'No documents yet — create your first one' : 'No documents match your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setViewing(d)}
              className="group flex w-full items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-ink-50"
            >
              <div className="mt-0.5 rounded-lg bg-ink-50 p-1.5 group-hover:bg-ink-100 transition-colors">
                <FileText size={15} strokeWidth={1.75} className="text-ink-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink">{d.title}</p>
                  <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-500">{d.category}</span>
                </div>
                <p className="mt-0.5 text-2xs text-ink-400 line-clamp-2">
                  {stripMarkdown(d.body) || 'No content'}
                </p>
                {d.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {d.tags.slice(0, 5).map((t) => (
                      <span key={t} className="rounded bg-ink-50 px-1.5 py-0.5 text-2xs text-ink-500">#{t}</span>
                    ))}
                    {d.tags.length > 5 && <span className="text-2xs text-ink-400">+{d.tags.length - 5}</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(d) }}
                  title="Edit"
                  className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(d) }}
                  title="Delete"
                  className="rounded p-1 text-ink-400 hover:bg-negBg hover:text-neg"
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Editor modal */}
      <AdminDocEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={reload}
        categories={categories}
        editing={editing}
      />

      {/* Read modal — renders the markdown body */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title}
        desc={
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-600">{viewing?.category}</span>
            {viewing?.tags.map((t) => (
              <span key={t} className="rounded bg-ink-50 px-1.5 py-0.5 text-2xs text-ink-500">#{t}</span>
            ))}
            <span className="text-2xs text-ink-400">Updated {viewing && dateShort(viewing.updated_at)}</span>
          </span>
        }
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>
            {viewing && (
              <Button icon={<Pencil size={15} strokeWidth={1.75} />} onClick={() => startEdit(viewing)}>Edit</Button>
            )}
          </>
        }
      >
        <div className="md max-h-[65vh] overflow-y-auto">
          {viewing?.body.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{viewing.body}</ReactMarkdown>
          ) : (
            <p className="text-sm text-ink-400">This document is empty.</p>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete document?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.75} />} onClick={() => deleteTarget && remove(deleteTarget)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">Delete <strong>{deleteTarget?.title}</strong>? This cannot be undone.</p>
      </Modal>
    </div>
  )
}

/** Quick markdown strip — for the list preview.  Real rendering uses
 *  react-markdown in the read modal. */
function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]*`/g, '[code]')
    .replace(/[#*_>~]/g, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
    .slice(0, 180)
}
