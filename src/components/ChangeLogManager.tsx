import { useEffect, useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, Save } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { Skeleton } from './ui/Skeleton'
import { CHANGELOG_LABEL_META, CHANGELOG_LABELS } from '../lib/types'
import type { ChangelogEntry, ChangelogLabel } from '../lib/types'
import { dateShort } from '../lib/format'

/**
 * Admin-only editor for changelog entries.  Create / edit / delete /
 * publish-unpublish.  Drafts (published=false) are hidden from users.
 */
export function ChangeLogManager() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listChangelog(true), [])

  const [draftLabel, setDraftLabel] = useState<ChangelogLabel>('NEW')
  const [draftVersion, setDraftVersion] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftPublished, setDraftPublished] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    if (editingId) {
      const e = data.find((x) => x.id === editingId)
      if (e) {
        setDraftLabel(e.label)
        setDraftVersion(e.version)
        setDraftTitle(e.title)
        setDraftBody(e.body)
        setDraftPublished(e.published)
      }
    }
  }, [editingId, data])

  function resetDraft() {
    setEditingId(null)
    setDraftLabel('NEW')
    setDraftVersion('')
    setDraftTitle('')
    setDraftBody('')
    setDraftPublished(true)
  }

  async function save() {
    if (!draftTitle.trim()) {
      push({ tone: 'error', title: 'Title is required' })
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await db.updateChangelog(editingId, {
          label: draftLabel,
          version: draftVersion,
          title: draftTitle,
          body: draftBody,
          published: draftPublished,
        })
        push({ tone: 'success', title: 'Entry updated' })
      } else {
        await db.createChangelog({
          label: draftLabel,
          version: draftVersion,
          title: draftTitle,
          body: draftBody,
          published: draftPublished,
        })
        push({ tone: 'success', title: 'Entry created' })
      }
      resetDraft()
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this changelog entry?')) return
    try {
      await db.deleteChangelog(id)
      push({ tone: 'info', title: 'Entry deleted' })
      if (editingId === id) resetDraft()
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  async function togglePublish(e: ChangelogEntry) {
    try {
      await db.updateChangelog(e.id, { published: !e.published })
      reload()
    } catch (err: any) {
      push({ tone: 'error', title: 'Could not toggle', desc: err?.message })
    }
  }

  return (
    <div className="space-y-4">
      {/* Editor */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-ink">{editingId ? 'Edit entry' : 'Add new entry'}</p>
          {editingId && (
            <button onClick={resetDraft} className="text-2xs text-ink-400 hover:text-ink-600 transition-colors">
              Cancel edit
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <Field label="Title" required>
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Push notifications launched" />
            </Field>
            <Field label="Version" hint="optional">
              <Input value={draftVersion} onChange={(e) => setDraftVersion(e.target.value)} placeholder="1.15" />
            </Field>
          </div>

          <Field label="Label">
            <div className="flex flex-wrap gap-1.5">
              {CHANGELOG_LABELS.map((l) => {
                const meta = CHANGELOG_LABEL_META[l]
                const selected = draftLabel === l
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setDraftLabel(l)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-medium transition-colors ${
                      selected ? 'border-transparent text-white' : 'border-line text-ink-500 hover:bg-ink-50'
                    }`}
                    style={selected ? { background: meta.color } : undefined}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Description" hint="Shown to all users in the changelog modal">
            <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={3} placeholder="Describe what was added, fixed, or improved…" />
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={draftPublished}
              onChange={(e) => setDraftPublished(e.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            Publish (visible to all users)
          </label>

          <div className="flex justify-end">
            <Button size="sm" icon={<Save size={13} strokeWidth={1.75} />} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add entry'}
            </Button>
          </div>
        </div>
      </div>

      {/* Existing entries */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-400">
          No changelog entries yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {(data ?? []).map((e: ChangelogEntry) => {
            const meta = CHANGELOG_LABEL_META[e.label as ChangelogLabel] ?? CHANGELOG_LABEL_META.NEW
            return (
              <div key={e.id} className={`flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 ${!e.published ? 'opacity-60' : ''}`}>
                <span
                  className="mt-0.5 rounded-full px-2 py-0.5 text-2xs font-medium text-white shrink-0"
                  style={{ background: meta.color }}
                >
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {e.title}
                    {e.version && <span className="ml-1.5 font-normal text-ink-400">v{e.version}</span>}
                  </p>
                  <p className="text-2xs text-ink-400">{dateShort(e.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => togglePublish(e)}
                    title={e.published ? 'Hide from users' : 'Publish'}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600 transition-colors"
                  >
                    {e.published ? <Eye size={13} strokeWidth={1.75} /> : <EyeOff size={13} strokeWidth={1.75} />}
                  </button>
                  <button
                    onClick={() => setEditingId(e.id)}
                    title="Edit"
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600 transition-colors"
                  >
                    <Plus size={13} strokeWidth={1.75} className="rotate-45" />
                  </button>
                  <button
                    onClick={() => remove(e.id)}
                    title="Delete"
                    className="rounded p-1 text-ink-400 hover:bg-negBg hover:text-neg transition-colors"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
