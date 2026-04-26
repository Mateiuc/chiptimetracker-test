import { supabase } from '@/integrations/supabase/client';

/**
 * Mint a short-lived signed URL for a diagnostic PDF stored in the private
 * `diagnostic-pdfs` bucket. Returns null on failure.
 */
export async function signDiagnosticPdfUrl(path: string, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.functions.invoke('sign-diagnostic-url', {
      body: { path, expiresIn },
    });
    if (error) {
      console.warn('[diagnosticPdfService] sign failed:', error.message);
      return null;
    }
    return (data?.url as string) || null;
  } catch (e) {
    console.warn('[diagnosticPdfService] sign threw:', e);
    return null;
  }
}

/**
 * Resolve a diagnostic PDF URL: if a storage `path` is available, mint a
 * fresh signed URL; otherwise fall back to the stored (possibly legacy or
 * still-valid signed) URL.
 */
export async function resolveDiagnosticPdfUrl(opts: {
  path?: string;
  url?: string;
}): Promise<string | null> {
  if (opts.path) {
    const fresh = await signDiagnosticPdfUrl(opts.path);
    if (fresh) return fresh;
  }
  return opts.url || null;
}
