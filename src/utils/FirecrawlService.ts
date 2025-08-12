import FirecrawlApp from '@mendable/firecrawl-js';

interface ErrorResponse {
  success: false;
  error: string;
}

interface CrawlPageItem {
  url?: string;
  html?: string;
  markdown?: string;
  [key: string]: any;
}

interface CrawlStatusResponse {
  success: true;
  status?: string;
  completed?: number;
  total?: number;
  creditsUsed?: number;
  expiresAt?: string;
  data: CrawlPageItem[];
}

type CrawlResponse = CrawlStatusResponse | ErrorResponse;

export class FirecrawlService {
  private static API_KEY_STORAGE_KEY = 'firecrawl_api_key';
  private static firecrawlApp: FirecrawlApp | null = null;

  static saveApiKey(apiKey: string): void {
    localStorage.setItem(this.API_KEY_STORAGE_KEY, apiKey);
    this.firecrawlApp = new FirecrawlApp({ apiKey });
    console.log('API key saved successfully');
  }

  static getApiKey(): string | null {
    return localStorage.getItem(this.API_KEY_STORAGE_KEY);
  }

  static async testApiKey(apiKey: string): Promise<boolean> {
    try {
      console.log('Testing API key with Firecrawl API');
      this.firecrawlApp = new FirecrawlApp({ apiKey });
      const testResponse = await this.firecrawlApp.crawlUrl('https://example.com', {
        limit: 1,
      });
      return (testResponse as any)?.success === true;
    } catch (error) {
      console.error('Error testing API key:', error);
      return false;
    }
  }

  static ensureClient() {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('Firecrawl API key not configured');
    if (!this.firecrawlApp) this.firecrawlApp = new FirecrawlApp({ apiKey });
  }

  private static getScrapeOptions(url: string): any {
    try {
      const host = new URL(url).hostname;
      let waitFor: string | number | undefined;
      if (host.includes('olx.com.br')) waitFor = 'a[href*="/d/"], a[href*="/item/"]';
      else if (host.includes('webmotors.com.br')) waitFor = 'a[href*="/carro/"], a[href*="/carros/"]';
      else if (host.includes('mercadolivre.com.br')) waitFor = 'a[href*="MLB"], a[href*="/item/"]';

      return {
        formats: ['html', 'markdown'],
        ...(waitFor ? { waitFor } : {}),
      };
    } catch {
      return { formats: ['html', 'markdown'] };
    }
  }

  static async crawlWebsite(url: string): Promise<{ success: boolean; error?: string; data?: CrawlStatusResponse }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }

    try {
      console.log('Making crawl request to Firecrawl API');
      this.ensureClient();

      // 1) Try a lightweight single-page scrape first (usually enough for search pages)
      try {
        const scrapeResp: any = await (this.firecrawlApp as any).scrapeUrl(url, this.getScrapeOptions(url));
        if (scrapeResp?.success && scrapeResp?.data && (scrapeResp.data.html || scrapeResp.data.markdown)) {
          const adapted: CrawlStatusResponse = {
            success: true,
            status: 'completed',
            completed: 1,
            total: 1,
            creditsUsed: (scrapeResp as any)?.creditsUsed,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            data: [
              {
                url,
                html: scrapeResp.data.html,
                markdown: scrapeResp.data.markdown,
                ...scrapeResp.data,
              },
            ],
          };
          console.log('Scrape successful:', adapted);
          return { success: true, data: adapted };
        }
      } catch (e) {
        // If scrape fails (e.g., rate limit), we'll try crawl next
        console.warn('Scrape failed, attempting crawl as fallback:', e);
      }

      // 2) Fallback to small crawl (kept tight to reduce rate-limit issues)
      const crawlResponse = (await this.firecrawlApp!.crawlUrl(url, {
        limit: 5,
        scrapeOptions: {
          formats: ['html', 'markdown'],
        },
      })) as CrawlResponse;

      if (!('success' in crawlResponse) || !crawlResponse.success) {
        const err = (crawlResponse as ErrorResponse).error || 'Failed to crawl website';
        console.error('Crawl failed:', err);
        return { success: false, error: err };
      }

      console.log('Crawl successful:', crawlResponse);
      return { success: true, data: crawlResponse as CrawlStatusResponse };
    } catch (error) {
      console.error('Error during crawl:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect to Firecrawl API' };
    }
  }
}
