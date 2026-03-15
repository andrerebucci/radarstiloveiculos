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
      console.error('Edge function failed:', e);
      throw new Error('Falha ao baixar HTML via Edge Function');
    }
  }
}
