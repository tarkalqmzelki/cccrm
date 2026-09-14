// Calista Concept — cx-file Edge Function
//
// Returns a short-lived signed download URL for a client-experience
// file. Token-validated: the client can only reach files belonging to
// its own experience.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || ''
    const fileId = url.searchParams.get('file') || ''
    if (!token || token.length < 20 || !fileId) {
      return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: access } = await admin
      .from('client_experience_access')
      .select('id, status, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .single()
    if (!access || access.status === 'revoked' || (access.expires_at && new Date(access.expires_at) < new Date())) {
      return new Response(JSON.stringify({ error: 'INVALID' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: file } = await admin
      .from('cx_files')
      .select('id, storage_path, name, mime')
      .eq('id', fileId)
      .eq('access_id', access.id)
      .single()
    if (!file) {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: signed } = await admin.storage.from('client-files').createSignedUrl(file.storage_path, 600)
    if (!signed?.signedUrl) {
      return new Response(JSON.stringify({ error: 'SIGN_FAILED' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    await admin.from('client_experience_events').insert({
      access_id: access.id,
      event_type: 'document_viewed',
      actor_type: 'client',
      entity_type: 'file',
      entity_id: file.id,
      metadata: { name: file.name },
    })

    return new Response(JSON.stringify({ ok: true, url: signed.signedUrl, name: file.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'SERVER', detail: (e as Error)?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})