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
      // Strategy 1: Extract from __NEXT_DATA__ JSON (Next.js app)
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        console.log('Found __NEXT_DATA__, parsing...');
        try {
          const data = JSON.parse(nextDataMatch[1]);
          const extracted = this.extractFromNextData(data);
          if (extracted.length > 0) {
            console.log(`__NEXT_DATA__ yielded ${extracted.length} listings`);
            return extracted;
          }
        } catch (e) {
          console.log('Failed to parse __NEXT_DATA__:', e);
        }
      }

      // Strategy 2: Look for embedded JSON with vehicle data
      const jsonPatterns = [
        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/i,
        /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/i,
        /window\.searchResults\s*=\s*({[\s\S]*?});?\s*<\/script>/i,
        /"SearchResults?":\s*(\[[\s\S]*?\])\s*[,}]/i,
        /"results?":\s*(\[[\s\S]*?\])\s*[,}]/i,
      ];

      for (const pattern of jsonPatterns) {
        const match = html.match(pattern);
        if (match) {
          console.log('Found embedded JSON pattern');
          try {
            const data = JSON.parse(match[1]);
            const extracted = this.extractFromGenericJson(data);
            if (extracted.length > 0) {
              console.log(`Embedded JSON yielded ${extracted.length} listings`);
              return extracted;
            }
          } catch (e) {
            console.log('Failed to parse embedded JSON:', e);
          }
        }
      }

      // Strategy 3: Find all JSON-like blocks containing vehicle data
      const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
      console.log(`Found ${scriptTags.length} script tags`);
      
      for (const scriptTag of scriptTags) {
        const content = scriptTag.replace(/<\/?script[^>]*>/gi, '');
        if (content.length < 100 || content.length > 5000000) continue;
        
        // Look for patterns indicating vehicle data
        if (content.includes('Specification') || content.includes('Make') || 
            content.includes('Model') || content.includes('Price') ||
            content.includes('"ano"') || content.includes('"preco"') ||
            content.includes('"marca"') || content.includes('"modelo"')) {
          console.log('Found script with vehicle-related content, length:', content.length);
          
          // Try to find JSON objects/arrays
          const jsonArrayMatch = content.match(/\[{[^[\]]{50,}}\]/g);
          if (jsonArrayMatch) {
            for (const jsonStr of jsonArrayMatch) {
              try {
                const arr = JSON.parse(jsonStr);
                if (Array.isArray(arr) && arr.length > 0) {
                  const extracted = this.extractFromGenericJson(arr);
                  if (extracted.length > 0) {
                    console.log(`Script JSON array yielded ${extracted.length} listings`);
                    return extracted;
                  }
                }
              } catch { /* continue */ }
            }
          }
        }
      }

      // Strategy 4: Regex for URLs and surrounding data
      console.log('Trying regex extraction...');
      const seen = new Set<string>();
      
      // Find any URL patterns that look like vehicle listings
      const urlPatterns = [
        /href="(\/comprar\/[^"]*\/\d{5,})"/gi,
        /href="(https?:\/\/www\.webmotors\.com\.br\/comprar\/[^"]*\/\d{5,})"/gi,
        /"url"\s*:\s*"(\/comprar\/[^"]*\/\d{5,})"/gi,
        /"url"\s*:\s*"(https?:\/\/www\.webmotors\.com\.br\/comprar\/[^"]*\/\d{5,})"/gi,
        /"UniqueId"\s*:\s*(\d{5,})/gi,
        /"uniqueId"\s*:\s*(\d{5,})/gi,
      ];

      for (const pattern of urlPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null && listings.length < 20) {
          let url = match[1];
          if (/^\d+$/.test(url)) {
            // It's just an ID
            url = `https://www.webmotors.com.br/comprar/detalhes/${url}`;
          } else if (url.startsWith('/')) {
            url = `https://www.webmotors.com.br${url}`;
          }
          
          const normalized = url.replace(/[?#].*$/, '');
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          
          const idx = html.indexOf(match[0]);
          const context = html.slice(Math.max(0, idx - 3000), Math.min(html.length, idx + 3000));
          
          const listing: WebmotorsListing = { url: normalized };
          
          const priceMatch = context.match(/R\$\s*[\d\.]+(?:,\d{2})?/);
          if (priceMatch) listing.price = priceMatch[0];
          
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
          if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
          
          const yearMatch = context.match(/(\d{4}\/\d{4})/);
          if (yearMatch) listing.year = yearMatch[1];
          
          const titleMatch = context.match(/"title"\s*:\s*"([^"]{3,100})"/) ||
                            context.match(/alt="([^"]{3,100})"/);
          if (titleMatch) listing.title = titleMatch[1];
          
          listings.push(listing);
        }
      }
      
      // Strategy 5: Extract price blocks from HTML with proximity matching
      if (listings.length === 0) {
        console.log('Trying price-based extraction...');
        const pricePattern = /R\$\s*([\d\.]+)(?:,(\d{2}))?/g;
        let priceMatch;
        const prices: { value: number; index: number; raw: string }[] = [];
        
        while ((priceMatch = pricePattern.exec(html)) !== null) {
          const raw = priceMatch[0];
          const numStr = priceMatch[1].replace(/\./g, '') + (priceMatch[2] ? `.${priceMatch[2]}` : '');
          const value = parseFloat(numStr);
          // Car-like prices (5k - 500k)
          if (value >= 5000 && value <= 500000) {
            prices.push({ value, index: priceMatch.index, raw });
          }
        }
        
        console.log(`Found ${prices.length} car-range prices`);
        
        for (const price of prices.slice(0, 15)) {
          const context = html.slice(Math.max(0, price.index - 2000), Math.min(html.length, price.index + 2000));
          
          // Must have some vehicle indicators nearby
          if (!/honda|fit|carro|veículo|vehicle|ano|year|km/i.test(context)) continue;
          
          const listing: WebmotorsListing = { 
            url: '', 
            price: price.raw 
          };
          
          const mileageMatch = context.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk]m/);
          if (mileageMatch) listing.mileage = `${mileageMatch[1]} km`;
          
          const yearMatch = context.match(/(\d{4}\/\d{4})/);
          if (yearMatch) listing.year = yearMatch[1];
          
          const titleMatch = context.match(/Honda[^<>"]{0,50}Fit[^<>"]{0,50}/i);
          if (titleMatch) listing.title = titleMatch[0].trim();
          
          // Try to find URL nearby
          const urlMatch = context.match(/href="([^"]*webmotors[^"]*\d{5,}[^"]*)"/i) ||
                          context.match(/"url"\s*:\s*"([^"]*\d{5,}[^"]*)"/i);
          if (urlMatch) {
            let u = urlMatch[1];
            if (u.startsWith('/')) u = `https://www.webmotors.com.br${u}`;
            listing.url = u.replace(/[?#].*$/, '');
          }
          
          if (listing.title || listing.url) {
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
    
    // Recursively search for arrays of vehicle objects
    const search = (obj: any, depth = 0): void => {
      if (depth > 10 || listings.length >= 20) return;
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        // Check if this looks like a vehicle list
        if (obj.length > 0 && obj[0] && (
          obj[0].UniqueId || obj[0].uniqueId || obj[0].Id ||
          obj[0].Make || obj[0].marca || obj[0].Specification
        )) {
          for (const item of obj) {
            const listing = this.vehicleObjToListing(item);
            if (listing) listings.push(listing);
          }
          return;
        }
        for (const item of obj) search(item, depth + 1);
      } else {
        for (const key of Object.keys(obj)) {
          if (['SearchResults', 'searchResults', 'results', 'Results', 
               'vehicles', 'Vehicles', 'ads', 'listings'].includes(key)) {
            search(obj[key], depth + 1);
          }
        }
        if (listings.length === 0) {
          for (const key of Object.keys(obj)) {
            search(obj[key], depth + 1);
          }
        }
      }
    };
    
    search(data);
    return listings;
  }

  private static extractFromGenericJson(data: any): WebmotorsListing[] {
    if (Array.isArray(data)) {
      return data
        .map(item => this.vehicleObjToListing(item))
        .filter((l): l is WebmotorsListing => l !== null);
    }
    return this.extractFromNextData(data);
  }

  private static vehicleObjToListing(item: any): WebmotorsListing | null {
    if (!item || typeof item !== 'object') return null;
    
    const id = item.UniqueId || item.uniqueId || item.Id || item.id || '';
    const make = item.Make?.Value || item.make || item.marca || '';
    const model = item.Model?.Value || item.model || item.modelo || '';
    const yearFab = item.Specification?.YearFabrication || item.anoFabricacao || item.yearFab || '';
    const yearModel = item.Specification?.YearModel || item.anoModelo || item.yearModel || '';
    const price = item.Prices?.Price || item.Price || item.price || item.preco || '';
    const km = item.Specification?.Odometer || item.odometer || item.km || item.quilometragem || '';
    const city = item.Seller?.City || item.city || item.cidade || '';
    const state = item.Seller?.State || item.state || item.estado || '';
    const title = item.Specification?.Title || item.title || item.titulo || `${make} ${model}`;
    
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
    
    const comprarCount = (html.match(/\/comprar\//g) || []).length;
    console.log('/comprar/ occurrences:', comprarCount);
    
    const priceCount = (html.match(/R\$/g) || []).length;
    console.log('R$ occurrences:', priceCount);
    
    const kmCount = (html.match(/\d+\.\d+ [Kk]m/g) || []).length;
    console.log('Km patterns:', kmCount);
    
    // Check for embedded JSON data
    const nextData = html.includes('__NEXT_DATA__');
    const initialState = html.includes('__INITIAL_STATE__');
    console.log('Has __NEXT_DATA__:', nextData);
    console.log('Has __INITIAL_STATE__:', initialState);
    
    // Count script tags
    const scriptCount = (html.match(/<script/g) || []).length;
    console.log('Script tags:', scriptCount);
  }
}
