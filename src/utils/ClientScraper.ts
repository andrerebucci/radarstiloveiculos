import { supabase } from '@/integrations/supabase/client';

const TIMEOUT_MS = 90_000;

export class ClientScraper {
  static async fetchHtml(url: string): Promise<{ html: string; source: string }> {
    console.log('Fetching via Edge Function:', url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      // Use direct fetch instead of supabase.functions.invoke so we can attach
      // an AbortController and surface non-2xx responses clearly.
      const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID as string | undefined;
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      const base = supabaseUrl || (projectRef ? `https://${projectRef}.supabase.co` : '');
      if (!base || !anonKey) throw new Error('Configuração do backend ausente');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || anonKey;

      const resp = await fetch(`${base}/functions/v1/scrape-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.error('Edge function HTTP error:', resp.status, txt.slice(0, 300));
        throw new Error(`Edge function HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (!data?.success || !data?.html) {
        throw new Error(data?.error || 'No HTML returned');
      }

      console.log(`HTML fetched via ${data.source}: ${data.html.length} chars`);
      return { html: data.html, source: data.source };
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        console.error('Edge function timeout after', TIMEOUT_MS, 'ms');
        throw new Error('Tempo esgotado ao buscar página (90s)');
      }
      console.error('Edge function failed:', e);
      throw new Error(e?.message ? `Falha ao baixar HTML: ${e.message}` : 'Falha ao baixar HTML via Edge Function');
    } finally {
      clearTimeout(timer);
    }
  }
}
