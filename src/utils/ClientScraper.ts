import { supabase } from '@/integrations/supabase/client';

export class ClientScraper {
  static async fetchHtml(url: string): Promise<{ html: string; source: string }> {
    console.log('Fetching via Edge Function:', url);
    
    try {
      const { data, error } = await supabase.functions.invoke('scrape-url', {
        body: { url },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(`Edge function error: ${error.message}`);
      }

      if (!data?.success || !data?.html) {
        throw new Error(data?.error || 'No HTML returned');
      }

      console.log(`HTML fetched via ${data.source}: ${data.html.length} chars`);
      return { html: data.html, source: data.source };
    } catch (e) {
      console.error('Edge function failed, trying CORS proxies as fallback:', e);
      return this.fetchViaProxies(url);
    }
  }

  private static async fetchViaProxies(url: string): Promise<{ html: string; source: string }> {
    const encoded = encodeURIComponent(url);
    const attempts = [
      { url: `https://api.allorigins.win/raw?url=${encoded}`, source: 'allorigins' },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encoded}`, source: 'codetabs' },
    ];

    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, { method: 'GET' });
        if (res.ok) {
          const text = await res.text();
          if (text && text.length > 500) {
            return { html: text, source: attempt.source };
          }
        }
      } catch (e) {
        // Try next proxy
      }
    }

    throw new Error('Falha ao baixar HTML (Edge Function e proxies falharam)');
  }
}
