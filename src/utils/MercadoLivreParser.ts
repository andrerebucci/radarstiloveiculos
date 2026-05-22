export interface MercadoLivreListing {
  url: string;
  title?: string;
  price?: string;
  mileage?: string;
  location?: string;
}

export class MercadoLivreParser {
  static extractListings(html: string): MercadoLivreListing[] {
    console.log('=== MERCADOLIVRE PARSER DEBUG ===');
    console.log('HTML length:', html.length);
    
    try {
      // Strategy 1: DOM parsing
      const domResults = this.extractViaDom(html);
      if (domResults.length > 0) {
        console.log(`ML DOM: found ${domResults.length} listings`);
        return domResults;
      }

      // Strategy 2: Regex for MLB links with context
      const regexResults = this.extractViaRegex(html);
      if (regexResults.length > 0) {
        console.log(`ML Regex: found ${regexResults.length} listings`);
        return regexResults;
      }

      // Strategy 3: JSON-LD
      const jsonLdResults = this.extractFromJsonLd(html);
      if (jsonLdResults.length > 0) {
        console.log(`ML JSON-LD: found ${jsonLdResults.length} listings`);
        return jsonLdResults;
      }
    } catch (error) {
      console.error('Erro no MercadoLivreParser:', error);
    }
    
    console.log('MercadoLivre Parser: 0 anúncios encontrados');
    return [];
  }

  private static extractViaDom(html: string): MercadoLivreListing[] {
    const listings: MercadoLivreListing[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const seen = new Set<string>();

    // Try multiple selectors for result items
    const containerSelectors = [
      'li.ui-search-layout__item',
      'div.ui-search-result',
      'li[class*="ui-search"]',
      'div[class*="poly-card"]',
      'section[class*="poly-card"]',
      'div[class*="andes-card"]',
      'ol.ui-search-layout li',
    ];

    let items: Element[] = [];
    for (const selector of containerSelectors) {
      items = Array.from(doc.querySelectorAll(selector));
      if (items.length > 0) {
        console.log(`ML DOM: Found ${items.length} items with "${selector}"`);
        break;
      }
    }

    // If no container found, try finding all links with MLB
    if (items.length === 0) {
      console.log('ML DOM: No containers found, trying direct MLB links');
      const allLinks = Array.from(doc.querySelectorAll('a[href*="MLB"]')) as HTMLAnchorElement[];
      console.log(`ML DOM: Found ${allLinks.length} MLB links`);
      
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        if (this.isTrackingUrl(href)) continue;
        if (!href.includes('MLB')) continue;
        
        const url = this.normalizeUrl(href);
        if (seen.has(url)) continue;
        seen.add(url);

        const listing = this.extractListingFromContext(link, url);
        if (listing) listings.push(listing);
        if (listings.length >= 20) break;
      }
      return listings;
    }

    for (const item of items) {
      const links = Array.from(item.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      let bestLink = '';
      
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('MLB') && !this.isTrackingUrl(href)) {
          bestLink = href;
          break;
        }
      }
      
      if (!bestLink) continue;
      
      const url = this.normalizeUrl(bestLink);
      if (seen.has(url)) continue;
      seen.add(url);

      const listing: MercadoLivreListing = { url };
      const text = item.textContent || '';

      // Title
      const titleEl = item.querySelector('h2, h3, [class*="title"], a[title]');
      if (titleEl) {
        listing.title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
      }

      // Price - extract number from text
      const priceMatch = text.match(/(\d{1,3}(?:\.\d{3})+)/);
      if (priceMatch) {
        const num = parseInt(priceMatch[1].replace(/\./g, ''));
        if (num >= 5000 && num <= 500000) {
          listing.price = `R$ ${priceMatch[1]}`;
        }
      }

      // Mileage
      const mileageMatch = text.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
      if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;

      // Location: prefer dedicated ML element, else "Bairro - Cidade" pattern
      const locEl = item.querySelector('[class*="poly-component__location"], [class*="ui-search-item__location"], [class*="ui-search-item__group__element--location"]');
      const locText = locEl?.textContent?.trim();
      if (locText) {
        listing.location = locText;
      } else {
        const locationMatch =
          text.match(/([A-ZÀ-Ú][\wÀ-ú'.\s]{2,40})\s*[-–]\s*([A-ZÀ-Ú][\wÀ-ú'.\s]{2,60}?)(?=\s{2,}|R\$|\d{1,3}(?:\.\d{3})+|$)/) ||
          text.match(/([A-ZÀ-Ú][a-zà-ú]+(?: [a-zà-ú]+)*(?: [A-ZÀ-Ú][a-zà-ú]+)*)\s*[-–]\s*([A-Z]{2})/);
        if (locationMatch) listing.location = `${locationMatch[1].trim()} - ${locationMatch[2].trim()}`;
      }


      listings.push(listing);
      if (listings.length >= 20) break;
    }

