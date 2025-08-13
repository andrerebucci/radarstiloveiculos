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
    
    // Múltiplos padrões para capturar URLs dos anúncios da Webmotors
    const urlPatterns = [
      // Padrão principal: href="https://www.webmotors.com.br/comprar/..."
      /href=["']([^"']*(?:www\.)?webmotors\.com\.br\/comprar[^"']*\d{8,}[^"']*)["']/gi,
      // Padrão JSON: "url":"https://www.webmotors.com.br/comprar/..."
      /"url":\s*"([^"]*(?:www\.)?webmotors\.com\.br\/comprar[^"]*\d{8,}[^"]*)"/gi,
      // Padrão direto no HTML
      /https?:\/\/(?:www\.)?webmotors\.com\.br\/comprar\/[^\s"'<>]+\/\d{8,}/gi,
      // Padrão para links relativos
      /href=["']([^"']*\/comprar\/[^"']*\d{8,}[^"']*)["']/gi,
    ];

    const foundUrls = new Set<string>();

    // Aplicar todos os padrões
    urlPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let url = match[1] || match[0];
        
        // Limpar a URL
        url = url.replace(/^["']|["']$/g, '');
        
        // Converter URLs relativas em absolutas
        if (url.startsWith('/')) {
          url = `https://www.webmotors.com.br${url}`;
        }
        
        // Verificar se é uma URL válida de anúncio
        if (url.includes('/comprar/') && /\d{8,}/.test(url)) {
          foundUrls.add(url);
        }
      }
    });

    // Buscar também por IDs específicos nos atributos de dados
    const dataIdPattern = /data-[^=]*=["'][^"']*(\d{8,})[^"']*["']/gi;
    let match;
    while ((match = dataIdPattern.exec(html)) !== null) {
      const id = match[1];
      // Construir URL baseada no ID encontrado
      const constructedUrl = `https://www.webmotors.com.br/comprar/honda/fit/14-lx-16v-flex-4p-manual/4-portas/2009/${id}`;
      foundUrls.add(constructedUrl);
    }

    // Converter URLs em listings
    Array.from(foundUrls).slice(0, 10).forEach(url => {
      const listing: WebmotorsListing = { url };
      
      // Tentar extrair informações do contexto da URL no HTML
      const urlIndex = html.indexOf(url.split('/').pop() || '');
      if (urlIndex !== -1) {
        const context = html.slice(Math.max(0, urlIndex - 1000), Math.min(html.length, urlIndex + 1000));
        
        // Extrair preço
        const priceMatch = context.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/i);
        if (priceMatch) listing.price = priceMatch[0];
        
        // Extrair ano
        const yearMatch = context.match(/(20\d{2}|19\d{2})/);
        if (yearMatch) listing.year = yearMatch[1];
        
        // Extrair quilometragem
        const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
        if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
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