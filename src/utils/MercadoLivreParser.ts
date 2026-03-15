export interface MercadoLivreListing {
  url: string;
  title?: string;
  price?: string;
  mileage?: string;
  location?: string;
}

export class MercadoLivreParser {
  static extractListings(html: string): MercadoLivreListing[] {
    const listings: MercadoLivreListing[] = [];
    
    try {
      // Strategy 1: Extract from __PRELOADED_STATE__ or similar JSON
      const jsonDataResults = this.extractFromEmbeddedJson(html);
      if (jsonDataResults.length > 0) {
        console.log(`MercadoLivre: JSON extraction found ${jsonDataResults.length} listings`);
        return jsonDataResults;
      }

      // Strategy 2: DOM parsing for search result cards
      const domResults = this.extractViaDom(html);
      if (domResults.length > 0) {
        console.log(`MercadoLivre: DOM extraction found ${domResults.length} listings`);
        return domResults;
      }

      // Strategy 3: Regex-based extraction
      const regexResults = this.extractViaRegex(html);
      if (regexResults.length > 0) {
        console.log(`MercadoLivre: Regex extraction found ${regexResults.length} listings`);
        return regexResults;
      }
      
    } catch (error) {
      console.error('Erro no MercadoLivreParser:', error);
    }
    
    console.log(`MercadoLivre Parser encontrou ${listings.length} anúncios`);
    return listings;
  }

