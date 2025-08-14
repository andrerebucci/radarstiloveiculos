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
      // Mercado Livre usa diferentes padrões de cards
      const patterns = [
        // Padrão principal de cards de produto
        /class="[^"]*ui-search-result[^"]*"[^>]*>(.*?)<\/div>\s*<\/li>/gs,
        // Padrão alternativo
        /data-testid="[^"]*result[^"]*"[^>]*>(.*?)<\/div>/gs,
      ];
      
      for (const pattern of patterns) {
        const matches = html.match(pattern) || [];
        console.log(`MercadoLivre: Testando padrão, encontrados ${matches.length} matches`);
        
        for (const match of matches) {
          const listing: MercadoLivreListing = { url: '' };
          
          // Extrair URL
          const urlMatch = match.match(/href="([^"]*\/MLBv?[^"]+)"/) ||
                          match.match(/href="([^"]*honda[^"]*fit[^"]*)"/i);
          if (urlMatch) {
            listing.url = urlMatch[1];
            if (!listing.url.startsWith('http')) {
              listing.url = `https://www.mercadolivre.com.br${listing.url}`;
            }
          }
          
          // Extrair preço
          const priceMatch = match.match(/R\$\s?[\d\.,]+/) ||
                            match.match(/[\d\.,]+\s*reais?/i);
          if (priceMatch) {
            listing.price = priceMatch[0];
          }
          
          // Extrair título
          const titleMatch = match.match(/title="([^"]*Honda[^"]*Fit[^"]*)"/i) ||
                            match.match(/>([^<]*Honda[^<]*Fit[^<]*)</i) ||
                            match.match(/alt="([^"]*Honda[^"]*Fit[^"]*)"/i);
          if (titleMatch) {
            listing.title = titleMatch[1].trim();
          }
          
          // Extrair quilometragem
          const mileageMatch = match.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
          if (mileageMatch) {
            listing.mileage = `${mileageMatch[1]} km`;
          }
          
          // Verificar se é um anúncio de Honda Fit
          const isHondaFit = (listing.title && /honda.*fit/i.test(listing.title)) ||
                           (listing.url && /honda.*fit/i.test(listing.url)) ||
                           /honda.*fit/i.test(match);
          
          if (listing.url && isHondaFit) {
            listings.push(listing);
          }
        }
        
        if (listings.length > 0) break; // Se encontrou com este padrão, parar
      }
      
      // Fallback: buscar URLs diretamente
      if (listings.length === 0) {
        const urlPattern = /href="([^"]*(?:honda|fit)[^"]*)"/gi;
        let urlMatch;
        
        while ((urlMatch = urlPattern.exec(html)) !== null && listings.length < 10) {
          const url = urlMatch[1];
          
          if (/honda.*fit|fit.*honda/i.test(url) || /MLB\d+/i.test(url)) {
            const fullUrl = url.startsWith('http') ? url : `https://www.mercadolivre.com.br${url}`;
            
            // Buscar contexto
            const urlIndex = html.indexOf(urlMatch[0]);
            const context = html.slice(Math.max(0, urlIndex - 1000), Math.min(html.length, urlIndex + 1000));
            
            const listing: MercadoLivreListing = { url: fullUrl };
            
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
      }
      
    } catch (error) {
      console.error('Erro no MercadoLivreParser:', error);
    }
    
    console.log(`MercadoLivre Parser encontrou ${listings.length} anúncios:`, listings);
    return listings;
  }
}