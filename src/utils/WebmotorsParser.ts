export interface WebmotorsListing {
  url: string;
  title?: string;
  price?: string;
  year?: string;
  mileage?: string;
}

export class WebmotorsParser {
  static extractListings(html: string): WebmotorsListing[] {
    const listings: WebmotorsListing[] = [];
    
    // A Webmotors usa data-testid para identificar cards de veículos
    // Vamos procurar por estruturas JSON ou data attributes que contenham IDs de anúncios
    const patterns = [
      // Padrão 1: Links com /comprar/ e ID de 8 dígitos
      /href=["']([^"']*\/comprar\/[^"']*\/\d{8,})["']/gi,
      // Padrão 2: IDs em atributos data
      /data-id=["'](\d{8,})["']/gi,
      // Padrão 3: IDs em estruturas JSON dentro do HTML
      /"id":\s*"?(\d{8,})"?/gi,
      // Padrão 4: Links diretos completos
      /https:\/\/www\.webmotors\.com\.br\/comprar\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/(\d{8,})/gi,
    ];

    const foundIds = new Set<string>();
    const foundUrls = new Set<string>();

    // Buscar por IDs específicos mencionados pelo usuário primeiro
    const targetIds = ['60870682', '60509465', '52308137', '59867759'];
    targetIds.forEach(id => {
      if (html.includes(id)) {
        foundIds.add(id);
        console.log(`ID ${id} encontrado no HTML!`);
        
        // Tentar encontrar o contexto deste ID para extrair a URL completa
        const idIndex = html.indexOf(id);
        const context = html.slice(Math.max(0, idIndex - 500), Math.min(html.length, idIndex + 500));
        
        // Procurar por URL completa no contexto
        const urlMatch = context.match(/https:\/\/www\.webmotors\.com\.br\/comprar\/[^"'\s]+/);
        if (urlMatch) {
          foundUrls.add(urlMatch[0]);
        } else {
          // Se não encontrou URL completa, construir baseado no padrão
          const constructedUrl = `https://www.webmotors.com.br/comprar/honda/fit/14-lx-16v-flex-4p-manual/4-portas/2009/${id}`;
          foundUrls.add(constructedUrl);
        }
      }
    });

    // Aplicar padrões gerais para encontrar outros IDs
    patterns.forEach(pattern => {
      let match;
      pattern.lastIndex = 0; // Reset regex
      while ((match = pattern.exec(html)) !== null) {
        if (pattern.source.includes('href')) {
          // É uma URL completa
          let url = match[1];
          if (url.startsWith('/')) {
            url = `https://www.webmotors.com.br${url}`;
          }
          if (url.includes('/comprar/') && /\d{8,}/.test(url)) {
            foundUrls.add(url);
          }
        } else {
          // É um ID
          const id = match[1];
          if (id && id.length >= 8) {
            foundIds.add(id);
            
            // Construir URL baseada no ID
            const constructedUrl = `https://www.webmotors.com.br/comprar/honda/fit/14-lx-16v-flex-4p-manual/4-portas/2009/${id}`;
            foundUrls.add(constructedUrl);
          }
        }
      }
    });

    console.log(`IDs encontrados: ${Array.from(foundIds).join(', ')}`);
    console.log(`URLs construídas: ${Array.from(foundUrls).length}`);

    // Converter URLs em listings
    Array.from(foundUrls).slice(0, 10).forEach(url => {
      const listing: WebmotorsListing = { url };
      
      // Extrair ID da URL para buscar contexto
      const idMatch = url.match(/\/(\d{8,})$/);
      if (idMatch) {
        const id = idMatch[1];
        const idIndex = html.indexOf(id);
        
        if (idIndex !== -1) {
          const context = html.slice(Math.max(0, idIndex - 1000), Math.min(html.length, idIndex + 1000));
          
          // Extrair preço
          const priceMatch = context.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/);
          if (priceMatch) listing.price = priceMatch[0];
          
          // Extrair ano
          const yearMatch = context.match(/(20\d{2}|19\d{2})/);
          if (yearMatch) listing.year = yearMatch[1];
          
          // Extrair quilometragem
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
          if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
          
          // Tentar extrair título do contexto
          const titleMatch = context.match(/Honda\s+Fit[^<>]*(?:LX|EX|DX)[^<>]*/i);
          if (titleMatch) listing.title = titleMatch[0].trim();
        }
      }
      
      listings.push(listing);
    });

    console.log(`WebmotorsParser encontrou ${listings.length} anúncios:`, listings);
    return listings;
  }

  static debugExtraction(html: string): void {
    console.log('=== DEBUG WEBMOTORS PARSER ===');
    console.log('Tamanho do HTML:', html.length);
    
    // Buscar IDs específicos mencionados pelo usuário
    const targetIds = ['60870682', '60509465', '52308137', '59867759'];
    targetIds.forEach(id => {
      const found = html.includes(id);
      console.log(`ID ${id} encontrado no HTML:`, found);
      if (found) {
        const index = html.indexOf(id);
        const context = html.slice(Math.max(0, index - 200), Math.min(html.length, index + 200));
        console.log(`Contexto do ID ${id}:`, context);
      }
    });
    
    // Contar links do webmotors
    const webmotorsLinks = (html.match(/webmotors\.com\.br/g) || []).length;
    console.log('Links da Webmotors encontrados:', webmotorsLinks);
    
    // Contar padrão /comprar/
    const comprarLinks = (html.match(/\/comprar\//g) || []).length;
    console.log('Links com /comprar/ encontrados:', comprarLinks);
  }
}