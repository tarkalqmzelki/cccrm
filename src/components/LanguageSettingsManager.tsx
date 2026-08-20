import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Save, Languages, X, Search } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input, Textarea } from './ui/Input'
import { Skeleton } from './ui/Skeleton'
import { Modal } from './ui/Modal'
import { TRANSLATION_KEYS, ENGLISH_TRANSLATIONS, type LanguageTranslations } from '../lib/translations'
import { dateShort } from '../lib/format'

/**
 * Admin panel for managing document translations.  English defaults
 * ship in code; admins add languages (bg, de, it, …) and override any
 * of the fixed labels used on printed invoices + contracts.  Creating
 * a language opens a big editor modal with ALL entries pre-filled
 * with English defaults ready for translation.
 */
export function LanguageSettingsManager() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listLanguageTranslations(), [])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<LanguageTranslations | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LanguageTranslations | null>(null)

  const langs = data ?? []

  function startNew() { setEditing(null); setEditorOpen(true) }
  function startEdit(l: LanguageTranslations) { setEditing(l); setEditorOpen(true) }

  async function remove(id: string) {
    try {
      await db.deleteLanguageTranslation(id)
      push({ tone: 'info', title: 'Language deleted' })
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
      <div className="rounded-xl border border-line bg-ink-50/40 px-4 py-3">
        <p className="text-2xs text-ink-500">
          English is the built-in default. Add languages here to translate every fixed label on printed invoices and contracts —
          seller, issued by, total due, company details, footers, everything. When generating a document, pick the language and all
          fixed labels switch to the translated version.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">{langs.length} language{langs.length === 1 ? '' : 's'}</p>
        <Button size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={startNew}>Add language</Button>
      </div>

      {langs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
          <Languages size={22} strokeWidth={1.75} className="text-ink-300 mx-auto" />
          <p className="mt-2 text-sm text-ink-400">No languages yet — English is used for all documents.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {langs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-ink-50 transition-colors">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink">
                <Languages size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {l.language_label || l.language}
                  <code className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-500">{l.language}</code>
                </p>
                <p className="text-2xs text-ink-400">
                  {Object.values(l.translations).filter((v) => v.trim()).length} / {TRANSLATION_KEYS.length} entries · Updated {dateShort(l.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => startEdit(l)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                  <Pencil size={14} strokeWidth={1.75} />
                </button>
                <button onClick={() => setDeleteTarget(l)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-negBg hover:text-neg">
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LanguageEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={reload}
        editing={editing}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete language?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.75} />} onClick={() => deleteTarget && remove(deleteTarget.id)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">Delete <strong>{deleteTarget?.language_label || deleteTarget?.language}</strong>? Documents in this language will fall back to English.</p>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* LanguageEditor — big modal with ALL translation entries            */
/* ------------------------------------------------------------------ */
function LanguageEditor({
  open, onClose, onSaved, editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing: LanguageTranslations | null
}) {
  const { push } = useToast()
  const [language, setLanguage] = useState('')
  const [languageLabel, setLanguageLabel] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setLanguage(editing.language)
      setLanguageLabel(editing.language_label)
      // Pre-fill with saved values + English defaults for any missing keys
      setValues({ ...ENGLISH_TRANSLATIONS, ...editing.translations })
    } else {
      setLanguage('')
      setLanguageLabel('')
      setValues({ ...ENGLISH_TRANSLATIONS })
    }
    setSearch('')
  }, [open, editing])

  // Group keys by section, filtered by search
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const m: Record<string, typeof TRANSLATION_KEYS> = {}
    for (const def of TRANSLATION_KEYS) {
      if (q && !def.label.toLowerCase().includes(q) && !def.key.includes(q)) continue
      if (!m[def.group]) m[def.group] = []
      m[def.group].push(def)
    }
    return m
  }, [search])

  const translatedCount = useMemo(
    () => Object.entries(values).filter(([k, v]) => v.trim() && v !== ENGLISH_TRANSLATIONS[k]).length,
    [values],
  )

  async function save() {
    if (!language.trim()) { push({ tone: 'error', title: 'Language code is required' }); return }
    if (!languageLabel.trim()) { push({ tone: 'error', title: 'Language label is required' }); return }
    setSaving(true)
    try {
      // Only save entries that differ from English (smaller payload,
      // missing keys fall back automatically).
      const deltas: Record<string, string> = {}
      for (const def of TRANSLATION_KEYS) {
        const v = values[def.key]?.trim()
        if (v && v !== ENGLISH_TRANSLATIONS[def.key]) deltas[def.key] = v
      }
      if (editing) {
        await db.updateLanguageTranslation(editing.id, { language: language.trim().toLowerCase(), language_label: languageLabel.trim(), translations: deltas })
        push({ tone: 'success', title: 'Language updated' })
      } else {
        await db.createLanguageTranslation({ language: language.trim().toLowerCase(), language_label: languageLabel.trim(), translations: deltas })
        push({ tone: 'success', title: 'Language created' })
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
      title={editing ? `Edit ${editing.language_label} translations` : 'New language'}
      desc="Translate the fixed labels used on printed invoices and contracts. Pre-filled with English — edit what you need, leave the rest as English."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save language'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Language meta */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-2xs font-medium uppercase tracking-wider text-ink-400">Language code</label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="bg" className="mt-1 font-mono text-sm" />
            <p className="mt-1 text-2xs text-ink-400">e.g. en, bg, de, it, fr</p>
          </div>
          <div>
            <label className="text-2xs font-medium uppercase tracking-wider text-ink-400">Language label</label>
            <Input value={languageLabel} onChange={(e) => setLanguageLabel(e.target.value)} placeholder="Български" className="mt-1" />
            <p className="mt-1 text-2xs text-ink-400">Shown in language pickers when generating documents</p>
          </div>
        </div>

        {/* Progress + search */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-medium text-ink-600">
            {translatedCount} / {TRANSLATION_KEYS.length} translated
          </span>
          <div className="relative ml-auto w-56">
            <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries…"
              className="h-9 w-full rounded-lg border border-line bg-ink-50/60 pl-8 pr-8 text-sm text-ink placeholder:text-ink-300 focus:outline-none focus:border-ink"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink">
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        {/* Translation entries grouped by section */}
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {Object.entries(groups).map(([group, keys]) => (
            <div key={group} className="rounded-xl border border-line p-3">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">{group}</p>
              <div className="space-y-2">
                {keys.map((def) => (
                  <div key={def.key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[180px_1fr]">
                    <div className="min-w-0">
                      <p className="truncate text-2xs text-ink-400" title={def.key}>{def.label}</p>
                      <code className="hidden text-[10px] text-ink-300 sm:block">{def.key}</code>
                    </div>
                    <Input
                      value={values[def.key] ?? ''}
                      onChange={(e) => setValues((cur) => ({ ...cur, [def.key]: e.target.value }))}
                      placeholder={ENGLISH_TRANSLATIONS[def.key]}
                      className={values[def.key] !== ENGLISH_TRANSLATIONS[def.key] ? 'border-info/40' : ''}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
