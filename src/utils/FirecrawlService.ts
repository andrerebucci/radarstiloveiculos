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

  static async crawlWebsite(url: string): Promise<{ success: boolean; error?: string; data?: CrawlStatusResponse }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }

    try {
      console.log('Making crawl request to Firecrawl API');
      this.ensureClient();

      const crawlResponse = await this.firecrawlApp!.crawlUrl(url, {
        limit: 10,
        scrapeOptions: {
          formats: ['html', 'markdown'],
        },
      }) as CrawlResponse;

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
