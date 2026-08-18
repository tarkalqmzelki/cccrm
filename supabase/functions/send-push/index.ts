// Calista Concept — send-push Edge Function
//
// Uses the `web-push` npm library for battle-tested VAPID + RFC 8188
// crypto.  Accepts both Database Webhook payload format and direct
// call format.  Writes every outcome to push_log so admins can see
// why pushes did or didn't arrive.

console.log('[send-push] module loading…')

let webPush: any
try {
  webPush = await import('npm:web-push@3.6.7')
  console.log('[send-push] web-push imported OK, version:', webPush.version || 'unknown')
} catch (e) {
  console.error('[send-push] FAILED to import web-push:', (e as Error)?.message || e)
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
console.log('[send-push] supabase-js imported OK')

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('EDGE_BEARER_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ops@calistaconcept.com'
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

if (webPush?.setVapidDetails) {
  try {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    console.log('[send-push] VAPID configured OK')
  } catch (e) {
    console.error('[send-push] VAPID config FAILED:', (e as Error)?.message || e)
  }
} else {
  console.error('[send-push] webPush.setVapidDetails not available — library did not load')
}

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

function extractRow(body: any): {
  recipient_id: string
  title: string
  body: string
  action_url: string
  metadata: any
  notification_key: string
  inbox_type: string
} | null {
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
  console.log('[send-push] === request received ===', req.method)
  let log: ((status: string, detail: string, sentCount?: number, key?: string) => Promise<void>) | null = null

  try {
    if (req.method !== 'POST') {
      console.log('[send-push] rejected: not POST')
      return json({ error: 'Method Not Allowed' }, 405)
    }

    const auth = req.headers.get('authorization') ?? ''
    console.log('[send-push] auth present:', auth.startsWith('Bearer '), 'key length:', SERVICE_ROLE.length)
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== SERVICE_ROLE) {
      console.log('[send-push] unauthorized — bearer mismatch')
      return json({ error: 'Unauthorized' }, 401)
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('[send-push] VAPID keys missing. PUBLIC set:', !!VAPID_PUBLIC_KEY, 'PRIVATE set:', !!VAPID_PRIVATE_KEY)
      return json({ error: 'VAPID not configured' }, 500)
    }

    if (!webPush?.sendNotification) {
      console.error('[send-push] web-push library not loaded — sendNotification unavailable')
      return json({ error: 'web-push library failed to load' }, 500)
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      console.log('[send-push] could not parse JSON body')
      return json({ error: 'Invalid JSON' }, 400)
    }
    console.log('[send-push] body keys:', Object.keys(body).join(', '))

    const row = extractRow(body)
    if (!row) {
      console.log('[send-push] no recipient_id found in body')
      return json({ error: 'Bad request — no recipient_id found' }, 400)
    }
    console.log('[send-push] processing for recipient:', row.recipient_id, 'key:', row.notification_key || '(none)')

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

    // Set up log helper now that we have supabase + row
    log = async (status: string, detail: string, sentCount = 0, key = '') => {
      try {
        await supabase.from('push_log').insert({
          recipient_id: row.recipient_id,
          status,
          detail,
          sent_count: sentCount,
          key,
        })
      } catch (e) {
        console.warn('[send-push] push_log insert failed:', (e as Error)?.message)
      }
    }

    // ---- Resolve recipient role ----
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', row.recipient_id)
      .maybeSingle()
    if (profileErr) console.warn('[send-push] profile lookup error:', profileErr.message)
    const role = (profile as any)?.role ?? 'seller'
    console.log('[send-push] recipient role:', role)

    // ---- Resolve notification key ----
    const key = row.notification_key || defaultKeyForInboxType(row.inbox_type, role)

    // ---- Template lookup ----
    const { data: tplRow } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('key', key)
      .maybeSingle()
    const template = (tplRow as any) ?? {
      enabled: true,
      title_template: row.title || 'Calista Concept',
      body_template: row.body || '',
      tone: 'normal',
    }
    if (!template.enabled) {
      console.log('[send-push] template disabled:', key)
      await log('skipped', `Template "${key}" is disabled globally`, 0, key)
      return json({ sent: 0, reason: 'template_disabled' })
    }

    // ---- User preference ----
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', row.recipient_id)
      .eq('key', key)
      .maybeSingle()
    if (pref && pref.enabled === false) {
      console.log('[send-push] user disabled:', key)
      await log('skipped', `Recipient disabled "${key}" in their preferences`, 0, key)
      return json({ sent: 0, reason: 'user_disabled' })
    }

    // ---- Build payload from template ----
    const meta = row.metadata ?? {}
    const vars: Record<string, string> = {
      subject: row.title ?? '',
      // The {body} placeholder is used by the broadcast template (and is
      // safe to expose to any other template that wants to inline the
      // raw inbox_messages.body).  Without this, broadcast bodies came
      // through empty because the placeholder resolved to "".
      body: row.body ?? '',
      actor: (meta.actor_name as string) ?? 'Someone',
      amount: (meta.amount as string) ?? '',
      period: (meta.period as string) ?? '',
      when: (meta.when as string) ?? '',
    }
    const title = fillTemplate(template.title_template, vars) || 'Calista Concept'
    const bodyText = fillTemplate(template.body_template, vars)
    const tag = TONE_TAG[template.tone] || ''
    const payload = JSON.stringify({ title, body: bodyText, tag: tag || undefined, url: row.action_url || '/' })
    console.log('[send-push] payload built:', payload.slice(0, 120))

    // ---- Fetch subscriptions ----
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth_key,subscription')
      .eq('user_id', row.recipient_id)
    if (subsErr) {
      console.error('[send-push] subs query error:', subsErr.message)
      await log('error', `DB error fetching subscriptions: ${subsErr.message}`, 0, key)
      return json({ error: 'db_error', detail: subsErr.message }, 500)
    }
    const list = (subs as any[]) ?? []
    console.log('[send-push] found', list.length, 'subscription(s)')
    if (list.length === 0) {
      await log('skipped', 'No devices subscribed — ask the user to enable notifications in their profile', 0, key)
      return json({ sent: 0, reason: 'no_subscriptions' })
    }

    // ---- Send pushes ----
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
      console.log('[send-push] sending to:', sub.endpoint?.slice(0, 50) + '...')
      try {
        await webPush.sendNotification(sub, payload, { TTL: 86400 })
        sent++
        console.log('[send-push] OK sent to', sub.endpoint?.slice(0, 30) + '...')
      } catch (e: any) {
        const status = e?.statusCode ?? 0
        const body = e?.body ?? ''
        console.error('[send-push] FAILED status:', status, 'body:', (body || '').slice(0, 200))
        if (status === 404 || status === 410) {
          gone.push(s.endpoint)
        } else {
          errors.push(`HTTP ${status || 'unknown'}: ${(body || e?.message || 'unknown error').slice(0, 200)}`)
        }
      }
    }

    if (gone.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', gone).eq('user_id', row.recipient_id)
    }

    const detail = sent > 0
      ? `Delivered to ${sent}/${list.length} device(s)${gone.length ? `, removed ${gone.length} expired` : ''}`
      : `All device pushes failed: ${errors.join(' | ') || 'unknown'}`
    console.log('[send-push] RESULT: sent=' + sent, 'gone=' + gone.length, 'errors=' + errors.length)
    await log(sent > 0 ? 'sent' : 'error', detail, sent, key)
    return json({ sent, gone: gone.length, errors })
  } catch (e) {
    console.error('[send-push] === UNCAUGHT ERROR ===', (e as Error)?.message || e)
    console.error('[send-push] stack:', (e as Error)?.stack || '(none)')
    if (log) {
      try { await log('error', `Unexpected error: ${(e as Error)?.message ?? e}`) } catch {}
    }
    return json({ error: 'internal', detail: (e as Error)?.message }, 500)
  }
})
