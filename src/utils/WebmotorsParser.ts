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
const KM_PATTERN = /(\d{1,3}(?:\.\d{3})+|\d{4,6})\s*(?:km|kms|quil[oô]metros?)/i;

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

    // Strategy 2 + 3: DOM extraction, with regex-based enrichment for mileage/location.
    const domResults = this.extractViaDom(html);
    const regexResults = this.extractViaRegex(html);

    if (domResults.length > 0) {
      const byId = new Map<string, WebmotorsListing>();
      for (const r of regexResults) {
        const m = r.url.match(/\/(\d{6,})(?:[/?#]|$)/);
        if (m) byId.set(m[1], r);
      }
      for (const d of domResults) {
        if (d.mileage && d.location) continue;
        const m = d.url.match(/\/(\d{6,})(?:[/?#]|$)/);
        const enrich = m ? byId.get(m[1]) : undefined;
        if (enrich) {
          if (!d.mileage && enrich.mileage) d.mileage = enrich.mileage;
          if (!d.location && enrich.location) d.location = enrich.location;
        }
      }
      const kmHits = domResults.filter(r => r.mileage).length;
      console.log(`Webmotors DOM: ${domResults.length} anúncios (KM: ${kmHits})`);
      return domResults;
    }

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

      // Prefer iterating the actual card containers (one per anúncio).
      const cardNodes = Array.from(
        doc.querySelectorAll('[class*="_Card_1wsqi_82"], [class*="_Card_18bss_1"][class*="_Horizontal"]')
      ) as HTMLElement[];

      const byId = new Map<string, { url: string; title?: string; price?: string; year?: string; mileage?: string; location?: string }>();

      const handleCard = (card: HTMLElement) => {
        // Find the canonical /comprar/ link inside this card
        const anchors = Array.from(card.querySelectorAll('a[href*="/comprar/"]')) as HTMLAnchorElement[];
        let id = '';
        let href = '';
        for (const a of anchors) {
          const h = a.getAttribute('href') || '';
          const m = h.match(COMPRAR_LINK);
          if (m) { id = m[1]; href = h; break; }
        }
        if (!id) return;

        const url = href.startsWith('http') ? href : `https://www.webmotors.com.br${href.startsWith('/') ? '' : '/'}${href}`;
        const cleanUrl = url.split('#')[0].split('?')[0];

        const entry = byId.get(id) || { url: cleanUrl };
        entry.url = cleanUrl;

        // Title from img alt/title
        if (!entry.title) {
          const img = card.querySelector('img[title], img[alt]') as HTMLImageElement | null;
          const t = img?.getAttribute('title') || img?.getAttribute('alt');
          if (t && t.trim().length > 3) entry.title = t.trim();
        }

        // Year from URL slug
        if (!entry.year) {
          const ym = href.match(/\/(\d{4}(?:-\d{4})?)\/\d{6,}/);
          if (ym) entry.year = ym[1];
        }

        const cardText = (card.textContent || '').replace(/\u00a0/g, ' ');

        // Price (skip filter chip text)
        const priceMatches = Array.from(cardText.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)/g));
        for (const pm of priceMatches) {
          const pIdx = pm.index ?? 0;
          const ctx = cardText.slice(Math.max(0, pIdx - 40), pIdx + pm[0].length + 40).toLowerCase();
          if (/máximo|mínimo|minimo|maximo/.test(ctx)) continue;
          entry.price = `R$ ${pm[1]}`;
          break;
        }

        // Mileage — no boundary/lookahead after Km: Webmotors often glues it to the city ("180.000 KmMogi...").
        const km = cardText.match(KM_PATTERN);
        if (km) entry.mileage = `${km[1]} Km`;

        // Location: "Cidade (UF)"
        const loc = cardText.match(/([A-ZÀ-Ú][A-Za-zÀ-ú'.\s-]{2,50}?)\s*\(([A-Z]{2})\)/);
        if (loc) entry.location = `${loc[1].trim()} (${loc[2]})`;

        byId.set(id, entry);
      };

      if (cardNodes.length > 0) {
        for (const c of cardNodes) handleCard(c);
      } else {
        // Fallback: no card class found — walk from each /comprar/ anchor up to a likely card root
        const anchors = Array.from(doc.querySelectorAll('a[href*="/comprar/"]')) as HTMLAnchorElement[];
        const seen = new Set<string>();
        for (const a of anchors) {
          const h = a.getAttribute('href') || '';
          const m = h.match(COMPRAR_LINK);
          if (!m) continue;
          if (seen.has(m[1])) continue;
          seen.add(m[1]);
          let node: HTMLElement | null = a;
          for (let i = 0; i < 15 && node; i++) {
            node = node.parentElement;
            if (!node) break;
            const txt = node.textContent || '';
            if (/R\$\s*\d/.test(txt) && /Km/i.test(txt) && txt.length < 4000) {
              handleCard(node);
              break;
            }
          }
        }
      }

      return Array.from(byId.values())
        .filter(e => e.url)
        .map(e => ({ url: e.url, title: e.title, price: e.price, year: e.year, mileage: e.mileage, location: e.location }));
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

    // Decode HTML entities and strip tags so KM/location captures aren't broken by markup
    const decoded = html.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    const stripped = decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

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

      // Mileage + location: search in stripped (tag-free) text around this id
      const sIdx = stripped.indexOf(`/${id}`);
      if (sIdx >= 0) {
        const sWin = stripped.slice(Math.max(0, sIdx - 1500), sIdx + 2500);
        const km = sWin.match(KM_PATTERN);
        if (km) listing.mileage = `${km[1]} Km`;
        const loc = sWin.match(/([A-ZÀ-Ú][A-Za-zÀ-ú'.\s-]{2,50}?)\s*\(([A-Z]{2})\)/);
        if (loc) listing.location = `${loc[1].trim()} (${loc[2]})`;
      }
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
