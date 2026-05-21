export interface WebmotorsListing {
  url: string;
  title?: string;
  price?: string;
  year?: string;
  mileage?: string;
  location?: string;
}

const COMPRAR_LINK = /\/comprar\/[^"'\s)]+\/(\d{6,})/;
const COMPRAR_GLOBAL = /\/comprar\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/[\d-]+\/(\d{6,})/gi;

export class WebmotorsParser {
  static extractListings(html: string): WebmotorsListing[] {
    console.log('=== WEBMOTORS PARSER ===');
    console.log('HTML length:', html.length);

    // Strategy 1: __NEXT_DATA__ (when scripts present)
    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1]);
        const items = data?.props?.pageProps?.catalogProps?.items;
        if (Array.isArray(items) && items.length > 0) {
          const listings = items.map((it: any) => this.fromCatalogItem(it)).filter((l): l is WebmotorsListing => !!l);
          if (listings.length > 0) {
            console.log(`Webmotors __NEXT_DATA__: ${listings.length} anúncios`);
            return listings;
          }
        }
        const deep = this.deepFindOfferItems(data);
        if (deep.length > 0) {
          console.log(`Webmotors deep-scan: ${deep.length} anúncios`);
          return deep;
        }
      } catch { /* fall through */ }
    }

    // Strategy 2: DOM-based extraction from rendered HTML (Firecrawl output)
    const domResults = this.extractViaDom(html);
    if (domResults.length > 0) {
      console.log(`Webmotors DOM: ${domResults.length} anúncios`);
      return domResults;
    }

    // Strategy 3: Regex fallback grouping by vehicle id
    const regexResults = this.extractViaRegex(html);
    if (regexResults.length > 0) {
      console.log(`Webmotors regex: ${regexResults.length} anúncios`);
      return regexResults;
    }

    console.log('Webmotors: 0 anúncios encontrados');
    return [];
  }

  private static extractViaDom(html: string): WebmotorsListing[] {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const anchors = Array.from(doc.querySelectorAll('a[href*="/comprar/"]')) as HTMLAnchorElement[];

      const byId = new Map<string, { url: string; title?: string; price?: string; year?: string }>();
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const m = href.match(COMPRAR_LINK);
        if (!m) continue;
        const id = m[1];
        const url = href.startsWith('http') ? href : `https://www.webmotors.com.br${href.startsWith('/') ? '' : '/'}${href}`;
        const cleanUrl = url.split('#')[0].split('?')[0];

        if (!byId.has(id)) {
          byId.set(id, { url: cleanUrl });
        }
        const entry = byId.get(id)!;

        // Title from img title/alt attribute (most reliable on Webmotors cards)
        if (!entry.title) {
          const img = a.querySelector('img[title], img[alt]') as HTMLImageElement | null;
          const t = img?.getAttribute('title') || img?.getAttribute('alt');
          if (t && /honda|fit|toyota|chevrolet|fiat|ford|hyundai|jeep|nissan|renault|volkswagen|peugeot|kia|bmw|mercedes|audi/i.test(t)) {
            entry.title = t.trim();
          }
        }

        // Year from URL slug: /<modelo>/<versao>/<portas>/<ano>/<id>
        if (!entry.year) {
          const ym = href.match(/\/(\d{4}(?:-\d{4})?)\/\d{6,}/);
          if (ym) entry.year = ym[1];
        }
      }

      if (byId.size === 0) return [];

      // For each id, find a card container and extract price
      for (const [id, entry] of byId) {
        // Find the deepest anchor whose href contains this id, then walk up to a card root
        const anchor = doc.querySelector(`a[href*="/${id}"]`) as HTMLAnchorElement | null;
        if (!anchor) continue;

        let node: HTMLElement | null = anchor;
        let priceText: string | undefined;
        for (let depth = 0; depth < 12 && node; depth++) {
          node = node.parentElement;
          if (!node) break;
          // Look for price element only inside this candidate ancestor
          const priceEl = node.querySelector('p, span');
          if (priceEl) {
            const txt = (node.textContent || '').replace(/\u00a0/g, ' ');
            const pm = txt.match(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)/);
            if (pm) {
              // Make sure this isn't the filter chip (price-max = 39.000 with "máximo")
              const ctx = txt.slice(Math.max(0, txt.indexOf(pm[0]) - 40), txt.indexOf(pm[0]) + pm[0].length + 40).toLowerCase();
              if (!/máximo|minimo|mínimo/i.test(ctx)) {
                priceText = `R$ ${pm[1]}`;
                break;
              }
            }
          }
        }
        if (priceText) entry.price = priceText;
      }

      return Array.from(byId.values())
        .filter(e => e.url)
        .map(e => ({ url: e.url, title: e.title, price: e.price, year: e.year }));
    } catch (e) {
      console.log('Webmotors DOM error:', e);
      return [];
    }
  }

  private static extractViaRegex(html: string): WebmotorsListing[] {
    const byId = new Map<string, WebmotorsListing>();
    const matches = Array.from(html.matchAll(COMPRAR_GLOBAL));
    for (const m of matches) {
      const id = m[1];
      const full = m[0];
      const fullUrl = `https://www.webmotors.com.br${full}`;
      if (!byId.has(id)) byId.set(id, { url: fullUrl });
    }
    if (byId.size === 0) return [];

    // Decode HTML entities for nbsp -> space
    const decoded = html.replace(/&nbsp;/g, ' ');
    for (const [id, listing] of byId) {
      const idx = decoded.indexOf(`/${id}`);
      if (idx < 0) continue;
      const window = decoded.slice(idx, idx + 8000);
      // Title from alt/title attribute
      const t = window.match(/(?:title|alt)="((?:HONDA|TOYOTA|CHEVROLET|FIAT|FORD|HYUNDAI|JEEP|NISSAN|RENAULT|VOLKSWAGEN|VW|PEUGEOT|KIA|BMW|MERCEDES|AUDI)[^"]{3,120})"/i);
      if (t) listing.title = t[1].trim();
      // Price (skip filter "máximo")
      const priceMatches = Array.from(window.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)/g));
      for (const pm of priceMatches) {
        const pIdx = pm.index ?? 0;
        const ctx = window.slice(Math.max(0, pIdx - 60), pIdx + 60).toLowerCase();
        if (/máximo|mínimo|minimo|maximo/.test(ctx)) continue;
        listing.price = `R$ ${pm[1]}`;
        break;
      }
      const ym = window.match(/\/(\d{4}(?:-\d{4})?)\/\d{6,}/);
      if (ym) listing.year = ym[1];
    }
    return Array.from(byId.values());
  }

  private static fromCatalogItem(item: any): WebmotorsListing | null {
    if (!item || typeof item !== 'object') return null;
    const offers = item.offers || item.Offers || {};
    const url: string = offers.url || item.url || '';
    const name: string = item.name || item.Name || '';
    const rawPrice = offers.price ?? offers.Price ?? item.price;
    if (!url) return null;
    const listing: WebmotorsListing = { url };
    if (name) listing.title = String(name).trim();
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
      const num = Number(rawPrice);
      if (!Number.isNaN(num) && num > 0) listing.price = `R$ ${num.toLocaleString('pt-BR')}`;
      else listing.price = `R$ ${rawPrice}`;
    }
    const yearMatch = url.match(/\/(\d{4}(?:-\d{4})?)\/\d{6,}/);
    if (yearMatch) listing.year = yearMatch[1];
    return listing;
  }

  private static deepFindOfferItems(root: any): WebmotorsListing[] {
    const out: WebmotorsListing[] = [];
    const seen = new Set<string>();
    const walk = (o: any, depth = 0) => {
      if (depth > 12 || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        if (o.length > 0 && o[0] && typeof o[0] === 'object' && o[0].offers && (o[0].offers.url || o[0].offers.price)) {
          for (const it of o) {
            const l = this.fromCatalogItem(it);
            if (l && !seen.has(l.url)) { seen.add(l.url); out.push(l); }
          }
          return;
        }
        for (const v of o) walk(v, depth + 1);
      } else {
        for (const k of Object.keys(o)) walk(o[k], depth + 1);
      }
    };
    walk(root);
    return out;
  }
}
