import { useEffect, useMemo, useState } from 'react'
import { Eye, Code, Save, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import type { AdminDoc } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Existing categories — populates the dropdown + free-form input. */
  categories: string[]
  /** If set, edit this doc; if null, create new. */
  editing?: AdminDoc | null
}

/**
 * Editor for a single admin documentation entry.  Body is markdown;
 * the user can switch between Write (textarea) and Preview (rendered).
 * Pastes preserve formatting, and triple-backtick code blocks render
 * as styled code blocks automatically.
 */
export function AdminDocEditor({ open, onClose, onSaved, categories, editing }: Props) {
  const { push } = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('General')
  const [tagsInput, setTagsInput] = useState('')  // comma-separated
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setTitle(editing.title)
      setBody(editing.body)
      setCategory(editing.category)
      setTagsInput(editing.tags.join(', '))
    } else {
      setTitle('')
      setBody('')
      setCategory(categories[0] ?? 'General')
      setTagsInput('')
    }
    setMode('write')
  }, [open, editing, categories])

  const tags = useMemo(
    () => tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
    [tagsInput],
  )

  async function save() {
    if (!title.trim()) {
      push({ tone: 'error', title: 'Title is required' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await db.updateAdminDoc(editing.id, { title, body, category, tags })
        push({ tone: 'success', title: 'Document updated' })
      } else {
        await db.createAdminDoc({ title, body, category, tags })
        push({ tone: 'success', title: 'Document created' })
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
      title={editing ? 'Edit document' : 'New document'}
      desc="Markdown body — paste text with triple-backtick ``` code blocks and they render automatically."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save document'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How push notifications work" />
          </Field>
          <Field label="Category" hint="Free-form or pick existing">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="admin-doc-categories"
              placeholder="Auth"
            />
            <datalist id="admin-doc-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
        </div>

        <Field label="Tags" hint="Comma-separated (e.g. vapid, deno, edge-function)">
          <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="vapid, edge, push" />
        </Field>

        {/* Write / Preview toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          <button
            onClick={() => setMode('write')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'write' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'
            }`}
          >
            <Code size={14} strokeWidth={1.75} /> Write
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'preview' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'
            }`}
          >
            <Eye size={14} strokeWidth={1.75} /> Preview
          </button>
        </div>

        {mode === 'write' ? (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            placeholder={`# How push notifications work\n\nThe flow is:\n\n\`\`\`ts\nconst vapid = await vapidJwt(endpoint)\nawait webPush.sendNotification(sub, payload)\n\`\`\`\n\nInline \`code\` renders too.`}
            className="font-mono text-[13px] leading-relaxed"
          />
        ) : (
          <div className="md min-h-[24rem] max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface p-5">
            {body.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            ) : (
              <p className="text-sm text-ink-400">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