    return listings;
  }

  private static extractListingFromContext(link: HTMLAnchorElement, url: string): MercadoLivreListing | null {
    const listing: MercadoLivreListing = { url };
    
    // Walk up to find a container
    let container: Element | null = link;
    for (let i = 0; i < 8 && container; i++) {
      container = container.parentElement;
      const text = container?.textContent || '';
      if (text.length > 50 && /\d{2,3}\.\d{3}/.test(text)) break;
    }

    const text = container?.textContent || link.textContent || '';

    // Title
    listing.title = link.getAttribute('title') || link.textContent?.trim() || undefined;
    if (listing.title && listing.title.length > 150) listing.title = listing.title.slice(0, 150);

    // Price
    const priceMatch = text.match(/(\d{1,3}(?:\.\d{3})+)/);
    if (priceMatch) {
      const num = parseInt(priceMatch[1].replace(/\./g, ''));
      if (num >= 5000 && num <= 500000) {
        listing.price = `R$ ${priceMatch[1]}`;
      }
    }

    // Mileage
    const mileageMatch = text.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
    if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;

    // Location via dedicated element
    const locEl = (container as Element | null)?.querySelector?.('[class*="poly-component__location"], [class*="ui-search-item__location"]');
    const locText = locEl?.textContent?.trim();
    if (locText) listing.location = locText;

    return (listing.price || listing.title) ? listing : null;
  }

  private static extractViaRegex(html: string): MercadoLivreListing[] {
    const listings: MercadoLivreListing[] = [];
    const seen = new Set<string>();
    
    // Find all MLB links
    const mlbPattern = /href="([^"]*MLB[- ]?\d+[^"]*)"/gi;
    let match;
    
    while ((match = mlbPattern.exec(html)) !== null && listings.length < 20) {
      const rawUrl = match[1];
      if (this.isTrackingUrl(rawUrl)) continue;
      
      const url = this.normalizeUrl(rawUrl);
      if (seen.has(url)) continue;
      seen.add(url);
      
      const idx = html.indexOf(match[0]);
      const context = html.slice(Math.max(0, idx - 3000), Math.min(html.length, idx + 3000));
      
      const listing: MercadoLivreListing = { url };
      
      // Title - look for title attribute or heading text near the link
      const titleMatch = context.match(/title="([^"]{5,150})"/) ||
                         context.match(/alt="([^"]{5,100})"/);
      if (titleMatch) listing.title = titleMatch[1].trim();
      
      // Price - find numbers that look like car prices (5k-500k range)
      const priceMatches = context.match(/(\d{1,3}(?:\.\d{3})+)/g) || [];
      for (const pm of priceMatches) {
        const num = parseInt(pm.replace(/\./g, ''));
        if (num >= 5000 && num <= 500000) {
          listing.price = `R$ ${pm}`;
          break;
        }
      }
      
      // Mileage
      const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
      if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;

      // Location: try to grab text from a location-classed element near the link
      const locMatch = context.match(/class="[^"]*poly-component__location[^"]*"[^>]*>([^<]{3,80})</)
        || context.match(/class="[^"]*ui-search-item__location[^"]*"[^>]*>([^<]{3,80})</);
      if (locMatch) listing.location = locMatch[1].trim();
      
      if (listing.price || listing.title) {
        listings.push(listing);
      }
    }
    
    return listings;
  }

  private static extractFromJsonLd(html: string): MercadoLivreListing[] {
    const listings: MercadoLivreListing[] = [];
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    
    while ((match = jsonLdPattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data['@type'] === 'ItemList' && data.itemListElement) {
          for (const item of data.itemListElement) {
            const listing: MercadoLivreListing = {
              url: item.url || item.item?.url || '',
              title: item.name || item.item?.name,
              price: item.offers?.price ? `R$ ${Number(item.offers.price).toLocaleString('pt-BR')}` : undefined,
            };
            if (listing.url) listings.push(listing);
          }
        }
      } catch { /* continue */ }
    }
    
    return listings;
  }

  private static isTrackingUrl(url: string): boolean {
    return url.includes('click1.') || 
           url.includes('/brand_ads/') || 
           url.includes('/clicks/') ||
           url.includes('mercadolibre.com/jm/') ||
           url.includes('/tracking/');
  }

  private static normalizeUrl(url: string): string {
    if (!url.startsWith('http')) {
      url = url.startsWith('/') ? `https://www.mercadolivre.com.br${url}` : url;
    }
    return url.split('#')[0].split('?')[0];
  }
}
