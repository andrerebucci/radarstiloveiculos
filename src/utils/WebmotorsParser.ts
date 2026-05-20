export interface WebmotorsListing {
  url: string;
  title?: string;
  price?: string;
  year?: string;
  mileage?: string;
  location?: string;
}

export class WebmotorsParser {
  static extractListings(html: string): WebmotorsListing[] {
    console.log('=== WEBMOTORS PARSER ===');
    console.log('HTML length:', html.length);

    // Strategy 1: __NEXT_DATA__ -> props.pageProps.catalogProps.items (canonical)
    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1]);
        const items = data?.props?.pageProps?.catalogProps?.items;
        if (Array.isArray(items) && items.length > 0) {
          const listings = items
            .map((it: any) => this.fromCatalogItem(it))
            .filter((l): l is WebmotorsListing => !!l);
          if (listings.length > 0) {
            console.log(`Webmotors catalogProps: ${listings.length} anúncios`);
            return listings;
          }
        }

        // Fallback: deep-scan __NEXT_DATA__ for any array of items with offers.price + offers.url
        const deep = this.deepFindOfferItems(data);
        if (deep.length > 0) {
          console.log(`Webmotors deep-scan: ${deep.length} anúncios`);
          return deep;
        }
      } catch (e) {
        console.log('Failed to parse __NEXT_DATA__:', e);
      }
    }

    // Strategy 2: JSON-LD ItemList
    const listings: WebmotorsListing[] = [];
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = jsonLdPattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(m[1]);
        const list = data?.itemListElement;
        if (Array.isArray(list)) {
          for (const node of list) {
            const item = node?.item ?? node;
            const l = this.fromCatalogItem(item);
            if (l) listings.push(l);
          }
        }
      } catch { /* continue */ }
    }
    if (listings.length > 0) {
      console.log(`Webmotors JSON-LD: ${listings.length} anúncios`);
      return listings;
    }

    console.log('Webmotors: 0 anúncios encontrados');
    return [];
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
      if (!Number.isNaN(num) && num > 0) {
        listing.price = `R$ ${num.toLocaleString('pt-BR')}`;
      } else {
        listing.price = `R$ ${rawPrice}`;
      }
    }
    // Year often embedded in URL: /.../2009/<id> or /.../2008-2009/<id>
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
        // Detect arrays of catalog items
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
