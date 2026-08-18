import { useEffect, useState } from 'react'
import { Plus, Trash2, Code2, Pencil, Save, X } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { Modal } from './ui/Modal'
import { Skeleton } from './ui/Skeleton'
import type { AdminDocSnippet } from '../lib/types'
import { dateShort } from '../lib/format'

const LANGUAGES = ['', 'ts', 'tsx', 'js', 'jsx', 'sql', 'json', 'css', 'html', 'bash', 'py']

interface Props {
  docId: string
}

/**
 * Manage + render the code snippets attached to a single Admin Doc.
 * Used inside the Admin Doc read modal — shows existing snippets as
 * styled code blocks (rendered by react-markdown in the parent, or
 * inline <pre> here) and lets the admin add / edit / delete them.
 */
export function AdminDocSnippets({ docId }: Props) {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listAdminDocSnippets(docId), [docId])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<AdminDocSnippet | null>(null)

  const snippets = data ?? []

  function openNew() {
    setEditing(null)
    setEditorOpen(true)
  }
  function openEdit(s: AdminDocSnippet) {
    setEditing(s)
    setEditorOpen(true)
  }

  async function remove(id: string) {
    if (!confirm('Delete this snippet?')) return
    try {
      await db.deleteAdminDocSnippet(id)
      push({ tone: 'info', title: 'Snippet deleted' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 size={14} strokeWidth={1.75} className="text-ink-600" />
          <p className="text-sm font-semibold">Code snippets</p>
          <span className="text-2xs text-ink-400">{snippets.length}</span>
        </div>
        <Button size="sm" variant="secondary" icon={<Plus size={13} strokeWidth={1.75} />} onClick={openNew}>
          Add snippet
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : snippets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-400">
          No snippets attached yet. Click <strong>Add snippet</strong> to upload the code for this update.
        </div>
      ) : (
        <div className="space-y-3">
          {snippets.map((s) => (
            <div key={s.id} className="rounded-xl border border-line bg-ink-50/40 p-3">
              <div className="mb-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {s.title || <span className="text-ink-400">Untitled snippet</span>}
                    {s.language && <code className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-500">{s.language}</code>}
                  </p>
                  <p className="text-2xs text-ink-400">Added {dateShort(s.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => openEdit(s)} title="Edit" className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                    <Pencil size={13} strokeWidth={1.75} />
                  </button>
                  <button onClick={() => remove(s.id)} title="Delete" className="rounded p-1 text-ink-400 hover:bg-negBg hover:text-neg">
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-ink-900 p-3 text-2xs leading-relaxed text-ink-100">
                <code>{s.code}</code>
              </pre>
            </div>
          ))}
        </div>
      )}

      <SnippetEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={reload}
        docId={docId}
        editing={editing}
      />
    </div>
  )
}

function SnippetEditor({
  open, onClose, onSaved, docId, editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  docId: string
  editing: AdminDocSnippet | null
}) {
  const { push } = useToast()
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setTitle(editing.title)
      setLanguage(editing.language)
      setCode(editing.code)
    } else {
      setTitle('')
      setLanguage('')
      setCode('')
    }
  }, [open, editing])

  async function save() {
    if (!code.trim()) {
      push({ tone: 'error', title: 'Snippet code is required' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await db.updateAdminDocSnippet(editing.id, { title: title.trim(), language, code })
        push({ tone: 'success', title: 'Snippet updated' })
      } else {
        await db.createAdminDocSnippet({ doc_id: docId, title: title.trim(), language, code })
        push({ tone: 'success', title: 'Snippet added' })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit snippet' : 'Add snippet'}
      desc="Paste the code that illustrates how this update was implemented. Renders as a styled code block in the doc view."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save snippet'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="Title" hint="What does this snippet show?">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reminder modal save flow" />
          </Field>
          <Field label="Language" hint="For syntax hint">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l || 'Plain text'}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Code" required>
          <Textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={12}
            placeholder={`// Paste your code here…\n`}
            className="font-mono text-[13px] leading-relaxed"
          />
        </Field>
      </div>
    </Modal>
  )
}

/* Inline close button used by some snippet surfaces.  Exported so the
 * parent can re-use the styling if it wants to. */
export function SnippetCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600">
      <X size={14} strokeWidth={1.75} />
    </button>
  )
}
