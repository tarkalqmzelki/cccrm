import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Printer, Trash2, Eye, FileText, FilePlus2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from './ui/Card'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Skeleton } from './ui/Skeleton'
import { Badge } from './ui/Badge'
import { Select } from './ui/Input'
import { useToast } from '../context/ToastContext'
import { ContractEditor } from './ContractEditor'
import { FormalContractDocument } from './FormalContractDocument'
import { CONTRACT_STATUS_META, DEFAULT_INVOICE_SETTINGS } from '../lib/types'
import type { Contract, ContractStatus, ContractTemplate, InvoiceSettings, ContractTemplateVariant } from '../lib/types'
import type { LanguageTranslations } from '../lib/translations'
import { dateShort } from '../lib/format'

interface Props {
  refreshKey?: number
  onContractsChanged?: () => void
  /** Called when the admin clicks "Create Invoice" on an active
   *  contract — opens the invoice editor with the contract ref
   *  pre-filled. */
  onCreateInvoice?: (contractNumber: string) => void
}

export function ContractsTab({ refreshKey, onContractsChanged, onCreateInvoice }: Props) {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => {
    const [contracts, templates, settings, langs] = await Promise.all([
      db.listContracts(),
      db.listContractTemplates(),
      db.getInvoiceSettings(),
      db.listLanguageTranslations().catch(() => [] as LanguageTranslations[]),
    ])
    return {
      contracts,
      templates: templates as ContractTemplate[],
      settings: (settings || DEFAULT_INVOICE_SETTINGS) as InvoiceSettings,
      languages: (langs || []) as LanguageTranslations[],
    }
  }, [refreshKey])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [preview, setPreview] = useState<Contract | null>(null)
  const [previewVariants, setPreviewVariants] = useState<ContractTemplateVariant[]>([])
  const [previewVariantId, setPreviewVariantId] = useState('')
  const [printLang, setPrintLang] = useState('en')
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null)

  const contracts = data?.contracts || []
  const templates = data?.templates || []
  const settings = data?.settings || DEFAULT_INVOICE_SETTINGS
  const languages = data?.languages || []

  const stats = useMemo(() => {
    const total = contracts.length
    const active = contracts.filter((c) => c.status === 'active').length
    const draft = contracts.filter((c) => c.status === 'draft').length
    const expired = contracts.filter((c) => c.status === 'expired' || c.status === 'terminated').length
    return { total, active, draft, expired }
  }, [contracts])

  function startNew() { setEditing(null); setEditorOpen(true) }
  function startEdit(c: Contract) { setEditing(c); setEditorOpen(true) }

  async function openPreview(c: Contract) {
    setPreview(c)
    setPreviewVariantId('')
    setPrintLang('en')
    // Load language variants for the contract's template
    if (c.template_id) {
      try {
        const vs = await db.listContractVariants(c.template_id)
        setPreviewVariants(vs)
      } catch { setPreviewVariants([]) }
    } else {
      setPreviewVariants([])
    }
  }

  /** Pick a print language — switches BOTH the fixed labels (via the
   *  translations map) AND the template body (by selecting the
   *  template variant whose language matches, when one exists). */
  function pickPrintLang(lang: string) {
    setPrintLang(lang)
    if (lang === 'en') {
      setPreviewVariantId('')
      return
    }
    // Find a template variant for this language (e.g. the 'bg' variant)
    const variant = previewVariants.find((v) => v.language === lang)
    setPreviewVariantId(variant ? variant.id : '')
  }

  /** All selectable languages — the union of:
   *  1. Languages configured in Language Settings (fixed-label translations)
   *  2. Languages that have a template variant for this contract's template
   *  Deduplicated by language code.  'en' is always implicitly first. */
  const availableLangs = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of languages) m.set(l.language, l.language_label || l.language)
    for (const v of previewVariants) {
      if (!m.has(v.language)) m.set(v.language, v.language_label || v.language)
    }
    return Array.from(m.entries()).map(([code, label]) => ({ code, label }))
  }, [languages, previewVariants])

  // The effective template = base template + selected variant's body/placeholders
  const previewTemplate = useMemo(() => {
    if (!preview || !preview.template_id) return null
    const base = templates.find((t) => t.id === preview.template_id) || null
    if (!base) return null
    if (!previewVariantId) return base
    const variant = previewVariants.find((v) => v.id === previewVariantId)
    if (!variant) return base
    return { ...base, body: variant.body, custom_placeholders: variant.custom_placeholders ?? [] }
  }, [preview, templates, previewVariants, previewVariantId])

  async function remove(c: Contract) {
    try {
      await db.deleteContract(c.id)
      push({ tone: 'info', title: 'Contract deleted' })
      setDeleteTarget(null)
      reload()
      onContractsChanged?.()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Contracts</h2>
          <p className="mt-1 text-sm text-ink-400">
            Generate, edit, and print contracts. Templates are managed in Settings → Contract Templates.
          </p>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={startNew}>New contract</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Total" value={String(stats.total)} />
        <StatBox label="Active" value={String(stats.active)} tone="pos" />
        <StatBox label="Draft" value={String(stats.draft)} tone="neutral" />
        <StatBox label="Expired/Terminated" value={String(stats.expired)} tone="warn" />
      </div>

      {/* List */}
      <Card>
        <CardHeader title="All contracts" desc={`${contracts.length} contract${contracts.length === 1 ? '' : 's'}`} />
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <FileText size={22} strokeWidth={1.75} className="text-ink-300" />
            <p className="text-sm text-ink-400">No contracts yet — click <strong>New contract</strong> to generate your first one.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {contracts.map((c) => {
              const meta = CONTRACT_STATUS_META[c.status as ContractStatus] ?? CONTRACT_STATUS_META.draft
              const tpl = templates.find((t) => t.id === c.template_id)
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 hover:bg-ink-50 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink">
                    <FileText size={16} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold font-mono">{c.number}</p>
                      <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    </div>
                    <p className="truncate text-2xs text-ink-400">
                      {c.counterparty_name}{c.counterparty_company ? ` · ${c.counterparty_company}` : ''}
                      {tpl ? ` · ${tpl.name}` : ''}
                      {' · '}{dateShort(c.issue_date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.status === 'active' && onCreateInvoice && (
                      <button onClick={() => onCreateInvoice(c.number)} title="Create invoice for this contract" className="grid h-8 w-8 place-items-center rounded-lg text-pos hover:bg-posBg">
                        <FilePlus2 size={14} strokeWidth={1.75} />
                      </button>
                    )}
                    <button onClick={() => openPreview(c)} title="Preview" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                      <Eye size={14} strokeWidth={1.75} />
                    </button>
                    <button onClick={() => startEdit(c)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button onClick={() => setDeleteTarget(c)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-negBg hover:text-neg">
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Editor */}
      <ContractEditor
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditing(null) }}
        onSaved={() => { reload(); onContractsChanged?.() }}
        editing={editing}
        templates={templates}
        issuerSettings={settings}
      />

      {/* On-screen preview modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `Contract ${preview.number}` : ''}
        desc="On-screen preview. Click Print to produce the formal PDF document."
        size="lg"
        className="no-print"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>
            <Button icon={<Printer size={14} strokeWidth={1.75} />} onClick={() => window.print()}>Print contract</Button>
          </>
        }
      >
        {preview && (
          <div className="rounded-xl border border-line p-5">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <p className="text-base font-semibold">{settings.company_name}</p>
                <p className="text-2xs text-ink-400">{settings.company_subname}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tracking-wide">CONTRACT</p>
                <p className="font-mono text-2xs text-ink-500">{preview.number}</p>
              </div>
            </div>
            {availableLangs.length > 0 && (
              <div className="mt-3">
                <label className="text-2xs uppercase tracking-wider text-ink-400">Language</label>
                {/* Animated pill selector — EN default + every available language
                    (from Language Settings AND template variants). Selected pill
                    gets an animated blueish stroke ring. Picking a language
                    switches BOTH the fixed labels AND the template body. */}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <LangPill
                    label="EN"
                    title="English (default)"
                    active={printLang === 'en'}
                    onClick={() => pickPrintLang('en')}
                  />
                  {availableLangs.map((l) => (
                    <LangPill
                      key={l.code}
                      label={l.code.toUpperCase()}
                      title={l.label}
                      active={printLang === l.code}
                      onClick={() => pickPrintLang(l.code)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-2xs uppercase tracking-wider text-ink-400">Between</p>
                <p className="font-medium">{settings.company_name}</p>
                <p className="text-ink-500">{settings.company_subname}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wider text-ink-400">And</p>
                <p className="font-medium">{preview.counterparty_name}</p>
                {preview.counterparty_company && <p className="text-ink-500">{preview.counterparty_company}</p>}
              </div>
            </div>
            <div className="mt-4 text-xs">
              <p><strong>Issued:</strong> {dateShort(preview.issue_date)}</p>
              {preview.start_date && <p><strong>Effective:</strong> {dateShort(preview.start_date)}</p>}
            </div>
            {previewTemplate && (
              <div className="mt-4 max-h-[40vh] overflow-y-auto rounded-lg bg-ink-50 p-4">
                <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink-400">{previewTemplate.name}</p>
                <div className="md text-2xs text-ink-600">
                  {previewTemplate.body.slice(0, 500)}{previewTemplate.body.length > 500 ? '…' : ''}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Formal printable document */}
      {preview && (
        <FormalContractDocument
          contract={preview}
          template={previewTemplate}
          settings={settings}
          translations={printLang === 'en' ? null : languages.find((l) => l.language === printLang)?.translations ?? null}
        />
      )}

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete contract?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.75} />} onClick={() => deleteTarget && remove(deleteTarget)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">Delete <strong>{deleteTarget?.number}</strong>? This cannot be undone.</p>
      </Modal>
    </div>
  )
}

function StatBox({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'info' | 'warn' | 'pos' | 'neg' }) {
  const toneClass = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : 'text-ink'
  return (
    <div className="card">
      <p className="text-sm text-ink-400">{label}</p>
      <p className={`mt-2 num text-xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
    </div>
  )
}

/* Language pill — mini label button with an animated blueish stroke
   ring when selected. Used in the contract preview modal to pick the
   print language (EN default + configured languages). */
function LangPill({ label, title, active, onClick }: { label: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      whileTap={{ scale: 0.94 }}
      animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={active ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] } : { duration: 0.15 }}
      className={`relative rounded-full px-3 py-1.5 text-2xs font-semibold tracking-wide transition-colors ${
        active
          ? 'text-info ring-2 ring-info/50 bg-infoBg'
          : 'text-ink-500 border border-line bg-surface hover:bg-ink-50 hover:text-ink'
      }`}
    >
      {label}
    </motion.button>
  )
}