  private static extractFromEmbeddedJson(html: string): MercadoLivreListing[] {
    const listings: MercadoLivreListing[] = [];
    
    // Look for JSON-LD structured data
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        if (data['@type'] === 'ItemList' && data.itemListElement) {
          for (const item of data.itemListElement) {
            const listing: MercadoLivreListing = {
              url: item.url || '',
              title: item.name || item.item?.name,
              price: item.offers?.price ? `R$ ${Number(item.offers.price).toLocaleString('pt-BR')}` : undefined,
            };
            if (listing.url) listings.push(listing);
          }
        } else if (data['@type'] === 'Car' || data['@type'] === 'Vehicle') {
          listings.push({
            url: data.url || '',
            title: data.name,
            price: data.offers?.price ? `R$ ${Number(data.offers.price).toLocaleString('pt-BR')}` : undefined,
          });
        }
      } catch { /* continue */ }
    }
    
    if (listings.length > 0) return listings;

    // Look for __PRELOADED_STATE__
    const statePatterns = [
      /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/i,
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/i,
    ];

    for (const pattern of statePatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const state = JSON.parse(match[1]);
          const found = this.searchJsonForListings(state);
          if (found.length > 0) return found;
        } catch { /* continue */ }
      }
    }

    return [];
  }

  private static searchJsonForListings(obj: any, depth = 0): MercadoLivreListing[] {
    if (depth > 8 || !obj || typeof obj !== 'object') return [];
    
    if (Array.isArray(obj) && obj.length > 0) {
      // Check if items look like listings
      const first = obj[0];
      if (first && (first.id || first.permalink || first.title) && 
          (first.price || first.prices || first.currency_id)) {
        return obj.map(item => ({
          url: item.permalink || item.url || '',
          title: item.title,
          price: item.price ? `R$ ${Number(item.price).toLocaleString('pt-BR')}` : 
                 item.prices?.prices?.[0]?.amount ? `R$ ${Number(item.prices.prices[0].amount).toLocaleString('pt-BR')}` : undefined,
          mileage: item.attributes?.find?.((a: any) => a.id === 'KILOMETERS')?.value_name,
          location: item.seller_address?.city?.name || item.location?.city,
        })).filter((l: MercadoLivreListing) => l.url);
      }
    }

    const results: MercadoLivreListing[] = [];
    const keys = Array.isArray(obj) ? obj : Object.values(obj);
    for (const val of keys) {
      const found = this.searchJsonForListings(val, depth + 1);
      if (found.length > 0) return found;
    }
    return results;
  }

  private static extractViaDom(html: string): MercadoLivreListing[] {
    const listings: MercadoLivreListing[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const seen = new Set<string>();

    // MercadoLivre uses various selectors for result items
    const selectors = [
      'li.ui-search-layout__item',
      'div.ui-search-result',
      '[data-testid="result-item"]',
      'li[class*="results"]',
      'div[class*="poly-card"]',
      'section.poly-card',
    ];

    let items: Element[] = [];
    for (const selector of selectors) {
      items = Array.from(doc.querySelectorAll(selector));
      if (items.length > 0) {
        console.log(`MercadoLivre DOM: Found ${items.length} items with selector "${selector}"`);
        break;
      }
    }

    for (const item of items) {
      const link = item.querySelector('a[href*="MLB"], a[href*="mlb"], a[href*="mercadolivre"]') as HTMLAnchorElement;
      if (!link) continue;

      const href = link.getAttribute('href') || '';
      if (!href || href.includes('click1.') || href.includes('/clicks/')) continue;
      
      const url = href.startsWith('http') ? href : `https://www.mercadolivre.com.br${href}`;
      const normalizedUrl = url.split('?')[0].split('#')[0];
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);

      const listing: MercadoLivreListing = { url: normalizedUrl };
      
      // Title
      const titleEl = item.querySelector('h2, [class*="title"], a[title]');
      if (titleEl) {
        listing.title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
      }

      // Price - look for price containers
      const text = item.textContent || '';
      const priceMatch = text.match(/R\$\s*([\d\.]+)/);
      if (priceMatch) {
        listing.price = `R$ ${priceMatch[1]}`;
      }

      // Also check for fraction
      const priceContainer = item.querySelector('[class*="price"], [class*="Price"]');
      if (priceContainer) {
        const pText = priceContainer.textContent || '';
        const pMatch = pText.match(/(\d{1,3}(?:\.\d{3})*)/);
        if (pMatch) listing.price = `R$ ${pMatch[1]}`;
      }

      // Mileage
      const mileageMatch = text.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
      if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;

      // Location
      const locationMatch = text.match(/([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)*)\s*-\s*([A-Z]{2})/);
      if (locationMatch) listing.location = `${locationMatch[1]} - ${locationMatch[2]}`;

      listings.push(listing);
      if (listings.length >= 20) break;
    }

    return listings;
  }

  private static extractViaRegex(html: string): MercadoLivreListing[] {
    const listings: MercadoLivreListing[] = [];
    const seen = new Set<string>();
    
    // Find MLB links
    const mlbPattern = /href="([^"]*MLB[- ]?\d+[^"]*)"/gi;
    let match;
    
    while ((match = mlbPattern.exec(html)) !== null && listings.length < 20) {
      const rawUrl = match[1];
      
      // Skip tracking/click URLs
      if (rawUrl.includes('click1.') || rawUrl.includes('/brand_ads/') || rawUrl.includes('/clicks/')) continue;
      
      const url = rawUrl.startsWith('http') ? rawUrl : `https://www.mercadolivre.com.br${rawUrl}`;
      const normalizedUrl = url.split('?')[0].split('#')[0];
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      
      const idx = html.indexOf(match[0]);
      const context = html.slice(Math.max(0, idx - 2000), Math.min(html.length, idx + 2000));
      
      const listing: MercadoLivreListing = { url: normalizedUrl };
      
      // Title
      const titleMatch = context.match(/title="([^"]{5,150})"/) ||
                         context.match(/alt="([^"]{5,150})"/);
      if (titleMatch) listing.title = titleMatch[1].trim();
      
      // Price
      const priceMatch = context.match(/R\$\s*([\d\.]+(?:,\d{2})?)/);
      if (priceMatch) listing.price = `R$ ${priceMatch[1]}`;
      
      // Alternatively look for separated price components (integer + cents)
      if (!listing.price) {
        const intMatch = context.match(/"price[_-]?amount"[^>]*>(\d{1,3}(?:\.\d{3})*)/i);
        if (intMatch) listing.price = `R$ ${intMatch[1]}`;
      }
      
      // Mileage
      const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
      if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
      
      // Location  
      const locationMatch = context.match(/([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)*)\s*-\s*([A-Z]{2})/);
      if (locationMatch) listing.location = `${locationMatch[1]} - ${locationMatch[2]}`;
      
      if (listing.price || listing.title) {
        listings.push(listing);
      }
    }
    
    return listings;
  }
}
