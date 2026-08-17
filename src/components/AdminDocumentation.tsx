import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, FileText, Tag, BookOpen, X, ChevronRight, Copy, Calendar } from 'lucide-react'
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
import { dateShort, dateLong } from '../lib/format'

/**
 * Admin Documentation panel — shown under Settings → System → Admin
 * Documentation.  Search across title + body + tags; filter by a
 * custom category; click a row to read it (rendered markdown); edit
 * or delete via the header buttons.
 */
/**
 * Admin Documentation panel — shown under Settings → System → Admin
 * Documentation.  Search across title + body + tags; filter by a
 * custom category; click a row to read it (rendered markdown); edit
 * or delete via the header buttons.  "Copy session changes" button
 * generates a structured summary of the current coding session ready
 * for pasting into a new document.
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
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          {docs.length} document{docs.length === 1 ? '' : 's'}{hasActiveFilters ? ` · ${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Copy size={14} strokeWidth={1.75} />}
            onClick={() => {
              copySessionSummary()
              push({ tone: 'success', title: 'Session summary copied', desc: 'Paste it into a new document to save it.' })
            }}
          >
            Copy session changes
          </Button>
          <Button size="sm" icon={<Plus size={14} strokeWidth={1.75} />} onClick={startNew}>New document</Button>
        </div>
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
                <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-ink-400">
                  <span className="flex items-center gap-1"><Calendar size={10} strokeWidth={1.75} /> {dateShort(d.created_at)}</span>
                  {d.updated_at !== d.created_at && <span>· updated {dateShort(d.updated_at)}</span>}
                </div>
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
            <span className="flex items-center gap-1 text-2xs text-ink-400"><Calendar size={10} strokeWidth={1.75} /> Created {viewing && dateShort(viewing.created_at)}</span>
            {viewing && viewing.updated_at !== viewing.created_at && (
              <span className="text-2xs text-ink-400">· updated {dateShort(viewing.updated_at)}</span>
            )}
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

/**
 * Copy a structured session-summary to the clipboard, formatted exactly
 * for pasting into Admin Documentation.  Each change is numbered with
 * its code snippets inline so the doc reads as a record of what was
 * done in this session.
 */
