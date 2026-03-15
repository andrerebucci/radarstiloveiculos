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
    const listings: WebmotorsListing[] = [];
    
    console.log('=== WEBMOTORS PARSER DEBUG ===');
    console.log('HTML length:', html.length);
    
    try {
      // Strategy 1: __NEXT_DATA__ JSON (Next.js SSR)
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        console.log('Found __NEXT_DATA__');
        try {
          const data = JSON.parse(nextDataMatch[1]);
          const extracted = this.extractFromNextData(data);
          if (extracted.length > 0) return extracted;
        } catch (e) {
          console.log('Failed to parse __NEXT_DATA__');
        }
      }

      // Strategy 2: JSON-LD structured data
      const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
      let jsonLdMatch;
      while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
        try {
          const data = JSON.parse(jsonLdMatch[1]);
          if (data['@type'] === 'ItemList' && data.itemListElement) {
            for (const item of data.itemListElement) {
              listings.push({
                url: item.url || '',
                title: item.name,
                price: item.offers?.price ? `R$ ${Number(item.offers.price).toLocaleString('pt-BR')}` : undefined,
              });
            }
            if (listings.length > 0) return listings;
          }
        } catch { /* continue */ }
      }

      // Strategy 3: Find vehicle data in any script tag
      const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      let scriptMatch;
      while ((scriptMatch = scriptPattern.exec(html)) !== null) {
        const content = scriptMatch[1];
        if (content.length < 200 || content.length > 2000000) continue;
        
        // Look for serialized vehicle arrays
        const vehicleArrayPatterns = [
          /"SearchResults"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
          /"searchResults"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
          /"results"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
          /"vehicles"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
        ];
        
        for (const pattern of vehicleArrayPatterns) {
          const match = content.match(pattern);
          if (match) {
            try {
              const arr = JSON.parse(match[1]);
              if (Array.isArray(arr) && arr.length > 0) {
                const extracted = arr.map(item => this.vehicleObjToListing(item)).filter(Boolean) as WebmotorsListing[];
                if (extracted.length > 0) return extracted;
              }
            } catch { /* continue */ }
          }
        }
      }

      // Strategy 4: DOM-based extraction (for when HTML has actual content)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Find links to vehicle pages
      const vehicleLinks = Array.from(doc.querySelectorAll('a[href*="/comprar/"]')) as HTMLAnchorElement[];
      console.log(`Found ${vehicleLinks.length} /comprar/ links`);
      
      const seen = new Set<string>();
      for (const link of vehicleLinks) {
        let href = link.getAttribute('href') || '';
        if (!href || !/\d{6,}/.test(href)) continue;
        
        if (href.startsWith('/')) href = `https://www.webmotors.com.br${href}`;
        const normalized = href.replace(/[?#].*$/, '');
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        
        const listing: WebmotorsListing = { url: normalized };
        
        // Get context from parent
        let container: Element | null = link;
        for (let i = 0; i < 8 && container; i++) {
          container = container.parentElement;
          const text = container?.textContent || '';
          if (text.includes('R$') && /\d+.*[Kk]m/.test(text)) break;
        }
        
        if (container) {
          const text = container.textContent || '';
          const priceMatch = text.match(/R\$\s*([\d\.]+(?:,\d{2})?)/);
          if (priceMatch) listing.price = `R$ ${priceMatch[1]}`;
          
          const kmMatch = text.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
          if (kmMatch) listing.mileage = `${kmMatch[1]} km`;
          
          const yearMatch = text.match(/(\d{4}\/\d{4})/);
          if (yearMatch) listing.year = yearMatch[1];
          
          const locMatch = text.match(/([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)*)\s*\(([A-Z]{2})\)/);
          if (locMatch) listing.location = `${locMatch[1]} (${locMatch[2]})`;
        }
        
        listing.title = link.getAttribute('title') || link.textContent?.trim() || undefined;
        listings.push(listing);
      }
      
      // Strategy 5: Pure price-based extraction as last resort
      if (listings.length === 0) {
        console.log('Trying price-based extraction...');
        const pricePattern = /R\$\s*([\d\.]+)(?:,(\d{2}))?/g;
        let pm;
        
        while ((pm = pricePattern.exec(html)) !== null && listings.length < 20) {
          const numStr = pm[1].replace(/\./g, '');
          const value = parseInt(numStr);
          if (value < 5000 || value > 500000) continue;
          
          const idx = pm.index;
          const context = html.slice(Math.max(0, idx - 2000), Math.min(html.length, idx + 2000));
          
          // Must have vehicle indicators nearby
          if (!/honda|fit|carro|veículo|km/i.test(context)) continue;
          
          const listing: WebmotorsListing = { url: '', price: pm[0] };
          
          const kmMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
          if (kmMatch) listing.mileage = `${kmMatch[1]} km`;
          
          const yearMatch = context.match(/(\d{4}\/\d{4})/);
          if (yearMatch) listing.year = yearMatch[1];
          
          const titleMatch = context.match(/Honda[^<>"]{0,60}Fit[^<>"]{0,60}/i);
          if (titleMatch) listing.title = titleMatch[0].trim();
          
          const urlMatch = context.match(/href="([^"]*(?:webmotors|\/comprar\/)[^"]*\d{6,}[^"]*)"/i);
          if (urlMatch) {
            let u = urlMatch[1];
            if (u.startsWith('/')) u = `https://www.webmotors.com.br${u}`;
            listing.url = u.replace(/[?#].*$/, '');
          }
          
          // Deduplicate by price (rough)
          if (!listings.some(l => l.price === listing.price && l.url === listing.url)) {
            listings.push(listing);
          }
        }
      }

    } catch (error) {
      console.error('Erro no WebmotorsParser:', error);
    }
    
    console.log(`Webmotors Parser FINAL: ${listings.length} anúncios encontrados`);
    return listings;
  }

  private static extractFromNextData(data: any): WebmotorsListing[] {
    const listings: WebmotorsListing[] = [];
    
    const search = (obj: any, depth = 0): void => {
      if (depth > 10 || listings.length >= 20 || !obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        if (obj.length > 0 && obj[0] && (
          obj[0].UniqueId || obj[0].uniqueId || obj[0].Id ||
          obj[0].Make || obj[0].Specification
        )) {
          for (const item of obj) {
            const listing = this.vehicleObjToListing(item);
            if (listing) listings.push(listing);
          }
          return;
        }
        for (const item of obj) search(item, depth + 1);
      } else {
        for (const key of Object.keys(obj)) search(obj[key], depth + 1);
      }
    };
    
    search(data);
    return listings;
  }

  private static vehicleObjToListing(item: any): WebmotorsListing | null {
    if (!item || typeof item !== 'object') return null;
    
    const id = item.UniqueId || item.uniqueId || item.Id || item.id || '';
    const make = item.Make?.Value || item.make || '';
    const model = item.Model?.Value || item.model || '';
    const yearFab = item.Specification?.YearFabrication || item.yearFab || '';
    const yearModel = item.Specification?.YearModel || item.yearModel || '';
    const price = item.Prices?.Price || item.Price || item.price || '';
    const km = item.Specification?.Odometer || item.odometer || item.km || '';
    const city = item.Seller?.City || item.city || '';
    const state = item.Seller?.State || item.state || '';
    const title = item.Specification?.Title || item.title || `${make} ${model}`.trim();
    
    const url = id 
      ? `https://www.webmotors.com.br/comprar/${String(make).toLowerCase()}/${String(model).toLowerCase()}/${id}`
      : '';

    if (!url && !title) return null;

    const listing: WebmotorsListing = { url };
    if (title) listing.title = String(title).trim();
    if (price) listing.price = typeof price === 'number' ? `R$ ${price.toLocaleString('pt-BR')}` : `R$ ${price}`;
    if (km) listing.mileage = typeof km === 'number' ? `${km.toLocaleString('pt-BR')} km` : `${km} km`;
    if (yearFab && yearModel) listing.year = `${yearFab}/${yearModel}`;
    if (city) listing.location = state ? `${city} (${state})` : String(city);
    
    return listing;
  }

  static debugExtraction(html: string): void {
    console.log('=== DEBUG WEBMOTORS ===');
    console.log('HTML size:', html.length);
    console.log('/comprar/ count:', (html.match(/\/comprar\//g) || []).length);
    console.log('R$ count:', (html.match(/R\$/g) || []).length);
    console.log('__NEXT_DATA__:', html.includes('__NEXT_DATA__'));
    console.log('Script tags:', (html.match(/<script/g) || []).length);
  }
}
