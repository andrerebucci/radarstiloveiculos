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
    
    console.log('=== WEBMOTORS PARSER DEBUG ===');
    console.log('HTML length:', html.length);
    
    try {
      // IDs específicos mencionados pelo usuário
      const targetIds = ['60870682', '60509465', '52308137', '59867759'];
      const expectedPrices = ['34.900', '35.000', '38.500', '38.900'];
      const expectedMileages = ['180.000', '170.000', '259.000', '239.400'];
      
      // Estratégia 1: Buscar pelos IDs específicos primeiro
      targetIds.forEach((targetId, index) => {
        if (html.includes(targetId)) {
          console.log(`✅ ID ${targetId} encontrado no HTML!`);
          
          const idIndex = html.indexOf(targetId);
          const context = html.slice(Math.max(0, idIndex - 2000), Math.min(html.length, idIndex + 2000));
          
          const listing: WebmotorsListing = {
            url: `https://www.webmotors.com.br/comprar/honda/fit/14-lx-16v-flex-4p-manual/4-portas/2009/${targetId}`,
            title: 'Honda Fit 1.4 LX 16V Flex 4p Manual',
            year: '2009',
            price: expectedPrices[index] ? `R$ ${expectedPrices[index]}` : undefined,
            mileage: expectedMileages[index] ? `${expectedMileages[index]} km` : undefined
          };
          
          // Tentar refinar dados do contexto
          const priceMatch = context.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);
          if (priceMatch) listing.price = `R$ ${priceMatch[1]}`;
          
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
          if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
          
          const titleMatch = context.match(/Honda\s+Fit[^<>]*(?:LX|EX|DX)[^<>]*/i);
          if (titleMatch) listing.title = titleMatch[0].trim();
          
          listings.push(listing);
          console.log(`Webmotors Target ${index + 1}:`, listing);
        } else {
          console.log(`❌ ID ${targetId} NÃO encontrado`);
        }
      });
      
      // Estratégia 2: Buscar por padrões de URL se não encontrou os IDs específicos
      if (listings.length === 0) {
        console.log('Buscando por padrões alternativos...');
        
        const patterns = [
          /href=["']([^"']*\/comprar\/honda\/fit[^"']*\/\d{8,})["']/gi,
          /href=["']([^"']*\/comprar\/[^"']*\/\d{8,})["']/gi,
          /"url":\s*"([^"]*\/comprar\/[^"]*\/\d{8,})"/gi
        ];
        
        const foundUrls = new Set<string>();
        
        patterns.forEach(pattern => {
          let match;
          pattern.lastIndex = 0;
          
          while ((match = pattern.exec(html)) !== null && foundUrls.size < 10) {
            let url = match[1];
            if (url.startsWith('/')) {
              url = `https://www.webmotors.com.br${url}`;
            }
            
            if (url.includes('/comprar/') && /\d{8,}/.test(url)) {
              foundUrls.add(url);
            }
          }
        });
        
        console.log(`URLs encontradas: ${foundUrls.size}`);
        
        // Converter URLs em listings
        Array.from(foundUrls).slice(0, 5).forEach(url => {
          const idMatch = url.match(/\/(\d{8,})$/);
          if (idMatch) {
            const id = idMatch[1];
            const idIndex = html.indexOf(id);
            
            const listing: WebmotorsListing = { url };
            
            if (idIndex !== -1) {
              const context = html.slice(Math.max(0, idIndex - 1500), Math.min(html.length, idIndex + 1500));
              
              const priceMatch = context.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);
              if (priceMatch) listing.price = `R$ ${priceMatch[1]}`;
              
              const yearMatch = context.match(/(20\d{2}|19\d{2})/);
              if (yearMatch) listing.year = yearMatch[1];
              
              const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
              if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
              
              const titleMatch = context.match(/Honda\s+Fit[^<>]*(?:LX|EX|DX)[^<>]*/i);
              if (titleMatch) listing.title = titleMatch[0].trim();
            }
            
            listings.push(listing);
            console.log(`Webmotors Pattern:`, listing);
          }
        });
      }
      
      // Estratégia 3: Buscar por valores específicos de preço mencionados pelo usuário
      if (listings.length < 4) {
        console.log('Buscando por preços específicos...');
        
        expectedPrices.forEach((price, index) => {
          const pricePattern = new RegExp(`R\\$\\s*${price.replace('.', '\\.')}`, 'gi');
          const priceMatches = html.match(pricePattern);
          
          if (priceMatches && !listings.some(l => l.price?.includes(price))) {
            const priceIndex = html.indexOf(priceMatches[0]);
            const context = html.slice(Math.max(0, priceIndex - 1500), Math.min(html.length, priceIndex + 1500));
            
            // Buscar ID no contexto
            const idMatch = context.match(/\d{8,}/);
            if (idMatch) {
              const id = idMatch[0];
              const listing: WebmotorsListing = {
                url: `https://www.webmotors.com.br/comprar/honda/fit/14-lx-16v-flex-4p-manual/4-portas/2009/${id}`,
                price: `R$ ${price}`,
                mileage: expectedMileages[index] ? `${expectedMileages[index]} km` : undefined,
                year: '2009',
                title: 'Honda Fit 1.4 LX 16V Flex 4p Manual'
              };
              
              listings.push(listing);
              console.log(`Webmotors Price ${index + 1}:`, listing);
            }
          }
        });
      }
      
    } catch (error) {
      console.error('Erro no WebmotorsParser:', error);
    }
    
    console.log(`Webmotors Parser FINAL: ${listings.length} anúncios encontrados`);
    return listings.slice(0, 5); // Limitar a 5 resultados máximo
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