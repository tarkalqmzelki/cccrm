import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Save, FileText, Eye, Code, Braces } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input, Field, Textarea, Select } from './ui/Input'
import { Skeleton } from './ui/Skeleton'
import { Modal } from './ui/Modal'
import { CONTRACT_PLACEHOLDERS } from '../lib/types'
import type { ContractTemplate, CustomPlaceholderDef } from '../lib/types'
import { dateShort } from '../lib/format'

/**
 * Admin panel for managing contract templates.  Each template has a
 * name, a description, and a markdown body with {placeholders} that
 * get filled in from the contract's counterparty data + the issuer
 * settings when the PDF is rendered.
 */
export function ContractTemplateManager() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listContractTemplates(), [])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ContractTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ContractTemplate | null>(null)

  const templates = data ?? []

  function startNew() { setEditing(null); setEditorOpen(true) }
  function startEdit(t: ContractTemplate) { setEditing(t); setEditorOpen(true) }

  async function remove(id: string) {
    try {
      await db.deleteContractTemplate(id)
      push({ tone: 'info', title: 'Template deleted' })
      setDeleteTarget(null)
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
  }

  return (
    <div className="space-y-4">
      {/* Placeholder reference */}
      <div className="rounded-xl border border-line bg-ink-50/40 px-4 py-3">
        <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-ink-400">Available placeholders</p>
        <p className="text-2xs text-ink-500 mb-2">Use these in the template body — they'll be replaced with real values when a contract is generated:</p>
        <div className="flex flex-wrap gap-1">
          {CONTRACT_PLACEHOLDERS.map((p) => (
            <code key={p} className="rounded bg-surface px-1.5 py-0.5 text-2xs text-ink-600 ring-1 ring-line">{p}</code>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">{templates.length} template{templates.length === 1 ? '' : 's'}</p>
        <Button size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={startNew}>New template</Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
          <FileText size={22} strokeWidth={1.75} className="text-ink-300 mx-auto" />
          <p className="mt-2 text-sm text-ink-400">No contract templates yet. Create one to start generating contracts.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-ink-50 transition-colors">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink">
                <FileText size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                {t.description && <p className="truncate text-2xs text-ink-400">{t.description}</p>}
                <p className="text-2xs text-ink-400">Updated {dateShort(t.updated_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => startEdit(t)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                  <Pencil size={14} strokeWidth={1.75} />
                </button>
                <button onClick={() => setDeleteTarget(t)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-negBg hover:text-neg">
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={reload} editing={editing} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete template?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.75} />} onClick={() => deleteTarget && remove(deleteTarget.id)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">Delete <strong>{deleteTarget?.name}</strong>? Contracts that used this template keep their content — only the link is removed.</p>
      </Modal>
    </div>
  )
}

function TemplateEditor({
  open, onClose, onSaved, editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing: ContractTemplate | null
}) {
  const { push } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [placeholders, setPlaceholders] = useState<CustomPlaceholderDef[]>([])
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setDescription(editing.description)
      setBody(editing.body)
      setPlaceholders(editing.custom_placeholders ?? [])
    } else {
      setName(''); setDescription(''); setBody(''); setPlaceholders([])
    }
    setMode('write')
  }, [open, editing])

  function addPlaceholder() {
    setPlaceholders((cur) => [...cur, { key: '', label: '', type: 'text' }])
  }
  function updatePlaceholder(idx: number, patch: Partial<CustomPlaceholderDef>) {
    setPlaceholders((cur) => cur.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  function removePlaceholder(idx: number) {
    setPlaceholders((cur) => cur.filter((_, i) => i !== idx))
  }

  async function save() {
    if (!name.trim()) { push({ tone: 'error', title: 'Name is required' }); return }
    // Validate placeholder keys — no spaces, no duplicates
    const cleanPlaceholders = placeholders
      .filter((p) => p.key.trim() && p.label.trim())
      .map((p) => ({ key: p.key.trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase(), label: p.label.trim(), type: p.type }))
    const keys = cleanPlaceholders.map((p) => p.key)
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
    if (dupes.length > 0) { push({ tone: 'error', title: 'Duplicate placeholder keys', desc: `Duplicate: ${dupes.join(', ')}` }); return }
    // Check no collision with built-in placeholders
    const builtIn = CONTRACT_PLACEHOLDERS.map((p) => p.replace(/[{}]/g, ''))
    const collision = keys.filter((k) => builtIn.includes(k))
    if (collision.length > 0) { push({ tone: 'error', title: 'Placeholder key conflicts with built-in', desc: `Reserved: ${collision.join(', ')}` }); return }

    setSaving(true)
    try {
      if (editing) {
        await db.updateContractTemplate(editing.id, { name: name.trim(), description: description.trim(), body, custom_placeholders: cleanPlaceholders })
        push({ tone: 'success', title: 'Template updated' })
      } else {
        await db.createContractTemplate({ name: name.trim(), description: description.trim(), body, custom_placeholders: cleanPlaceholders })
        push({ tone: 'success', title: 'Template created' })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  // Build the combined placeholder list for the reference panel
  const allPlaceholders = [
    ...CONTRACT_PLACEHOLDERS,
    ...placeholders.filter((p) => p.key.trim()).map((p) => `{${p.key.trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase()}}`),
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit template' : 'New contract template'}
      desc="Write the contract text with {placeholders}. They'll be replaced with real data when a contract is generated."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save template'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Template name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service Agreement" />
          </Field>
          <Field label="Description" hint="Short label">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="For client service contracts" />
          </Field>
        </div>

        {/* Custom placeholders editor */}
        <div className="rounded-xl border border-line bg-ink-50/30 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Braces size={14} strokeWidth={1.75} className="text-ink-600" />
              <p className="text-sm font-medium">Custom placeholders</p>
            </div>
            <Button size="sm" variant="secondary" icon={<Plus size={13} strokeWidth={1.75} />} onClick={addPlaceholder}>Add</Button>
          </div>
          <p className="mb-2 text-2xs text-ink-400">
            Define your own placeholders (e.g. <code className="rounded bg-surface px-1">payable</code>, <code className="rounded bg-surface px-1">delivery_date</code>).
            Use them as <code className="rounded bg-surface px-1">{'{payable}'}</code> in the template body. Fill in per-contract values when generating.
          </p>
          {placeholders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-2xs text-ink-400">
              No custom placeholders yet. Click <strong>Add</strong> to create one.
            </p>
          ) : (
            <div className="space-y-1.5">
              {placeholders.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-1.5">
                    <span className="text-2xs text-ink-400 font-mono">{'{'}</span>
                    <Input
                      value={p.key}
                      onChange={(e) => updatePlaceholder(idx, { key: e.target.value })}
                      placeholder="payable"
                      className="h-9 font-mono text-sm"
                    />
                    <span className="text-2xs text-ink-400 font-mono">{'}'}</span>
                  </div>
                  <Input
                    value={p.label}
                    onChange={(e) => updatePlaceholder(idx, { label: e.target.value })}
                    placeholder="Amount payable (€)"
                    className="h-9 flex-1"
                  />
                  <Select
                    value={p.type}
                    onChange={(e) => updatePlaceholder(idx, { type: e.target.value as CustomPlaceholderDef['type'] })}
                    className="h-9 w-28"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="textarea">Long text</option>
                  </Select>
                  <button
                    type="button"
                    onClick={() => removePlaceholder(idx)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-300 hover:bg-negBg hover:text-neg"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Placeholder reference */}
        <div className="rounded-xl border border-line bg-ink-50/40 px-3 py-2">
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-ink-400">All available placeholders</p>
          <div className="flex flex-wrap gap-1">
            {allPlaceholders.map((p) => (
              <code key={p} className="rounded bg-surface px-1.5 py-0.5 text-2xs text-ink-600 ring-1 ring-line">{p}</code>
            ))}
          </div>
        </div>

        {/* Write / Preview toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          <button onClick={() => setMode('write')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'write' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}>
            <Code size={14} strokeWidth={1.75} /> Write
          </button>
          <button onClick={() => setMode('preview')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'preview' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}>
            <Eye size={14} strokeWidth={1.75} /> Preview
          </button>
        </div>

        {mode === 'write' ? (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            placeholder={`# SERVICE AGREEMENT\n\nThis Agreement is entered into on {issue_date}\nby {company_name} and {counterparty_name}…\n\n**Amount payable:** {payable} EUR`}
            className="font-mono text-[13px] leading-relaxed"
          />
        ) : (
          <div className="md min-h-[24rem] max-h-[55vh] overflow-y-auto rounded-xl border border-line bg-surface p-5">
            {body.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown> : <p className="text-sm text-ink-400">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
