import { useEffect, useState } from 'react'
import { Save, Eye, Code, GitBranch, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Textarea } from './ui/Input'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'

interface Props {
  open: boolean
  onClose: () => void
  docId: string
  initialStructure: string
  onSaved?: () => void
}

/**
 * Modal where the admin writes the long-form "how was this built"
 * notes for an Admin Doc entry — the "Structure View".  Markdown body,
 * with a Write / Preview toggle like the parent AdminDocEditor.
 */
export function StructureEditor({ open, onClose, docId, initialStructure, onSaved }: Props) {
  const { push } = useToast()
  const [structure, setStructure] = useState('')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setStructure(initialStructure ?? '')
    setMode('write')
  }, [open, initialStructure])

  async function save() {
    setSaving(true)
    try {
      await db.updateAdminDoc(docId, { structure })
      push({ tone: 'success', title: 'Structure view saved' })
      onSaved?.()
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
      title="Structure view"
      desc="Describe how this update was built — what files were touched, what the data flow is, why the chosen approach. Markdown; triple-backtick code blocks render as styled code."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save structure'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          <button
            onClick={() => setMode('write')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'write' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}
          >
            <Code size={14} strokeWidth={1.75} /> Write
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'preview' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}
          >
            <Eye size={14} strokeWidth={1.75} /> Preview
          </button>
        </div>

        {mode === 'write' ? (
          <Textarea
            value={structure}
            onChange={(e) => setStructure(e.target.value)}
            rows={16}
            placeholder={`# How it was built\n\n1. \`\`\`ts\n// the key change\nawait db.createScheduledActivity({ type: 'reminder', … })\n\`\`\`\n2. Why this approach…`}
            className="font-mono text-[13px] leading-relaxed"
          />
        ) : (
          <div className="md min-h-[20rem] max-h-[55vh] overflow-y-auto rounded-xl border border-line bg-surface p-5">
            {structure.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{structure}</ReactMarkdown>
            ) : (
              <p className="text-sm text-ink-400">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Inline trigger button + editor in one — used in the read modal
 *  header to let the admin open the structure editor quickly. */
export function StructureEditorButton({
  docId,
  structure,
  onSaved,
}: {
  docId: string
  structure: string
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<GitBranch size={13} strokeWidth={1.75} />}
        onClick={() => setOpen(true)}
      >
        {structure ? 'Edit structure view' : 'Add structure view'}
      </Button>
      <StructureEditor
        open={open}
        onClose={() => setOpen(false)}
        docId={docId}
        initialStructure={structure}
        onSaved={onSaved}
      />
    </>
  )
}

/** Read-only structure view rendered inside the read modal. */
export function StructureView({ structure }: { structure: string }) {
  if (!structure?.trim()) return null
  return (
    <div className="rounded-xl border border-line bg-ink-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <GitBranch size={14} strokeWidth={1.75} className="text-ink-600" />
        <p className="text-sm font-semibold">Structure view — how this was built</p>
      </div>
      <div className="md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{structure}</ReactMarkdown>
      </div>
    </div>
  )
}

/** A small pill that opens the read-only StructureView inside the read
 *  modal — clicking it expands the structure section. */
export function StructureViewToggle({
  structure,
  hasContent,
}: {
  structure: string
  hasContent: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!hasContent) return null
  return (
    <div className="rounded-xl border border-line">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-ink hover:bg-ink-50 transition-colors"
      >
        <Pencil size={14} strokeWidth={1.75} className="text-ink-600" />
        Structure view
        <span className="ml-auto text-2xs text-ink-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-line p-4">
          <StructureView structure={structure} />
        </div>
      )}
    </div>
  )
}
