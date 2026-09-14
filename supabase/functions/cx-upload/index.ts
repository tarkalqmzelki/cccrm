// Calista Concept — cx-upload Edge Function
//
// Client file uploads for the Client Experience. The client has NO
// Supabase credentials — it posts the raw token + file as multipart
// form data. The function validates the SHA-256 token hash against
// client_experience_access, stores the file in the private
// 'client-files' bucket under the access id, and registers it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const form = await req.formData()
    const token = String(form.get('token') || '')
    const file = form.get('file')

    if (!token || token.length < 20 || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'TOO_LARGE' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Validate token
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: access, error: aErr } = await admin
      .from('client_experience_access')
      .select('id, deal_id, status, expires_at, revoked_at, created_by')
      .eq('token_hash', tokenHash)
      .single()
    if (aErr || !access || access.status === 'revoked' || (access.expires_at && new Date(access.expires_at) < new Date())) {
      return new Response(JSON.stringify({ error: 'INVALID' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Upload
    const path = `${access.id}/${Date.now()}-${file.name.replace(/[^\w.\- ]/g, '_')}`
    const { error: upErr } = await admin.storage.from('client-files').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (upErr) {
      return new Response(JSON.stringify({ error: 'UPLOAD_FAILED', detail: upErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Register + event
    const { data: frow, error: fErr } = await admin
      .from('cx_files')
      .insert({
        access_id: access.id,
        deal_id: access.deal_id,
        name: file.name,
        storage_path: path,
        size_bytes: file.size,
        mime: file.type || 'application/octet-stream',
        uploaded_by: 'client',
      })
      .select()
      .single()
    if (fErr) {
      return new Response(JSON.stringify({ error: 'REGISTER_FAILED', detail: fErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    await admin.from('client_experience_events').insert({
      access_id: access.id,
      event_type: 'file_uploaded',
      actor_type: 'client',
      entity_type: 'file',
      entity_id: frow.id,
      metadata: { name: file.name, size: file.size },
    })

    const { data: deal } = await admin.from('deals').select('seller_id, company').eq('id', access.deal_id).single()
    if (deal) {
      await admin.from('inbox_messages').insert({
        recipient_id: access.created_by || deal.seller_id,
        sender_id: null,
        type: 'system',
        title: 'Client uploaded a file',
        body: `${deal.company}: ${file.name}`,
        action_url: `/deals/${access.deal_id}`,
        metadata: { kind: 'cx_file', deal_id: access.deal_id },
        notification_key: 'admin_inbox',
        read: false,
        is_starred: false,
        folder: 'inbox',
        priority: 'normal',
        category: 'client-experience',
      })
    }

    return new Response(JSON.stringify({ ok: true, id: frow.id, name: frow.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'SERVER', detail: (e as Error)?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})