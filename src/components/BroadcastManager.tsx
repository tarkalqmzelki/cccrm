import { useState } from 'react'
import { Megaphone, Send, History } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { Skeleton } from './ui/Skeleton'
import type { InboxMessage } from '../lib/types'
import { dateLong } from '../lib/format'

/**
 * Admin-only panel for broadcasting a push notification to every
 * active user on the platform.  Sends via db.broadcastAnnouncement —
 * which fan-outs one inbox_messages row per active user with
 * notification_key='user_broadcast'.  The existing push pipeline then
 * delivers the push to each user's subscribed devices, honouring their
 * per-type preference (so users who opted out of 'user_broadcast' in
 * their preferences won't receive it).
 *
 * The global enable toggle for the 'user_broadcast' template lives in
 * Settings → Notifications → Templates (the NotificationTemplateEditor).
 * Here we just expose a per-row enable/disable hint + the form to send.
 */
export function BroadcastManager() {
  const { user } = useAuth()
  const { push } = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [actionUrl, setActionUrl] = useState('/')
  const [sending, setSending] = useState(false)

  // Recent broadcasts — inbox_messages with metadata.kind='broadcast'.
  // Recipient-side RLS lets admins see everyone's inbox_messages, so
  // this surfaces the full history of past broadcasts.
  const { data, loading, reload } = useAsync(async () => {
    if (!supabase) return [] as InboxMessage[]
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('notification_key', 'user_broadcast' as never)
      .order('created_at', { ascending: false })
      .limit(15)
    if (error) throw error
    return (data || []) as InboxMessage[]
  }, [])

  async function send() {
    if (!user) return
    if (!title.trim() && !body.trim()) {
      push({ tone: 'error', title: 'Add a title or message first' })
      return
    }
    setSending(true)
    try {
      const { sent } = await db.broadcastAnnouncement({
        title: title.trim() || 'Broadcast from Calista Concept',
        body: body.trim(),
        action_url: actionUrl.trim() || '/',
        sender_id: user.id,
      })
      push({
        tone: 'success',
        title: 'Broadcast sent',
        desc: `Push queued for ${sent} active user${sent === 1 ? '' : 's'}. Each subscribed device will receive it.`,
      })
      setTitle('')
      setBody('')
      setActionUrl('/')
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not send broadcast', desc: e?.message })
    } finally {
      setSending(false)
    }
  }

  const canSend = (title.trim() || body.trim()) && !sending

  return (
    <div className="space-y-5">
      {/* Composer */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone size={16} strokeWidth={1.75} className="text-ink-600" />
          <p className="text-sm font-semibold">New broadcast</p>
        </div>
        <p className="mb-3 text-2xs text-ink-500 leading-relaxed">
          Sends a push notification to <strong>every active user</strong> who has notifications turned on.
          Users who opted out of <code className="rounded bg-ink-100 px-1">Broadcast announcements</code> in
          their preferences won't receive it. Use sparingly — this is a loud channel.
        </p>
        <div className="space-y-3">
          <Field label="Title" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled maintenance this Sunday"
              maxLength={120}
            />
          </Field>
          <Field label="Message" required>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Write the announcement. Keep it short and actionable."
              maxLength={600}
            />
          </Field>
          <Field label="Tap target" hint="Where tapping the notification takes the user">
            <Input
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              placeholder="/inbox"
            />
          </Field>
          <div className="flex justify-end">
            <Button
              icon={<Send size={14} strokeWidth={1.75} />}
              onClick={send}
              disabled={!canSend}
            >
              {sending ? 'Sending…' : 'Send broadcast'}
            </Button>
          </div>
        </div>
      </div>

      {/* Global enable hint — link to the Templates editor */}
      <TemplateEnableHint />

      {/* Recent broadcasts */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <History size={14} strokeWidth={1.75} className="text-ink-600" />
          <p className="text-sm font-semibold">Recent broadcasts</p>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-400">
            No broadcasts sent yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {(data ?? []).map((m) => (
              <div key={m.id} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink">{m.title || '(no title)'}</p>
                  <span className="ml-auto shrink-0 text-2xs text-ink-400" title={dateLong(m.created_at)}>
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                {m.body && <p className="mt-0.5 line-clamp-2 text-2xs text-ink-500">{m.body}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* Small inline hint card showing whether the global 'user_broadcast'
 * template is enabled.  We don't expose the toggle here (it lives in
 * the Templates editor) — we just tell the admin where it is so they
 * can disable broadcasts platform-wide if needed. */
function TemplateEnableHint() {
  const { data } = useAsync(async () => {
    if (!supabase) return null
    const { data } = await supabase
      .from('notification_templates')
      .select('enabled')
      .eq('key', 'user_broadcast' as never)
      .maybeSingle()
    return data as { enabled: boolean } | null
  }, [])

  const enabled = data?.enabled !== false // default to true if missing
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-ink-50/60 px-4 py-3">
      <Megaphone size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          Broadcast notifications are <span className={enabled ? 'text-pos' : 'text-neg'}>{enabled ? 'enabled' : 'disabled'}</span> globally
        </p>
        <p className="text-2xs text-ink-400">
          Toggle this in <strong>Settings → Notifications → Templates → Broadcast announcements</strong>.
          When disabled, no broadcast pushes go out even if you send one here.
        </p>
      </div>
    </div>
  )
}
