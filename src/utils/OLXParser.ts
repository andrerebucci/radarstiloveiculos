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
      // OLX usa data-testid="ad-card" para cards de anúncios
      const adCardPattern = /data-testid="ad-card"[^>]*>(.*?)<\/div>\s*<\/div>\s*<\/div>/gs;
      const matches = html.match(adCardPattern) || [];
      
      console.log(`OLX: Encontrados ${matches.length} cards de anúncios`);
      
      for (const match of matches) {
        const listing: OLXListing = { url: '' };
        
        // Extrair URL do anúncio
        const urlMatch = match.match(/href="([^"]*\/autos-e-pecas\/carros-vans-e-utilitarios\/[^"]+)"/);
        if (urlMatch) {
          listing.url = urlMatch[1].startsWith('http') ? urlMatch[1] : `https://www.olx.com.br${urlMatch[1]}`;
        }
        
        // Extrair preço
        const priceMatch = match.match(/R\$\s?[\d\.,]+/);
        if (priceMatch) {
          listing.price = priceMatch[0];
        }
        
        // Extrair título
        const titleMatch = match.match(/title="([^"]*Honda[^"]*Fit[^"]*)"/i) || 
                          match.match(/>([^<]*Honda[^<]*Fit[^<]*)</i);
        if (titleMatch) {
          listing.title = titleMatch[1].trim();
        }
        
        // Extrair quilometragem
        const mileageMatch = match.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
        if (mileageMatch) {
          listing.mileage = `${mileageMatch[1]} km`;
        }
        
        // Extrair localização
        const locationMatch = match.match(/São Paulo[^<>]*(?:SP|Brasil)/i);
        if (locationMatch) {
          listing.location = locationMatch[0];
        }
        
        if (listing.url && listing.url.includes('honda') && listing.url.includes('fit')) {
          listings.push(listing);
        }
      }
      
      // Fallback: buscar por padrões de URL da OLX
      if (listings.length === 0) {
        const urlPattern = /href="([^"]*\/autos-e-pecas\/carros-vans-e-utilitarios\/honda\/fit[^"]*)"/gi;
        let urlMatch;
        
        while ((urlMatch = urlPattern.exec(html)) !== null && listings.length < 10) {
          const url = urlMatch[1].startsWith('http') ? urlMatch[1] : `https://www.olx.com.br${urlMatch[1]}`;
          
          // Buscar contexto ao redor da URL
          const urlIndex = html.indexOf(urlMatch[0]);
          const context = html.slice(Math.max(0, urlIndex - 1000), Math.min(html.length, urlIndex + 1000));
          
          const listing: OLXListing = { url };
          
          // Extrair dados do contexto
          const priceMatch = context.match(/R\$\s?[\d\.,]+/);
          if (priceMatch) listing.price = priceMatch[0];
          
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
          if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
          
          const titleMatch = context.match(/Honda[^<>]*Fit[^<>]*/i);
          if (titleMatch) listing.title = titleMatch[0].trim();
          
          listings.push(listing);
        }
      }
      
    } catch (error) {
      console.error('Erro no OLXParser:', error);
    }
    
    console.log(`OLX Parser encontrou ${listings.length} anúncios:`, listings);
    return listings;
  }
}