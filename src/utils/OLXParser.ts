export interface OLXListing {
  url: string;
  title?: string;
  price?: string;
  mileage?: string;
  location?: string;
}

export class OLXParser {
  static extractListings(html: string): OLXListing[] {
    const listings: OLXListing[] = [];
    
    try {
      console.log('=== OLX PARSER DEBUG ===');
      console.log('HTML length:', html.length);
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Strategy 1: Find ad links - OLX uses links to individual ad pages
      // Pattern: sp.olx.com.br/*/autos-e-pecas/carros-vans-e-utilitarios/*-XXXXXXXXXX
      // or olx.com.br/d/anuncio/*
      const allLinks = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      
      const adLinks = allLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        // OLX ad URLs have a numeric ID suffix like -1409292026
        return (
          (href.includes('/autos-e-pecas/carros-vans-e-utilitarios/') || href.includes('/d/anuncio/')) &&
          /\-\d{8,}$/.test(href.replace(/\/$/, ''))
        );
      });
      
      console.log(`Found ${adLinks.length} potential ad links`);
      
      const seen = new Set<string>();
      
      for (const link of adLinks) {
        let href = link.getAttribute('href') || '';
        if (!href) continue;
        
        // Normalize URL
        if (href.startsWith('/')) href = `https://www.olx.com.br${href}`;
        if (!href.startsWith('http')) href = `https://${href}`;
        
        // Deduplicate
        const normalized = href.replace(/\/$/, '');
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        
        const listing: OLXListing = { url: href };
        
        // Get title from the link text or title attribute
        const title = link.getAttribute('title') || link.textContent?.trim();
        if (title && title.length > 2 && title.length < 200) {
          listing.title = title;
        }
        
        // Find the parent card container to extract price, mileage, location
        const container = link.closest('section, li, article') || 
                         link.parentElement?.parentElement?.parentElement?.parentElement?.parentElement;
        
        if (container) {
          const containerText = container.textContent || '';
          
          // Extract price - look for R$ pattern
          const priceMatch = containerText.match(/R\$\s*[\d\.]+(?:,\d{2})?/g);
          if (priceMatch) {
            // Take the last price (sometimes there's a "de" price before the actual price)
            listing.price = priceMatch[priceMatch.length - 1];
          }
          
          // Extract mileage
          const mileageMatch = containerText.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
          if (mileageMatch) {
            listing.mileage = `${mileageMatch[1]} km`;
          }
          
          // Extract location - look for common patterns
          const locationElements = container.querySelectorAll('span, p, div');
          for (const el of Array.from(locationElements)) {
            const text = el.textContent?.trim() || '';
            // Location pattern: City, Neighborhood
            if (text.match(/^[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+)*,\s*[A-ZÀ-Ú]/) && text.length < 80) {
              listing.location = text;
              break;
            }
          }
        }
        
        listings.push(listing);
        console.log(`OLX listing: ${listing.title} - ${listing.price} - ${listing.mileage}`);
      }
      
      // Strategy 2: If DOM parsing found nothing, try regex on raw HTML
      if (listings.length === 0) {
        console.log('DOM parsing found nothing, trying regex...');
        
        // Look for ad URLs with regex
        const urlPattern = /href="((?:https?:\/\/)?(?:[\w.-]+\.)?olx\.com\.br\/[^"]*(?:autos-e-pecas|d\/anuncio)[^"]*\-\d{8,}[^"]*)"/gi;
        let match;
        
        while ((match = urlPattern.exec(html)) !== null && listings.length < 20) {
          let url = match[1];
          if (!url.startsWith('http')) url = `https://${url}`;
          
          const normalized = url.replace(/\/$/, '');
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          
          const listing: OLXListing = { url };
          
          // Get context around the URL for price/mileage
          const idx = html.indexOf(match[0]);
          const context = html.slice(Math.max(0, idx - 3000), Math.min(html.length, idx + 3000));
          
          const priceMatch = context.match(/R\$\s*[\d\.]+(?:,\d{2})?/);
          if (priceMatch) listing.price = priceMatch[0];
          
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
          if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
          
          const titleMatch = context.match(/title="([^"]{3,100})"/);
          if (titleMatch) listing.title = titleMatch[1];
          
          listings.push(listing);
        }
      }
      
    } catch (error) {
      console.error('Erro no OLXParser:', error);
    }
    
    console.log(`OLX Parser FINAL: ${listings.length} anúncios encontrados`);
    return listings;
  }
}
