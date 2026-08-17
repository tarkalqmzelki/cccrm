// Calista Concept — send-push Edge Function
//
// Called by the `trg_notify_push` Postgres trigger (via pg_net) every time
// an `inbox_messages` row is inserted.  Looks up the recipient's push
// subscriptions, the admin-controlled template, and the user's per-type
// preferences, then sends a Web Push to every subscribed device.
//
// Environment (set via `supabase secrets set …` or dashboard):
//   VAPID_SUBJECT           — e.g. "mailto:ops@calistaconcept.eu"
//   VAPID_PUBLIC_KEY        — base64url-encoded P-256 public key
//   VAPID_PRIVATE_KEY       — base64url-encoded P-256 private key
//
// Authorization: callers must present the project's service-role JWT in
// the `Authorization: Bearer …` header.  The trigger stores that bearer
// in `app_secrets.edge_bearer`.  Browsers / external callers are denied.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ops@calistaconcept.eu'
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

// ---------- base64url helpers ----------
function b64uDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const ENC = new TextEncoder()

// ---------- VAPID JWT (ES256) ----------
async function vapidJwt(): Promise<string> {
  const header = b64uEncode(ENC.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64uEncode(
    ENC.encode(
      JSON.stringify({
        aud: new URL(SUPABASE_URL).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: VAPID_SUBJECT,
      }),
    ),
  )
  const data = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    b64uDecode(VAPID_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const rawSig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, ENC.encode(data)))
  // Web Crypto returns r||s as 64 raw bytes; JWT needs ASN.1 DER.
  return `${data}.${b64uEncode(ecRawToDer(rawSig))}`
}

function ecRawToDer(sig: Uint8Array): Uint8Array {
  const encInt = (b: Uint8Array) => {
    let i = 0
    while (i < b.length - 1 && b[i] === 0) i++
    const trim = b.subarray(i)
    const pad = trim[0] & 0x80 ? 1 : 0
    const out = new Uint8Array(trim.length + pad + (pad ? 1 : 0))
    if (pad) out[1] = 0x00
    out.set(trim, 1 + pad)
    return out
  }
  const r = encInt(sig.subarray(0, 32))
  const s = encInt(sig.subarray(32))
  const body = new Uint8Array(2 + r.length + 2 + s.length)
  body[0] = 0x30
  body[1] = body.length - 2
  let p = 2
  body[p++] = 0x02; body[p++] = r.length; body.set(r, p); p += r.length
  body[p++] = 0x02; body[p++] = s.length; body.set(s, p)
  return body
}

// ---------- RFC 8188 aes128gcm content encoding ----------
async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPub = b64uDecode(p256dh)
  const authBuf = b64uDecode(auth)

  const userKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const appPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
  const appPub = new Uint8Array(await crypto.subtle.exportKey('raw', appPair.publicKey))

  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: userKey }, appPair.privateKey, 256))

  // IKM = auth || shared_secret
  const ikm = new Uint8Array(authBuf.length + shared.length)
  ikm.set(authBuf, 0)
  ikm.set(shared, authBuf.length)

  // info = "WebPush: info\0" || ua_pub || as_pub
  const info = new Uint8Array(20 + uaPub.length + appPub.length)
  info.set(ENC.encode('WebPush: info\u0000'), 0)
  info.set(uaPub, 20)
  info.set(appPub, 20 + uaPub.length)

  const prk = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveKey'])
  const contentKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info },
    prk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, contentKey, ENC.encode(payload)))

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const header = new Uint8Array(16 + 4 + 1 + appPub.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = appPub.length
  header.set(appPub, 21)

  const padding = new Uint8Array([0x02]) // delimiter (end-of-record)
  const record = new Uint8Array(header.length + ct.length + padding.length)
  record.set(header, 0)
  record.set(ct, header.length)
  record.set(padding, header.length + ct.length)
  return record
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth_key: string }, payload: string, vapid: string): Promise<'ok' | 'gone' | 'error'> {
  try {
    const encrypted = await encryptPayload(payload, sub.p256dh, sub.auth_key)
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Authorization': `vapid t=${vapid}, k=${VAPID_PUBLIC_KEY}`,
        'Content-Type': 'application/octet-stream',
      },
      body: encrypted,
    })
    if (res.status === 404 || res.status === 410) return 'gone'
    if (!res.ok) console.warn('push failed', sub.endpoint, res.status, await res.text())
    return 'ok'
  } catch (e) {
    console.warn('push error', e)
    return 'error'
  }
}

// ---------- template + preference logic ----------
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== SERVICE_ROLE) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response('VAPID not configured', { status: 500 })
  }

  const body = await req.json().catch(() => null)
  if (!body || !body.recipient_id) return new Response('Bad request', { status: 400 })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // Resolve recipient role (for default key selection).
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', body.recipient_id).maybeSingle()
  const role = (profile as any)?.role ?? 'seller'

  const explicitKey = (body.notification_key as string | undefined) ?? ''
  const key = explicitKey || defaultKeyForInboxType(body.inbox_type as string, role)

  // Template lookup (fall back to literal title/body passed by trigger).
  const { data: tplRow } = await supabase.from('notification_templates').select('*').eq('key', key).maybeSingle()
  const template = (tplRow as any) ?? {
    enabled: true,
    title_template: body.title ?? 'Calista Concept',
    body_template: body.body ?? '',
    tone: 'normal',
  }
  if (!template.enabled) {
    return json({ sent: 0, reason: 'template_disabled' })
  }

  // User preference (defaults to enabled if no row).
  const { data: pref } = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', body.recipient_id)
    .eq('key', key)
    .maybeSingle()
  if (pref && pref.enabled === false) {
    return json({ sent: 0, reason: 'user_disabled' })
  }

  // Fill template placeholders.
  const meta = body.metadata ?? {}
  const vars: Record<string, string> = {
    subject: body.title ?? '',
    actor: (meta.actor_name as string) ?? 'Someone',
    amount: (meta.amount as string) ?? '',
    period: (meta.period as string) ?? '',
    when: (meta.when as string) ?? '',
  }
  const title = fillTemplate(template.title_template, vars) || 'Calista Concept'
  const bodyText = fillTemplate(template.body_template, vars)
  const tag = TONE_TAG[template.tone] || ''
  const payload = JSON.stringify({ title, body: bodyText, tag: tag || undefined, url: body.action_url || '/' })

  // Subscriptions for this user.
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth_key')
    .eq('user_id', body.recipient_id)
  const list = (subs as any[]) ?? []
  if (list.length === 0) return json({ sent: 0, reason: 'no_subscriptions' })

  const vapid = await vapidJwt()
  let sent = 0
  const gone: string[] = []
  for (const s of list) {
    const r = await sendPush(s, payload, vapid)
    if (r === 'ok') sent++
    if (r === 'gone') gone.push(s.endpoint)
  }
  if (gone.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', gone).eq('user_id', body.recipient_id)
  }
  return json({ sent, gone: gone.length })
})

function json(obj: unknown) {
  return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } })
}
