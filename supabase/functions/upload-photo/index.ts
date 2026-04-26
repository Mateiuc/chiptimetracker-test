import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { base64, taskId, photoId } = await req.json()

    if (!base64 || !taskId || !photoId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // SECURITY: Resolve caller's workspace server-side and prefix the storage
    // path with it, so callers cannot overwrite files in workspaces they don't
    // belong to (the service-role key bypasses storage RLS).
    const { data: wsId, error: wsErr } = await supabase.rpc(
      'user_primary_workspace',
      { _user_id: userData.user.id }
    )
    if (wsErr || !wsId) {
      return new Response(JSON.stringify({ error: 'No workspace for user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate caller-supplied IDs to keep paths sane.
    const safeId = (s: string) => /^[a-zA-Z0-9._-]+$/.test(s)
    if (!safeId(taskId) || !safeId(photoId)) {
      return new Response(JSON.stringify({ error: 'Invalid taskId or photoId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Decode base64 to binary
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const filePath = `${wsId}/${taskId}/${photoId}.jpg`

    const { error } = await supabase.storage
      .from('session-photos')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (error) {
      console.error('Upload error:', error)
      return new Response(JSON.stringify({ error: 'Storage error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Bucket is private — issue a short-lived signed URL so the caller
    // can render the photo immediately. Persist `path` as the canonical
    // reference; signed URLs can always be re-minted via sign-photo-urls.
    const { data: signed, error: signErr } = await supabase.storage
      .from('session-photos')
      .createSignedUrl(filePath, 60 * 60 * 24) // 24h

    if (signErr) {
      console.error('Sign error:', signErr)
      return new Response(JSON.stringify({ error: 'Storage error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ url: signed.signedUrl, path: filePath }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('upload-photo error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
