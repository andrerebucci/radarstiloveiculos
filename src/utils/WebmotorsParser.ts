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
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Strategy 1: Find links to /comprar/ pages with numeric IDs
      // Pattern: webmotors.com.br/comprar/marca/modelo/.../XXXXXXXX
      const allLinks = Array.from(doc.querySelectorAll('a[href*="/comprar/"]')) as HTMLAnchorElement[];
      
      console.log(`Found ${allLinks.length} /comprar/ links`);
      
      // Filter to only actual vehicle pages (have a numeric ID at the end)
      const vehicleLinks = allLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        return /\/\d{7,}$/.test(href.replace(/[?#].*$/, ''));
      });
      
      console.log(`Found ${vehicleLinks.length} vehicle links`);
      
      const seen = new Set<string>();
      
      for (const link of vehicleLinks) {
        let href = link.getAttribute('href') || '';
        if (!href) continue;
        
        if (href.startsWith('/')) href = `https://www.webmotors.com.br${href}`;
        
        // Normalize - remove query params for dedup
        const normalized = href.replace(/[?#].*$/, '');
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        
        const listing: WebmotorsListing = { url: href.replace(/[?#].*$/, '') };
        
        // Get title from alt text of images or link text
        const title = link.getAttribute('title') || link.textContent?.trim();
        if (title && title.length > 2 && title.length < 200) {
          listing.title = title;
        }
        
        // Find parent container for price, mileage, year, location
        // Walk up the DOM tree to find a container with multiple data points
        let container: Element | null = link;
        for (let i = 0; i < 10 && container; i++) {
          container = container.parentElement;
          const text = container?.textContent || '';
          // A good container has price AND mileage info
          if (text.includes('R$') && /\d+.*km/i.test(text)) break;
        }
        
        if (container) {
          const containerText = container.textContent || '';
          
          // Extract price
          const priceMatches = containerText.match(/R\$\s*[\d\.]+(?:,\d{2})?/g);
          if (priceMatches) {
            // Webmotors shows price once per card usually
            listing.price = priceMatches[0];
          }
          
          // Extract mileage - pattern: "206.000 Km"
          const mileageMatch = containerText.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
          if (mileageMatch) {
            listing.mileage = `${mileageMatch[1]} km`;
          }
          
          // Extract year - pattern: "2009/2009" or "2008/2009"
          const yearMatch = containerText.match(/(\d{4}\/\d{4})/);
          if (yearMatch) {
            listing.year = yearMatch[1];
          }
          
          // Extract location - pattern: "City (ST)"
          const locationMatch = containerText.match(/([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)*)\s*\([A-Z]{2}\)/);
          if (locationMatch) {
            listing.location = locationMatch[0];
          }
        }
        
        // If no title from link, try to extract from image alt
        if (!listing.title) {
          const img = link.querySelector('img');
          if (img) {
            const alt = img.getAttribute('alt');
            if (alt && alt.length > 2) listing.title = alt;
          }
        }
        
        listings.push(listing);
        console.log(`WM listing: ${listing.title} - ${listing.price} - ${listing.mileage} - ${listing.url}`);
      }
      
      // Strategy 2: Regex fallback for raw HTML
      if (listings.length === 0) {
        console.log('DOM parsing found nothing, trying regex...');
        
        const urlPattern = /href="([^"]*webmotors\.com\.br\/comprar\/[^"]*\/\d{7,})[^"]*"/gi;
        let match;
        
        while ((match = urlPattern.exec(html)) !== null && listings.length < 20) {
          let url = match[1];
          if (url.startsWith('/')) url = `https://www.webmotors.com.br${url}`;
          
          const normalized = url.replace(/[?#].*$/, '');
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          
          const listing: WebmotorsListing = { url: normalized };
          
          const idx = html.indexOf(match[0]);
          const context = html.slice(Math.max(0, idx - 3000), Math.min(html.length, idx + 3000));
          
          const priceMatch = context.match(/R\$\s*[\d\.]+(?:,\d{2})?/);
          if (priceMatch) listing.price = priceMatch[0];
          
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
          if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
          
          const yearMatch = context.match(/(\d{4}\/\d{4})/);
          if (yearMatch) listing.year = yearMatch[1];
          
          const titleMatch = context.match(/alt="([^"]{3,100})"/);
          if (titleMatch) listing.title = titleMatch[1];
          
          listings.push(listing);
        }
      }
      
    } catch (error) {
      console.error('Erro no WebmotorsParser:', error);
    }
    
    console.log(`Webmotors Parser FINAL: ${listings.length} anúncios encontrados`);
    return listings;
  }

  static debugExtraction(html: string): void {
    console.log('=== DEBUG WEBMOTORS ===');
    console.log('HTML size:', html.length);
    
    const comprarCount = (html.match(/\/comprar\//g) || []).length;
    console.log('/comprar/ occurrences:', comprarCount);
    
    const priceCount = (html.match(/R\$/g) || []).length;
    console.log('R$ occurrences:', priceCount);
    
    const kmCount = (html.match(/\d+\.\d+ [Kk]m/g) || []).length;
    console.log('Km patterns:', kmCount);
  }
}
