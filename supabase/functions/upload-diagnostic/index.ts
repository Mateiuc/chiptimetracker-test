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

    const { base64, vehicleId, taskId, fileName } = await req.json()

    const pathPrefix = taskId || vehicleId
    if (!base64 || !pathPrefix) {
      return new Response(JSON.stringify({ error: 'Missing required fields (base64 and taskId or vehicleId)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // SECURITY: Resolve caller's workspace and prefix the storage path so
    // callers cannot overwrite diagnostic PDFs in other workspaces.
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
    if (!/^[a-zA-Z0-9._-]+$/.test(String(pathPrefix))) {
      return new Response(JSON.stringify({ error: 'Invalid id' }), {
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

    const safeName = (fileName || 'diagnostic.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${wsId}/${pathPrefix}/${safeName}`

    const { error } = await supabase.storage
      .from('diagnostic-pdfs')
      .upload(filePath, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (error) {
      console.error('Upload error:', error)
      return new Response(JSON.stringify({ error: 'Storage error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Bucket is private — return a long-lived signed URL plus the
    // canonical storage path so the app can re-mint signed URLs later
    // via sign-diagnostic-url.
    const { data: signed, error: signErr } = await supabase.storage
      .from('diagnostic-pdfs')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7) // 7 days

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
    console.error('upload-diagnostic error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
