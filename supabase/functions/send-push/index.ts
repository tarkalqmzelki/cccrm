// Calista Concept — send-push Edge Function (rewrite using `web-push`)
//
// Replaces the hand-rolled VAPID + RFC 8188 crypto with the battle-tested
// `web-push` npm package.  Same trigger contract, same push_log writes,
// same template + preference logic — just reliable crypto.
//
// Two payload formats are accepted:
//   1. Database Webhook (recommended): { type, table, record, old_record }
//      where `record` is the full inbox_messages row.  Configured in the
//      Supabase dashboard (Database → Webhooks → New).
//   2. Direct call (legacy): { recipient_id, title, body, action_url,
//      metadata, notification_key, inbox_type }
//
// Authorization: callers must present the project's service-role JWT
// in `Authorization: Bearer …`.  The Database Webhook adds this header
// automatically when configured with the service key.

import webPush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ops@calistaconcept.com'
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

// Configure the web-push library once.  The library handles VAPID JWT
// generation (with the correct `aud` claim based on the endpoint origin),
// RFC 8188 aes128gcm content encoding, ECDSA DER signature, and TTL.
webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// ---------- helpers ----------
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}

const TONE_TAG: Record<string, string> = { low: 'low', normal: '', high: 'high', urgent: 'urgent' }

function defaultKeyForInboxType(inboxType: string, role: string): string {
  if (inboxType === 'activity_assigned' || inboxType === 'activity_reassigned') return 'admin_meeting'
  if (inboxType === 'access_request') return 'admin_lead_new'
  if (role === 'admin') return 'admin_inbox'
  return 'user_inbox'
}

/** Extract the inbox row from either payload format. */
function extractRow(body: any): {
  recipient_id: string
  title: string
  body: string
  action_url: string
  metadata: any
  notification_key: string
  inbox_type: string
} | null {
  // Database Webhook format: { type: 'INSERT', record: {...} }
  if (body?.record?.recipient_id) {
    const r = body.record
    return {
      recipient_id: r.recipient_id,
      title: r.title ?? '',
      body: r.body ?? '',
      action_url: r.action_url ?? '',
      metadata: r.metadata ?? {},
      notification_key: r.notification_key ?? '',
      inbox_type: r.type ?? '',
    }
  }
  // Direct call format
  if (body?.recipient_id) {
    return {
      recipient_id: body.recipient_id,
      title: body.title ?? '',
      body: body.body ?? '',
      action_url: body.action_url ?? '',
      metadata: body.metadata ?? {},
      notification_key: body.notification_key ?? '',
      inbox_type: body.inbox_type ?? '',
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  // Auth: service-role bearer (Database Webhook adds this automatically)
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== SERVICE_ROLE) {
    return json({ error: 'Unauthorized' }, 401)
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: 'VAPID not configured' }, 500)
  }

  const body = await req.json().catch(() => null)
  const row = extractRow(body)
  if (!row) return json({ error: 'Bad request — no recipient_id found' }, 400)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  /** Log every outcome to push_log so admins can see why pushes did or
   *  didn't arrive. Never let a logging failure break the response. */
  const log = (status: string, detail: string, sentCount = 0, key = '') =>
    supabase
      .from('push_log')
      .insert({ recipient_id: row.recipient_id, status, detail, sent_count: sentCount, key })
      .then(() => {})
      .catch((e) => console.warn('push_log insert failed', e))

  try {
    // Resolve recipient role (for default key selection).
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', row.recipient_id).maybeSingle()
    const role = (profile as any)?.role ?? 'seller'

    const explicitKey = row.notification_key
    const key = explicitKey || defaultKeyForInboxType(row.inbox_type, role)

    // Template lookup (fall back to literal title/body).
    const { data: tplRow } = await supabase.from('notification_templates').select('*').eq('key', key).maybeSingle()
    const template = (tplRow as any) ?? {
      enabled: true,
      title_template: row.title || 'Calista Concept',
      body_template: row.body || '',
      tone: 'normal',
    }
    if (!template.enabled) {
      await log('skipped', `Template "${key}" is disabled globally`, 0, key)
      return json({ sent: 0, reason: 'template_disabled' })
    }

    // User preference (defaults to enabled if no row).
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', row.recipient_id)
      .eq('key', key)
      .maybeSingle()
    if (pref && pref.enabled === false) {
      await log('skipped', `Recipient disabled "${key}" in their preferences`, 0, key)
      return json({ sent: 0, reason: 'user_disabled' })
    }

    // Fill template placeholders.
    const meta = row.metadata ?? {}
    const vars: Record<string, string> = {
      subject: row.title ?? '',
      actor: (meta.actor_name as string) ?? 'Someone',
      amount: (meta.amount as string) ?? '',
      period: (meta.period as string) ?? '',
      when: (meta.when as string) ?? '',
    }
    const title = fillTemplate(template.title_template, vars) || 'Calista Concept'
    const bodyText = fillTemplate(template.body_template, vars)
    const tag = TONE_TAG[template.tone] || ''
    const payload = JSON.stringify({ title, body: bodyText, tag: tag || undefined, url: row.action_url || '/' })

    // Fetch all subscriptions for this user.
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth_key,subscription')
      .eq('user_id', row.recipient_id)
    const list = (subs as any[]) ?? []
    if (list.length === 0) {
      await log('skipped', 'No devices subscribed — ask the user to enable notifications in their profile', 0, key)
      return json({ sent: 0, reason: 'no_subscriptions' })
    }

    // Build the standard PushSubscription shape expected by web-push.
    // Prefer the `subscription` jsonb column (full object), fall back to
    // building from the legacy per-field columns for old rows.
    const toWebPushSub = (s: any) => {
      if (s.subscription && s.subscription.keys) return s.subscription
      return {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth_key },
      }
    }

    let sent = 0
    const gone: string[] = []
    const errors: string[] = []

    for (const s of list) {
      const sub = toWebPushSub(s)
      try {
        await webPush.sendNotification(sub, payload, {
          TTL: 86400,
          // `urgency` and `topic` could be set here too; the library
          // handles VAPID JWT generation per-endpoint internally.
        })
        sent++
      } catch (e: any) {
        const status = e?.statusCode ?? 0
        // 404 / 410 = subscription expired; clean up.
        if (status === 404 || status === 410) {
          gone.push(s.endpoint)
        } else {
          errors.push(`HTTP ${status || 'unknown'}: ${e?.body || e?.message || 'unknown error'}`)
        }
      }
    }

    if (gone.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', gone).eq('user_id', row.recipient_id)
    }

    await log(
      sent > 0 ? 'sent' : 'error',
      sent > 0
        ? `Delivered to ${sent}/${list.length} device(s)${gone.length ? `, removed ${gone.length} expired` : ''}`
        : `All device pushes failed: ${errors.join(' | ') || 'unknown'}`,
      sent,
      key,
    )
    return json({ sent, gone: gone.length, errors })
  } catch (e) {
    await log('error', `Unexpected error: ${(e as Error)?.message ?? e}`)
    return json({ error: 'internal', detail: (e as Error)?.message }, 500)
  }
})