function copySessionSummary() {
  const text = SESSION_SUMMARY
  try {
    navigator.clipboard.writeText(text).then(
      () => console.log('[admin-docs] session summary copied'),
      (e) => { console.warn('[admin-docs] clipboard API failed', e); fallbackCopy(text) },
    )
  } catch {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(ta)
}

/**
 * The full session summary — formatted as Admin Documentation
 * markdown.  Each change is followed by its code snippets so the
 * document is self-contained for pasting into the editor.
 */
const SESSION_DATE = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

const SESSION_SUMMARY = `# CCCRM Session — ${SESSION_DATE}

**Category:** Functionalities
**Tags:** session, login, pwa, notifications, push, leads, settings, documentation
**Date:** ${SESSION_DATE}

---

## 1) Premium login page redesign

**Change:** Replaced the plain centered login form with a two-part premium composition (desktop) and a single-column experience (mobile). Left brand panel uses an elegant monochromatic gradient, abstract shapes, and the Calista logo on a white brand plate. Right side has strong typography hierarchy (Welcome back / Sign in to Calista Concept) and a large black sign-in button. Removed the Seller/Headhunter vs Admin selector — unified platform. Auth flow unchanged.

**Code snippets:**

\`\`\`tsx
// src/pages/Login.tsx — layout structure (desktop two-part, mobile single column)
<div className="min-h-dvh bg-canvas lg:flex lg:items-stretch">
  <section className="relative isolate hidden overflow-hidden bg-ink-900 lg:block lg:w-[52%] lg:min-h-dvh">
    {/* atmospheric gradient + arcs + grain overlay */}
    <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-700" />
    {/* logo on white brand plate + brand statement "Connections that create revenue." */}
  </section>
  <section className="relative z-10 flex min-h-dvh flex-1 items-center justify-center bg-canvas px-6 …">
    {/* "Welcome back" eyebrow + "Sign in to Calista Concept" heading + form */}
  </section>
</div>
\`\`\`

\`\`\`tsx
// Mobile — black panel hidden, compact logo shown, safe-area insets
<section className="relative isolate hidden overflow-hidden bg-ink-900 lg:block …">
<img src="https://kappa.lol/FAHnNi" alt="Calista Concept" className="mb-8 h-8 w-auto lg:hidden" />
\`\`\`

---

## 2) PWA fixes — iOS input zoom, Vercel 404 routing, manifest + service worker

**Change:** (a) iOS Safari auto-zooms fields with font-size < 16px — forced 16px on touch devices. (b) Vercel rewrites all unknown paths to \`/index.html\` so \`/deals\` survives refresh. (c) Created \`manifest.webmanifest\`, \`sw.js\` (with push handlers), generated icons from the Calista logo, wired SW registration in \`main.tsx\`.

**Code snippets:**

\`\`\`css
/* src/index.css — iOS input zoom fix */
@media (pointer: coarse), (max-width: 767px) {
  input, select, textarea { font-size: 16px !important; }
}
\`\`\`

\`\`\`json
// vercel.json — SPA rewrites (fixes 404 on refresh)
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [{ "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }]
}
\`\`\`

\`\`\`ts
// src/main.tsx — service worker registration (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  })
}
\`\`\`

\`\`\`js
// public/sw.js — push event handler
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Calista Concept', {
      body: data.body || '', icon: '/icons/icon-192.png', tag: data.tag || 'calista',
      data: { url: data.url || '/' },
    }),
  )
})
\`\`\`

---

## 3) Notifications system — VAPID Web Push via Supabase Edge Function

**Change:** Full end-to-end push notification pipeline. Database tables (\`push_subscriptions\`, \`notification_preferences\`, \`notification_templates\`, \`push_log\`, \`app_secrets\`). Edge Function uses the \`web-push\` npm library (replaced hand-rolled VAPID crypto). Trigger posts webhook-shaped JSON to the Edge Function on every \`inbox_messages\` INSERT. Client subscribes via \`pushManager.subscribe()\` and stores the full subscription object as JSONB. Admin templates with \`{subject}\`, \`{actor}\`, \`{amount}\`, \`{period}\`, \`{when}\` placeholders. Per-user per-type preferences. Daily cron for payout reminders.

**Code snippets:**

\`\`\`ts
// supabase/functions/send-push/index.ts — uses web-push library
import webPush from 'npm:web-push@3.6.7'
webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
await webPush.sendNotification(sub, payload, { TTL: 86400 })
\`\`\`

\`\`\`ts
// src/lib/notifications.ts — client subscribe (stores full subscription JSONB)
const fullSub = sub.toJSON()
await db.addPushSubscription(userId, {
  endpoint: sub.endpoint,
  p256dh: b64uEncode(p256dh as ArrayBuffer),
  auth_key: b64uEncode(auth as ArrayBuffer),
  subscription: fullSub,
})
\`\`\`

\`\`\`sql
-- supabase/schema45.sql (excerpt) — lead_reminders + cron + notification template
create table public.lead_reminders (…);
create or replace function public.fire_due_lead_reminders() returns void …
perform cron.schedule('calista-lead-reminders', '* * * * *',
  $cron$select public.fire_due_lead_reminders();$cron$);
insert into notification_templates (key, title_template, body_template, tone)
values ('user_lead_reminder', 'Reminder', 'Reminder — Meeting reminder for {subject}', 'high');
\`\`\`

\`\`\`sql
-- supabase/schema39.sql — push_subscriptions.subscription jsonb column
alter table public.push_subscriptions add column if not exists subscription jsonb;
update public.push_subscriptions set subscription = jsonb_build_object(
  'endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth_key)
) where subscription is null;
\`\`\`

---

## 4) Settings reorganization — sidebar + categories

**Change:** Refactored the admin Settings page with a left sidebar grouping items: Commissions, Notifications (Your preferences / Templates / Delivery log / Errors), System (System status / LogBook / ChangeLog / Admin Documentation). Moved providers from App.tsx into main.tsx and wrapped with NotificationsProvider.

**Code snippets:**

\`\`\`tsx
// src/pages/admin/Settings.tsx — sidebar + categories
type Category = 'commissions' | 'notif-preferences' | 'notif-templates' | 'notif-log' | 'notif-errors' | 'system' | 'logbook' | 'changelog' | 'docs'
const NAV_ITEMS: NavItem[] = [
  { id: 'commissions', label: 'Commissions', icon: Settings2, group: 'Commissions' },
  { id: 'notif-preferences', label: 'Your preferences', icon: Bell, group: 'Notifications' },
  …
  { id: 'docs', label: 'Admin Documentation', icon: BookMarked, group: 'System' },
]
\`\`\`

\`\`\`tsx
// src/main.tsx — providers moved here (was in App.tsx)
<AuthProvider>
  <ToastProvider>
    <NotificationsProvider>
      <App />
    </NotificationsProvider>
  </ToastProvider>
</AuthProvider>
\`\`\`

---

## 5) LogBook + ChangeLog + Admin Documentation

**Change:** (a) LogBook merges \`error_logs\` + \`push_log\` errors into a single admin triage view. (b) ChangeLog entries with labels (NEW / IMPROVEMENT / FIX / TODO / ANNOUNCEMENT), shown to all users via a sidebar pill above System Status, admin-managed via Settings. (c) Admin Documentation: markdown knowledge base with custom categories, tags, search, Write/Preview toggle, \`react-markdown\` + \`remark-gfm\` rendering for pasted code blocks.

**Code snippets:**

\`\`\`sql
-- supabase/schema38.sql — error_logs + changelog tables
create table public.error_logs (id uuid primary key default gen_random_uuid(), source text, severity text, message text, detail text, metadata jsonb);
create type public.changelog_label as enum ('NEW','IMPROVEMENT','FIX','TODO','ANNOUNCEMENT');
create table public.changelog (…, label public.changelog_label, version text, title text, body text, published boolean);
\`\`\`

\`\`\`sql
-- supabase/schema46.sql — admin_docs (markdown knowledge base)
create table public.admin_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null default '',
  category text not null default 'General', tags text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
\`\`\`

\`\`\`tsx
// src/components/AdminDocEditor.tsx — Write/Preview toggle with live markdown render
{mode === 'write' ? (
  <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="font-mono text-[13px]" />
) : (
  <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown></div>
)}
\`\`\`

---

## 6) Calendar activity fixes + Leads features

**Change:** (a) Added missing \`activity_type\` enum values (\`potential_meeting\`, \`email\`, \`task\`, \`reminder\`) via \`ALTER TYPE ADD VALUE\`. (b) Fixed modal freeze by removing \`document.body.style.overflow = 'hidden'\` from Modal.tsx. (c) Added lead status enum + column on companies (New / Contacted / Interested / In progress / Won / Lost), settable by owner + admin via inline \`LeadStatusPicker\`. (d) "Remind Me" button on CompanyDetail opens a modal with the platform DateTimePicker + a Reason field; a cron fires a push notification at the scheduled time. (e) Leads page: My/All toggle + filters (time, status, owner) using platform-styled \`FilterDropdown\`. (f) Fixed Dashboard "New Leads" count by switching from \`db.listLeads()\` (empty old table) to \`db.listCompanies()\`.

**Code snippets:**

\`\`\`sql
-- supabase/schema45.sql — add missing activity_type enum values
do $$ begin alter type public.activity_type add value if not exists 'potential_meeting'; exception when others then null; end $$;
do $$ begin alter type public.activity_type add value if not exists 'email'; exception when others then null; end $$;
do $$ begin alter type public.activity_type add value if not exists 'task'; exception when others then null; end $$;
do $$ begin alter type public.activity_type add value if not exists 'reminder'; exception when others then null; end $$;
\`\`\`

\`\`\`tsx
// src/components/ui/Modal.tsx — removed body overflow lock (fixed freeze)
useEffect(() => {
  if (!open) return
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}, [open, onClose])
\`\`\`

\`\`\`ts
// src/lib/types.ts — lead status enum + meta
export type LeadStatus = 'new' | 'contacted' | 'interested' | 'in_progress' | 'won' | 'lost'
export const LEAD_STATUS_META: Record<LeadStatus, { label: string; tone: … }> = {
  new: { label: 'New', tone: 'info' },
  interested: { label: 'Interested', tone: 'warn' },
  in_progress: { label: 'In progress', tone: 'info' },
  won: { label: 'Won', tone: 'pos' }, lost: { label: 'Lost', tone: 'neg' },
}
\`\`\`

\`\`\`tsx
// src/pages/Leads.tsx — My/All toggle + platform FilterDropdown
<div className="flex rounded-xl border border-line bg-surface p-0.5">
  <button onClick={() => setScope('all')} className={scope === 'all' ? 'bg-ink text-white' : '…'}>All</button>
  <button onClick={() => setScope('mine')} className={scope === 'mine' ? 'bg-ink text-white' : '…'}>My leads</button>
</div>
<FilterDropdown value={statusFilter} onChange={…} options={[{value:'all',label:'All statuses'}, …]} />
\`\`\`

\`\`\`tsx
// src/pages/Dashboard.tsx — fixed Leads count (was using empty old leads table)
const [profiles, deals, companies, payouts, referrals] = await Promise.all([
  db.listProfiles(), db.listDeals(), db.listCompanies(), db.listPayouts(), db.listReferrals(),
])
const stats = periodStats(data.deals, data.companies, data.profiles)
\`\`\`

\`\`\`tsx
// src/components/LeadReminderModal.tsx — DateTimePicker + Reason field
<DateTimePicker value={customDateTime} onChange={setCustomDateTime} outputIso={false} />
<Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
  placeholder="e.g. Follow up after the discovery call" />
// Reason flows into the push body:
const body = reason.trim() ? \`\${baseBody}\\nReason: \${reason.trim()}\` : baseBody
\`\`\`

---

## 7) Notification preferences — Lead reminders toggle for all

**Change:** The \`user_lead_reminder\` notification type now appears for both admins and users (admins set reminders for themselves too). Updated \`defaultPreferencesFor\` so both roles default to enabled.

**Code snippets:**

\`\`\`tsx
// src/components/NotificationPreferences.tsx — show user_lead_reminder to everyone
const keys = NOTIFICATION_KEYS.filter(
  (k) => k.role === role || k.key === 'user_lead_reminder'
)
\`\`\`

\`\`\`ts
// src/lib/notifications.ts — defaults include user_lead_reminder for both roles
export function defaultPreferencesFor(role: 'admin' | 'seller' | 'headhunter'): NotificationKey[] {
  if (role === 'admin') {
    return ['admin_deal_new', …, 'user_lead_reminder']
  }
  return ['user_inbox', …, 'user_payout', 'user_lead_reminder']
}
\`\`\`

---

## Deployment notes

- **Supabase SQL migrations to run in order:** schema29 → schema30 → schema35 → schema37 → schema38 → schema39 → schema40 → schema41 → schema45 → schema46
- **Edge Function deploy:** \`supabase functions deploy send-push --no-verify-jwt\` and \`supabase functions deploy daily-reminders --no-verify-jwt\`
- **Supabase secrets:** \`VAPID_SUBJECT\`, \`VAPID_PUBLIC_KEY\`, \`VAPID_PRIVATE_KEY\`, \`EDGE_BEARER_KEY\` (the service_role key, renamed because Supabase reserves the \`SUPABASE_\` prefix)
- **Vercel env var:** \`VITE_VAPID_PUBLIC_KEY\` (must redeploy after setting)
- **pg_net + pg_cron extensions:** enable both in Supabase dashboard → Database → Extensions
- **Trigger setup:** the manual trigger in schema41 replaces the broken Webhooks UI — posts webhook-shaped JSON to the Edge Function via \`public.http_post\` wrapper
`

