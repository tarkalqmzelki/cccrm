// Calista Concept — daily-reminders Edge Function
//
// Scheduled once per day at 09:00 UTC by pg_cron (see schema29.sql).
// Scans for pending payouts older than 7 days and drops an inbox message
// into every admin's mailbox (which cascades to push via trg_notify_push).
//
// Authorization: callers must present the service-role bearer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const STALE_DAYS = 7

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== SERVICE_ROLE) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // Admins who will receive the reminder.
  const { data: admins } = await supabase.from('profiles').select('id,full_name').eq('role', 'admin').eq('active', true)
  const adminList = (admins as any[]) ?? []
  if (adminList.length === 0) return json({ reminded: 0, admins: 0 })

  // Pending payouts older than STALE_DAYS.
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: stale } = await supabase
    .from('payouts')
    .select('id,amount,paid_amount,period,created_at,seller_id')
    .eq('status', 'pending')
    .lt('created_at', cutoff)

  const list = (stale as any[]) ?? []
  if (list.length === 0) return json({ reminded: 0, admins: adminList.length })

  // Total outstanding for the summary message.
  const totalRemaining = list.reduce((sum, p) => sum + Math.max(p.amount - (p.paid_amount || 0), 0), 0)
  const formattedAmount = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(totalRemaining)

  // Drop one inbox message per admin (push cascade fires from the trigger).
  const rows = adminList.map((a) => ({
    recipient_id: a.id,
    sender_id: null,
    type: 'system',
    title: 'Pending payout reminder',
    body: `${list.length} payout(s) totalling ${formattedAmount} have been pending for over ${STALE_DAYS} days.`,
    action_url: '/payouts',
    metadata: { kind: 'payout_reminder', count: list.length, amount: formattedAmount },
    notification_key: 'admin_payout_reminder',
  }))
  const { error } = await supabase.from('inbox_messages').insert(rows)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  return json({ reminded: list.length, admins: adminList.length })
})

function json(obj: unknown) {
  return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } })
}
