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
          
          // Extrair URL - filtrar anúncios patrocinados
          const urlMatch = match.match(/href="([^"]*\/MLBv?[^"]+)"/);
          if (urlMatch) {
            listing.url = urlMatch[1];
            if (!listing.url.startsWith('http')) {
              listing.url = `https://www.mercadolivre.com.br${listing.url}`;
            }
            
            // Filtrar URLs de anúncios patrocinados/clicks
            if (listing.url.includes('click1.mercadolivre.com.br') || 
                listing.url.includes('/brand_ads/') ||
                listing.url.includes('/clicks/')) {
              continue; // Pular este anúncio
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
      
      // Fallback: buscar por padrões mais específicos no HTML
      if (listings.length < 5) {
        console.log('MercadoLivre: Tentando fallback para encontrar mais anúncios...');
        
        // Buscar por links MLB diretos
        const mlbPattern = /href="([^"]*MLB-?\d+[^"]*)"/gi;
        let mlbMatch;
        
        while ((mlbMatch = mlbPattern.exec(html)) !== null && listings.length < 10) {
          const url = mlbMatch[1];
          
          // Filtrar URLs inválidas
          if (url.includes('click1.') || url.includes('/brand_ads/') || url.includes('/clicks/')) {
            continue;
          }
          
          const fullUrl = url.startsWith('http') ? url : `https://www.mercadolivre.com.br${url}`;
          
          // Verificar se já temos essa URL
          if (listings.some(l => l.url === fullUrl)) {
            continue;
          }
          
          // Buscar contexto amplo
          const urlIndex = html.indexOf(mlbMatch[0]);
          const context = html.slice(Math.max(0, urlIndex - 2000), Math.min(html.length, urlIndex + 2000));
          
          // Verificar se é Honda Fit no contexto
          if (!/honda.*fit|fit.*honda/i.test(context)) {
            continue;
          }
          
          const listing: MercadoLivreListing = { url: fullUrl };
          
          // Extrair preço com mais padrões
          const priceMatch = context.match(/R\$\s?[\d\.,]+/) ||
                            context.match(/(\d{2,3}\.?\d{3})\s*reais?/i);
          if (priceMatch) {
            listing.price = priceMatch[0];
          }
          
          // Extrair quilometragem
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
          if (mileageMatch) {
            listing.mileage = `${mileageMatch[1]} km`;
          }
          
          // Extrair título mais específico
          const titleMatch = context.match(/Honda[^<>]*Fit[^<>]*(?:Lx|Lxl)?[^<>]*/i) ||
                            context.match(/Fit[^<>]*Honda[^<>]*/i);
          if (titleMatch) {
            listing.title = titleMatch[0].trim();
          }
          
          // Só adicionar se tiver pelo menos preço
          if (listing.price) {
            listings.push(listing);
            console.log('MercadoLivre: Anúncio adicional encontrado:', listing);
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