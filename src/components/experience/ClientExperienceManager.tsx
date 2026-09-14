import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles, Copy, Ban, RotateCcw, Check, Activity, MessageSquare,
  Plus, Pencil, Trash2, Upload, Download, ArrowUp, ArrowDown, Link as LinkIcon, ExternalLink,
} from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import type { ClientExperienceAccess, CxEvent, CxMessage, CxMilestone, Deal } from '../../lib/types'
import { Card, CardHeader } from '../ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Field, Textarea } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../context/ToastContext'
import { dateShort, dateLong } from '../../lib/format'

/**
 * Admin-only Client Experience manager inside DealDetail.
 * Create / revoke / renew the secure client link, manage the journey
 * milestones, reply to client messages, share files, watch activity.
 */
export function ClientExperienceManager({ deal, adminId }: { deal: Deal; adminId: string }) {
  const { push } = useToast()
  const accessQ = useAsync(async () => db.getCxByDeal(deal.id), [deal.id])
  const access = accessQ.data
  const eventsQ = useAsync(async () => db.listCxEvents(deal.id), [deal.id, access?.id])
  const messagesQ = useAsync(async () => db.listCxMessages(deal.id), [deal.id, access?.id])
  const milestonesQ = useAsync(async () => db.listCxMilestones(deal.id), [deal.id])
  const filesQ = useAsync(async () => db.listCxFiles(deal.id), [deal.id, access?.id])

  const unread = useMemo(
    () => (messagesQ.data || []).filter((m) => m.sender === 'client' && !m.read_by_seller).length,
    [messagesQ.data],
  )

  /* Link creation */
  const [creating, setCreating] = useState(false)
  const [clientName, setClientName] = useState(deal.contact_name || deal.company || '')
  const [clientEmail, setClientEmail] = useState(deal.email || '')
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)

  /* Raw tokens live ONLY on the admin's device (server stores hash only).
     Keyed per deal so the Copy link button works across sessions. */
  const CX_TOKENS_KEY = 'cx-link-tokens-v1'
  const [storedToken, setStoredToken] = useState<string | null>(null)

  const rememberToken = useCallback((token: string) => {
    try {
      const raw = JSON.parse(localStorage.getItem(CX_TOKENS_KEY) || '{}')
      raw[deal.id] = token
      localStorage.setItem(CX_TOKENS_KEY, JSON.stringify(raw))
    } catch { /* ignore */ }
    setStoredToken(token)
  }, [deal.id])

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(CX_TOKENS_KEY) || '{}')
      setStoredToken(raw[deal.id] ?? null)
    } catch { setStoredToken(null) }
  }, [deal.id, access?.id])

  const linkUrl = useCallback((token: string) => `${window.location.origin}/experience/${token}`, [])

  async function create() {
    setCreating(true)
    try {
      const token = await db.createCx(deal.id, { clientName, clientEmail }, adminId)
      setFreshToken(token)
      rememberToken(token)
      accessQ.reload()
      push({ tone: 'success', title: 'Client Experience activated', desc: 'Copy the link below — shown only once.' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not activate', desc: e?.message })
    } finally { setCreating(false) }
  }

  async function renew(days: number) {
    if (!access) return
    try {
      const token = await db.renewCx(access.id, days)
      setFreshToken(token)
      rememberToken(token)
      setRenewOpen(false)
      accessQ.reload()
      push({ tone: 'success', title: 'Link renewed', desc: 'The old link is dead. New link below — shown once.' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not renew', desc: e?.message })
    }
  }

  async function revoke() {
    if (!access || !confirm('Revoke the client link? Access is invalidated immediately.')) return
    try {
      await db.revokeCx(access.id)
      accessQ.reload()
      push({ tone: 'success', title: 'Link revoked' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not revoke', desc: e?.message })
    }
  }

  async function copyLink() {
    if (!freshToken) return
    await navigator.clipboard.writeText(linkUrl(freshToken))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  /* Link diagnostics — validates the stored token server-side and shows
     exactly why it matches or doesn't. */
  const [diagRunning, setDiagRunning] = useState(false)
  const [diag, setDiag] = useState<string | null>(null)
  async function runDiagnostics() {
    const token = storedToken || freshToken
    if (!token) { setDiag('No token stored on this device — renew to generate a fresh one.'); return }
    try {
      const d = await db.debugCx(token)
      if (d.match) {
        const row = d.row as any
        if (row?.status === 'revoked') setDiag('Token MATCHES, but the link is REVOKED — press Renew to get a working link.')
        else if (row.expires_at && new Date(row.expires_at) < new Date()) setDiag('Token matches, but it EXPIRED — press Renew.')
        else setDiag(`Token matches an ACTIVE row (expires ${dateShort(row.expires_at)}). The link should work — try reloading the client page.`)
      } else {
        setDiag(`Hash MISMATCH. Server holds ${d.total_rows} experience row(s), none for this token. The link was likely created before the crypto fixes — press Renew to issue a fresh one.`)
      }
    } catch (e: any) {
      setDiag(`Diagnostic failed: ${e?.message}. Run supabase/schema77.sql.`)
    }
  }

  /* Milestones */
  const [msEditing, setMsEditing] = useState<{
    id?: string; title: string; description: string; status: CxMilestone['status']; start_date: string; end_date: string
  } | null>(null)
  const [msSaving, setMsSaving] = useState(false)
  const milestones = useMemo(() => [...(milestonesQ.data || [])].sort((a, b) => a.position - b.position), [milestonesQ.data])

  function startMsEdit(m?: CxMilestone) {
    setMsEditing({
      id: m?.id,
      title: m?.title ?? '',
      description: m?.description ?? '',
      status: m?.status ?? 'planned',
      start_date: m?.start_date?.slice(0, 10) ?? '',
      end_date: m?.end_date?.slice(0, 10) ?? '',
    })
  }

  async function saveMs() {
    if (!msEditing || !msEditing.title.trim()) return
    setMsSaving(true)
    try {
      if (msEditing.id) {
        await db.updateCxMilestone(msEditing.id, {
          title: msEditing.title.trim(),
          description: msEditing.description.trim(),
          status: msEditing.status,
          start_date: msEditing.start_date || null,
          end_date: msEditing.end_date || null,
          completed_at: msEditing.status === 'completed'
            ? (milestones.find((m) => m.id === msEditing.id)?.completed_at ?? new Date().toISOString())
            : null,
        })
      } else {
        const position = (milestones.reduce((max, x) => Math.max(max, x.position), 0) ?? 0) + 1
        await db.createCxMilestone({
          deal_id: deal.id,
          title: msEditing.title.trim(),
          description: msEditing.description.trim(),
          position,
          start_date: msEditing.start_date || null,
          end_date: msEditing.end_date || null,
        }, adminId)
      }
      setMsEditing(null)
      milestonesQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save milestone', desc: e?.message })
    } finally { setMsSaving(false) }
  }

  async function deleteMs(id: string) {
    if (!confirm('Delete this milestone?')) return
    try {
      await db.deleteCxMilestone(id)
      milestonesQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  async function moveMs(m: CxMilestone, dir: -1 | 1) {
    const idx = milestones.findIndex((x) => x.id === m.id)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= milestones.length) return
    try {
      await db.updateCxMilestone(m.id, { position: milestones[swapIdx].position })
      await db.updateCxMilestone(milestones[swapIdx].id, { position: m.position })
      milestonesQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not reorder', desc: e?.message })
    }
  }

  async function setMsStatus(m: CxMilestone, status: CxMilestone['status']) {
    try {
      await db.updateCxMilestone(m.id, {
        status,
        completed_at: status === 'completed' ? (m.completed_at ?? new Date().toISOString()) : null,
      })
      milestonesQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

/* Messages */
  const [msgDraft, setMsgDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (access && unread > 0) {
      void db.markCxMessagesRead(deal.id).then(() => messagesQ.reload())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, access?.id])

  async function sendMessage() {
    if (!access || !msgDraft.trim()) return
    setSending(true)
    try {
      await db.sendCxMessageSeller(deal.id, access.id, msgDraft.trim())
      setMsgDraft('')
      messagesQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not send', desc: e?.message })
    } finally { setSending(false) }
  }

/* Files */
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (!access) return
    try {
      await db.uploadCxFile(deal.id, access.id, file)
      push({ tone: 'success', title: 'File shared with client' })
      filesQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Upload failed', desc: e?.message })
    }
  }

  async function downloadFile(path: string) {
    try {
      const url = await db.getCxFileUrl(path)
      window.open(url, '_blank')
    } catch (e: any) {
      push({ tone: 'error', title: 'Download failed', desc: e?.message })
    }
  }

  /* Contracts for attach */
  const contractsQ = useAsync(async () => db.listContracts(), [])
  const attachedContract = useMemo(
    () => (contractsQ.data || []).find((c) => c.id === access?.contract_id) ?? null,
    [contractsQ.data, access?.contract_id],
  )

const canActivate = deal.status === 'approved' || deal.status === 'closed'

  return (
    <Card className="no-print">
      <CardHeader
        title={<span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/30">
            <Sparkles size={15} strokeWidth={2} />
          </span>
          Client Experience
          {access && (
            <Badge tone={access.status === 'active' ? 'pos' : 'neg'} dot>
              {access.status === 'revoked' ? 'Revoked' : 'Active'}
            </Badge>
          )}
          {!access && <Badge tone="neutral" dot>Draft</Badge>}
        </span>}
        desc={access
          ? access.status === 'revoked'
            ? 'Link revoked - renew to generate a fresh one.'
            : 'Live secure link - share it with the client.'
          : canActivate
            ? 'Create a secure, expiring link: proposal, contract, onboarding, project.'
            : 'Available once the deal is approved.'}
      />

      {!access ? (
        canActivate ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Client name" hint="Shown inside the experience">
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Contact or company name" />
              </Field>
              <Field label="Client email" hint="Optional — used for future verification">
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="name@company.com" />
              </Field>
            </div>
            <Button icon={<Sparkles size={15} strokeWidth={1.75} />} onClick={() => void create()} disabled={creating || !clientName.trim()}>
              {creating ? 'Creating…' : 'Activate Client Experience'}
            </Button>
            {freshToken && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <LinkIcon size={12} strokeWidth={2} /> Client link — copy now, shown once
                </p>
                <div className="flex items-center gap-2">
                  <input readOnly value={linkUrl(freshToken)} className="num min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" onClick={() => void copyLink()} icon={copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={1.75} />}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-400">Approve the deal to unlock the client experience link, milestones and client messaging.</p>
        )
      ) : (
        <div className="space-y-4">
          {/* Status row */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink-50/60 p-3 dark:bg-transparent">
            <div className="min-w-0 flex-1">
              <p className="num text-2xs text-ink-400">
                Expires {dateLong(access.expires_at)} · {access.access_count} visit{access.access_count === 1 ? '' : 's'}
                {access.last_accessed_at ? ` · last ${dateShort(access.last_accessed_at)}` : ''}
              </p>
              <p className="mt-0.5 text-2xs text-ink-400">
                {access.accepted_at
                  ? <>Proposal accepted {dateShort(access.accepted_at)}{access.contract_accepted_at ? ` · contract ${dateShort(access.contract_accepted_at)}` : ''}{access.onboarding_status === 'completed' ? ' · onboarding done' : ''}</>
                  : 'Proposal not accepted yet'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {access.status === 'active' && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={1.75} />}
                  onClick={async () => {
                    if (storedToken) {
                      await navigator.clipboard.writeText(linkUrl(storedToken))
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    } else {
                      // Token not on this device — renew to get a fresh shareable link
                      setRenewOpen(true)
                    }
                  }}
                  title={storedToken ? 'Copy the client link' : 'No token stored on this device — renew to get one'}
                >
                  {copied ? 'Copied!' : storedToken ? 'Copy link' : 'Get link'}
                </Button>
              )}
              {access.status === 'active' ? (
                <>
                  <Button variant="ghost" size="sm" icon={<RotateCcw size={13} strokeWidth={1.75} />} onClick={() => setRenewOpen(true)}>Renew</Button>
                  <Button variant="ghost" size="sm" className="text-neg hover:bg-negBg" icon={<Ban size={13} strokeWidth={1.75} />} onClick={() => {
                    if (!confirm('Revoke the client link? Access is invalidated immediately.')) return
                    void db.revokeCx(access.id).then(() => { push({ tone: 'success', title: 'Link revoked' }); accessQ.reload() }).catch((e) => push({ tone: 'error', title: 'Could not revoke', desc: e?.message }))
                  }}>
                    Revoke
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" icon={<RotateCcw size={13} strokeWidth={1.75} />} onClick={() => void renew(30)}>Renew</Button>
              )}
            </div>
          </div>

          {/* Shareable link row — persistent on this device */}
          {access.status === 'active' && storedToken && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2.5">
              <LinkIcon size={13} strokeWidth={1.75} className="shrink-0 text-amber-500" />
              <input
                readOnly
                value={linkUrl(storedToken)}
                onFocus={(e) => e.currentTarget.select()}
                className="num min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs"
              />
              <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(linkUrl(storedToken)); setCopied(true); setTimeout(() => setCopied(false), 1500) }} icon={copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={1.75} />}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <a
                href={linkUrl(storedToken)}
                target="_blank"
                rel="noreferrer"
                title="Open the client experience"
                className="shrink-0 rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]"
              >
                <ExternalLink size={13} strokeWidth={1.75} />
              </a>
            </div>
          )}

          {/* Milestones */}
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Journey milestones</p>
              <Button variant="ghost" size="sm" icon={<Plus size={13} strokeWidth={2} />} onClick={() => startMsEdit()}>Add</Button>
            </div>
            <div className="space-y-1.5">
              {milestones.length === 0 && (
                <p className="py-2 text-center text-2xs text-ink-300">No milestones yet — the client journey needs at least one.</p>
              )}
              {milestones.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => void moveMs(m, -1)} disabled={i === 0} className="text-ink-300 hover:text-ink disabled:opacity-30"><ArrowUp size={11} strokeWidth={2} /></button>
                    <button onClick={() => void moveMs(m, 1)} disabled={i === milestones.length - 1} className="text-ink-300 hover:text-ink disabled:opacity-30"><ArrowDown size={11} strokeWidth={2} /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.title}</p>
                    <p className="text-2xs capitalize text-ink-400">
                      {m.status.replace(/_/g, ' ')}{m.end_date ? ` · by ${dateShort(m.end_date)}` : ''}
                    </p>
                  </div>
                  <select
                    value={m.status}
                    onChange={(e) => void setMsStatus(m, e.target.value as CxMilestone['status'])}
                    className="h-8 shrink-0 cursor-pointer appearance-none rounded-lg border border-line bg-surface px-2 text-2xs"
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting_client">Waiting client</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button onClick={() => startMsEdit(m)} title="Edit" className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]"><Pencil size={13} strokeWidth={1.75} /></button>
                  <button onClick={() => void deleteMs(m.id)} title="Delete" className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-negBg hover:text-neg"><Trash2 size={13} strokeWidth={1.75} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Files */}
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Shared files</p>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = '' }} />
              <Button variant="ghost" size="sm" icon={<Upload size={13} strokeWidth={1.75} />} onClick={() => fileInputRef.current?.click()}>Upload</Button>
            </div>
            <div className="space-y-1">
              {(filesQ.data || []).length === 0 && <p className="py-1 text-center text-2xs text-ink-300">No files yet.</p>}
              {(filesQ.data || []).map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <Badge tone={f.uploaded_by === 'client' ? 'info' : 'neutral'}>{f.uploaded_by}</Badge>
                  <button onClick={() => void downloadFile(f.storage_path)} className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]" title="Download">
                    <Download size={13} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
              <Activity size={12} strokeWidth={2} /> Client messages
              {unread > 0 && <span className="num rounded-full bg-neg px-1.5 text-white">{unread}</span>}
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {(messagesQ.data || []).length === 0 && <p className="py-2 text-center text-2xs text-ink-300">No messages yet.</p>}
              {(messagesQ.data || []).map((m) => (
                <div key={m.id} className={`flex ${m.sender === 'seller' ? 'justify-end' : ''}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.sender === 'seller' ? 'bg-ink text-white dark:bg-[rgb(58,58,58)]' : 'border border-line bg-ink-50 dark:bg-[rgb(26,26,26)]'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="num mt-1 text-right text-[9px] text-ink-400">{dateShort(m.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              <Input value={msgDraft} onChange={(e) => setMsgDraft(e.target.value)} placeholder="Reply to the client…" onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && msgDraft.trim() && void sendMessage()} />
              <Button size="sm" disabled={sending || !msgDraft.trim()} onClick={() => void sendMessage()} icon={<MessageSquare size={13} strokeWidth={1.75} />}>Send</Button>
            </div>
          </div>

          {/* Activity */}
          <details className="rounded-xl border border-line px-3 py-2.5">
            <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wider text-ink-400">
              <Activity size={12} strokeWidth={2} className="mr-1 inline" /> Client activity
            </summary>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {(eventsQ.data || []).length === 0 && <p className="py-2 text-center text-2xs text-ink-300">No activity yet.</p>}
              {(eventsQ.data || []).map((ev) => (
                <div key={ev.id} className="flex items-center gap-2 text-2xs text-ink-400">
                  <span className="num shrink-0">{dateShort(ev.created_at)}</span>
                  <span className="truncate">{formatEvent(ev)}</span>
                </div>
              ))}
            </div>
          </details>

          {/* Link diagnostics */}
          <details className="rounded-xl border border-line px-3 py-2.5">
            <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wider text-ink-400">Link diagnostics</summary>
            <div className="mt-2 space-y-2">
              <Button variant="secondary" size="sm" disabled={diagRunning} onClick={async () => { setDiagRunning(true); await runDiagnostics(); setDiagRunning(false) }}>
                {diagRunning ? 'Checking…' : 'Validate link server-side'}
              </Button>
              {diag && <p className="text-2xs leading-relaxed text-ink-500 dark:text-ink-300">{diag}</p>}
            </div>
          </details>

          {/* Contract attach */}
          <details className="rounded-xl border border-line px-3 py-2.5">
            <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wider text-ink-400">
              Attached contract {attachedContract ? <Badge tone="pos">{attachedContract.number}</Badge> : null}
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-2xs text-ink-400">Attach the contract the client must approve after the proposal.</p>
              <select
                value={access.contract_id ?? ''}
                onChange={(e) => void db.setCxContract(access.id, e.target.value || null).then(() => accessQ.reload())}
                className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface px-3 text-sm"
              >
                <option value="">No contract attached</option>
                {(contractsQ.data || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.number} · {c.counterparty_company || c.counterparty_name}</option>
                ))}
              </select>
            </div>
          </details>

          {/* Renew modal */}
          <Modal open={renewOpen} onClose={() => setRenewOpen(false)} size="sm" title="Renew client link" desc="A brand-new token is generated — the old link dies instantly."
            footer={
              <>
                <Button variant="secondary" onClick={() => setRenewOpen(false)}>Cancel</Button>
                <Button onClick={() => void renew(30)}>Renew · 30 days</Button>
              </>
            }
          >
            <p className="text-sm text-ink-500">Send the fresh link to the client. The previous URL stops working the moment you renew.</p>
          </Modal>
        </div>
      )}

      {/* Milestone edit modal */}
      <Modal
        open={!!msEditing}
        onClose={() => setMsEditing(null)}
        size="sm"
        title={msEditing?.id ? 'Edit milestone' : 'New milestone'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMsEditing(null)}>Cancel</Button>
            <Button onClick={() => void saveMs()} disabled={msSaving || !msEditing?.title.trim()}>{msSaving ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        {msEditing && (
          <div className="space-y-3">
            <Field label="Title" required><Input value={msEditing.title} onChange={(e) => setMsEditing((m) => ({ ...m!, title: e.target.value }))} placeholder="e.g. Design" autoFocus /></Field>
            <Field label="Description" hint="What happens in this phase — visible to the client"><Textarea value={msEditing.description} onChange={(e) => setMsEditing((m) => ({ ...m!, description: e.target.value }))} rows={2} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><Input type="date" value={msEditing.start_date} onChange={(e) => setMsEditing((m) => ({ ...m!, start_date: e.target.value }))} /></Field>
              <Field label="End date"><Input type="date" value={msEditing.end_date} onChange={(e) => setMsEditing((m) => ({ ...m!, end_date: e.target.value }))} /></Field>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}

  function formatEvent(ev: CxEvent): string {
  const title = (ev.metadata?.title as string) || (ev.metadata?.name as string) || ''
  switch (ev.event_type) {
    case 'experience_opened': return 'Opened the experience'
    case 'proposal_accepted': return `Accepted the proposal${ev.metadata?.signature ? ` — signed "${ev.metadata.signature}"` : ''}`
    case 'proposal_declined': return `Declined the proposal${ev.metadata?.reason ? ` — ${ev.metadata.reason}` : ''}`
    case 'contract_approved': return 'Approved the contract'
    case 'onboarding_completed': return 'Completed onboarding'
    case 'milestone_created': return `Milestone created: ${title}`
    case 'milestone_completed': return `Milestone completed: ${title}`
    case 'milestone_updated': return `Milestone updated: ${title}`
    case 'approval_completed': return `Approved milestone: ${title}`
    case 'change_requested': return `Requested a revision: ${title}`
    case 'message_sent': return `Sent a message${ev.metadata?.preview ? ` — "${ev.metadata.preview}"` : ''}`
    case 'file_uploaded': return `Uploaded a file${ev.metadata?.name ? `: ${ev.metadata.name}` : ''}`
    case 'file_shared': return `HQ shared a file${ev.metadata?.name ? `: ${ev.metadata.name}` : ''}`
    case 'document_viewed': return `Viewed a document${ev.metadata?.name ? `: ${ev.metadata.name}` : ''}`
    default: return ev.event_type.replace(/_/g, ' ')
  }
}