import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Save, Globe, X, Search, Braces, Eye } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input, Textarea } from './ui/Input'
import { Skeleton } from './ui/Skeleton'
import { Modal } from './ui/Modal'
import { LOCALE_KEYS, ENGLISH_LOCALE, type PlatformLocale } from '../lib/platformLocales'
import { dateShort } from '../lib/format'

/**
 * Admin panel for PLATFORM UI locales (nav, buttons, labels — nothing
 * to do with invoice/contract document translations).  English is the
 * built-in default; admins add locales (bg, de, …) and override any
 * UI string.  Users pick their locale in Profile Settings — the
 * choice is per-account, not global.
 */
export function PlatformLocaleManager() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listPlatformLocales(), [])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<PlatformLocale | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PlatformLocale | null>(null)

  const list = data ?? []

  function startNew() { setEditing(null); setEditorOpen(true) }
  function startEdit(l: PlatformLocale) { setEditing(l); setEditorOpen(true) }

  async function remove(id: string) {
    try {
      await db.deletePlatformLocale(id)
      push({ tone: 'info', title: 'Locale deleted' })
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
          Translate the platform interface — navigation, buttons, labels, toasts. English is built in; add locales here and
          users can switch to them from Profile Settings. Each user's language choice applies only to their own account.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">{list.length} locale{list.length === 1 ? '' : 's'} (English built-in)</p>
        <Button size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={startNew}>Add locale</Button>
      </div>

      {/* English — always present, read-only */}
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink">
          <Globe size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">English <code className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-500">en</code></p>
          <p className="text-2xs text-ink-400">Built-in default — always available</p>
        </div>
      </div>

      {list.map((l) => (
        <div key={l.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-ink-50 transition-colors">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink">
            <Globe size={16} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {l.label || l.locale}
              <code className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-500">{l.locale}</code>
            </p>
            <p className="text-2xs text-ink-400">
              {Object.values(l.strings).filter((v) => v.trim()).length} / {LOCALE_KEYS.length} strings · Updated {dateShort(l.updated_at)}
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

      <LocaleEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={reload} editing={editing} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete locale?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.75} />} onClick={() => deleteTarget && remove(deleteTarget.id)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">Delete <strong>{deleteTarget?.label || deleteTarget?.locale}</strong>? Users on this locale fall back to English.</p>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* LocaleEditor — big modal: UI inputs + JSON editor + preview        */
/* ------------------------------------------------------------------ */
function LocaleEditor({
  open, onClose, onSaved, editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing: PlatformLocale | null
}) {
  const { push } = useToast()
  const [locale, setLocale] = useState('')
  const [label, setLabel] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [jsonText, setJsonText] = useState('')
  const [mode, setMode] = useState<'ui' | 'json' | 'preview'>('ui')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setLocale(editing.locale)
      setLabel(editing.label)
      setValues({ ...ENGLISH_LOCALE, ...editing.strings })
    } else {
      setLocale('')
      setLabel('')
      setValues({ ...ENGLISH_LOCALE })
    }
    setSearch('')
    setMode('ui')
  }, [open, editing])

  // Keep the JSON tab in sync with the UI values
  useEffect(() => {
    if (mode === 'json') {
      // Only export overridden strings
      const deltas: Record<string, string> = {}
      for (const def of LOCALE_KEYS) {
        const v = values[def.key]?.trim()
        if (v && v !== ENGLISH_LOCALE[def.key]) deltas[def.key] = v
      }
      setJsonText(JSON.stringify(deltas, null, 2))
    }
  }, [mode, values])

  // Parse the JSON back into values when leaving the JSON tab
  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object')
      setValues({ ...ENGLISH_LOCALE, ...parsed })
      push({ tone: 'success', title: 'JSON applied' })
      return true
    } catch (e: any) {
      push({ tone: 'error', title: 'Invalid JSON', desc: e?.message })
      return false
    }
  }

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const m: Record<string, typeof LOCALE_KEYS> = {}
    for (const def of LOCALE_KEYS) {
      if (q && !def.label.toLowerCase().includes(q) && !def.key.includes(q)) continue
      if (!m[def.group]) m[def.group] = []
      m[def.group].push(def)
    }
    return m
  }, [search])

  const translatedCount = useMemo(
    () => LOCALE_KEYS.filter((d) => values[d.key]?.trim() && values[d.key] !== ENGLISH_LOCALE[d.key]).length,
    [values],
  )

  async function save() {
    if (!locale.trim()) { push({ tone: 'error', title: 'Locale code is required' }); return }
    if (!label.trim()) { push({ tone: 'error', title: 'Locale label is required' }); return }
    setSaving(true)
    try {
      const deltas: Record<string, string> = {}
      for (const def of LOCALE_KEYS) {
        const v = values[def.key]?.trim()
        if (v && v !== ENGLISH_LOCALE[def.key]) deltas[def.key] = v
      }
      if (editing) {
        await db.updatePlatformLocale(editing.id, { locale: locale.trim().toLowerCase(), label: label.trim(), strings: deltas })
        push({ tone: 'success', title: 'Locale updated' })
      } else {
        await db.createPlatformLocale({ locale: locale.trim().toLowerCase(), label: label.trim(), strings: deltas })
        push({ tone: 'success', title: 'Locale created' })
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
      title={editing ? `Edit ${editing.label} locale` : 'New locale'}
      desc="Translate the platform UI. Pre-filled with English — override what you need. Users pick the locale from Profile Settings."
      size="xl"
      footer={
        <>
          {mode === 'json' && (
            <Button variant="secondary" onClick={() => { if (applyJson()) setMode('ui') }}>Apply JSON</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save locale'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Locale meta */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-2xs font-medium uppercase tracking-wider text-ink-400">Locale code</label>
            <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="bg" className="mt-1 font-mono text-sm" />
            <p className="mt-1 text-2xs text-ink-400">e.g. en, bg, de, it</p>
          </div>
          <div>
            <label className="text-2xs font-medium uppercase tracking-wider text-ink-400">Label</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Български" className="mt-1" />
            <p className="mt-1 text-2xs text-ink-400">Shown in the Profile language switcher</p>
          </div>
        </div>

        {/* Mode toggle + progress + search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <button onClick={() => setMode('ui')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'ui' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}>
              <Globe size={14} strokeWidth={1.75} /> UI
            </button>
            <button onClick={() => setMode('json')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'json' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}>
              <Braces size={14} strokeWidth={1.75} /> JSON
            </button>
            <button onClick={() => setMode('preview')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'preview' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}>
              <Eye size={14} strokeWidth={1.75} /> Preview
            </button>
          </div>
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-medium text-ink-600">
            {translatedCount} / {LOCALE_KEYS.length} translated
          </span>
          {mode === 'ui' && (
            <div className="relative ml-auto w-52">
              <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search strings…"
                className="h-9 w-full rounded-lg border border-line bg-ink-50/60 pl-8 pr-8 text-sm text-ink placeholder:text-ink-300 focus:outline-none focus:border-ink"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink">
                  <X size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* UI inputs mode */}
        {mode === 'ui' && (
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
                        placeholder={ENGLISH_LOCALE[def.key]}
                        className={values[def.key] !== ENGLISH_LOCALE[def.key] ? 'border-info/40' : ''}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* JSON mode */}
        {mode === 'json' && (
          <div>
            <p className="mb-2 text-2xs text-ink-400">
              Edit the JSON directly (only overridden strings shown). Click <strong>Apply JSON</strong> to load it back into the UI inputs.
            </p>
            <Textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={20}
              className="font-mono text-[13px] leading-relaxed"
              placeholder='{ "nav.leads": "Лийдове", "common.save": "Запази" }'
            />
          </div>
        )}

        {/* Preview mode — render key UI components with the strings applied */}
        {mode === 'preview' && (
          <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-line p-4 space-y-4">
            <p className="text-2xs text-ink-400">A quick preview of the translated UI:</p>
            {/* Fake sidebar nav */}
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">Navigation</p>
              <div className="flex flex-wrap gap-1.5">
                {['nav.overview', 'nav.inbox', 'nav.leads', 'nav.deals', 'nav.payouts', 'nav.finances'].map((k) => (
                  <span key={k} className="rounded-lg bg-ink-50 px-2.5 py-1.5 text-2xs font-medium text-ink-600">{values[k] ?? ENGLISH_LOCALE[k]}</span>
                ))}
              </div>
            </div>
            {/* Fake buttons */}
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">Common buttons</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white">{values['common.save'] ?? 'Save'}</span>
                <span className="rounded-lg border border-line px-3 py-1.5 text-2xs font-medium text-ink-600">{values['common.cancel'] ?? 'Cancel'}</span>
                <span className="rounded-lg border border-line px-3 py-1.5 text-2xs font-medium text-ink-600">{values['common.delete'] ?? 'Delete'}</span>
                <span className="rounded-lg bg-ink px-3 py-1.5 text-2xs font-medium text-white">{values['leads.newLead'] ?? 'New Lead'}</span>
              </div>
            </div>
            {/* Fake sidebar pills */}
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">Sidebar status</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-medium text-ink-600">{values['side.whatsNew'] ?? "What's new"}</span>
                <span className="rounded-full bg-posBg px-2.5 py-1 text-2xs font-medium text-pos">{values['side.allSystems'] ?? 'All systems operational'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
