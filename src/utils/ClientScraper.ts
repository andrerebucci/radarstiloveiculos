export class ClientScraper {
  // Attempts multiple public CORS-friendly proxies to fetch raw HTML from the client
  static async fetchHtml(url: string): Promise<{ html: string; source: string }> {
    const encoded = encodeURIComponent(url);
    const stripped = url.replace(/^https?:\/\//, '');

    const attempts = [
      { url: `https://api.allorigins.win/raw?url=${encoded}`, source: 'allorigins' },
      { url: `https://cors.isomorphic-git.org/${url}`, source: 'isomorphic-git' },
      { url: `https://r.jina.ai/http://${stripped}`, source: 'r.jina.ai' },
    ];

    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, { method: 'GET' });
        if (res.ok) {
          const text = await res.text();
          if (text && text.length > 0) {
            return { html: text, source: attempt.source };
          }
        }
      } catch (e) {
        // Try next proxy
      }
    }

    throw new Error('Falha ao baixar HTML (CORS/proxy)');
  }
}
