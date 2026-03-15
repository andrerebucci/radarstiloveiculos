const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    const html = await response.text();
    
    // Analyze the HTML structure
    const analysis: any = {
      status: response.status,
      htmlLength: html.length,
      hasNextData: html.includes('__NEXT_DATA__'),
      hasPreloadedState: html.includes('__PRELOADED_STATE__'),
      hasInitialState: html.includes('__INITIAL_STATE__'),
      priceOccurrences: (html.match(/R\$/g) || []).length,
      scriptTags: (html.match(/<script/g) || []).length,
    };

    // Extract price contexts - find R$ followed by prices in car range
    const pricePattern = /R\$\s*([\d\.]+(?:,\d{2})?)/g;
    let priceMatch;
    const prices: string[] = [];
    while ((priceMatch = pricePattern.exec(html)) !== null && prices.length < 20) {
      prices.push(priceMatch[0]);
    }
    analysis.prices = prices;

    // Look for JSON-LD
    const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    analysis.jsonLdCount = jsonLdMatches.length;
    if (jsonLdMatches.length > 0) {
      analysis.jsonLdSamples = jsonLdMatches.slice(0, 3).map(m => {
        const content = m.replace(/<\/?script[^>]*>/gi, '');
        return content.slice(0, 500);
      });
    }

    // Look for __NEXT_DATA__
    if (html.includes('__NEXT_DATA__')) {
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        const content = nextDataMatch[1];
        analysis.nextDataLength = content.length;
        // Find keys at top level
        try {
          const parsed = JSON.parse(content);
          analysis.nextDataKeys = Object.keys(parsed);
          if (parsed.props) analysis.nextDataPropsKeys = Object.keys(parsed.props);
          if (parsed.props?.pageProps) {
            analysis.pagePropsKeys = Object.keys(parsed.props.pageProps);
            // Look for arrays that might be results
            for (const key of Object.keys(parsed.props.pageProps)) {
              const val = parsed.props.pageProps[key];
              if (Array.isArray(val)) {
                analysis[`pageProps_${key}_length`] = val.length;
                if (val.length > 0) {
                  analysis[`pageProps_${key}_sample`] = JSON.stringify(val[0]).slice(0, 1000);
                }
              } else if (val && typeof val === 'object') {
                analysis[`pageProps_${key}_keys`] = Object.keys(val).slice(0, 20);
              }
            }
          }
        } catch (e) {
          analysis.nextDataParseError = String(e);
        }
      }
    }

    // For MercadoLivre: look for specific patterns
    if (url.includes('mercadolivre') || url.includes('lista.mercadolivre')) {
      // Check for poly-card elements
      analysis.polyCardCount = (html.match(/poly-card/g) || []).length;
      analysis.uiSearchCount = (html.match(/ui-search/g) || []).length;
      analysis.mlbLinkCount = (html.match(/MLB-?\d+/g) || []).length;
      
      // Extract a sample of MLB links
      const mlbLinks = html.match(/href="[^"]*MLB[- ]?\d+[^"]*"/g) || [];
      analysis.mlbLinkSamples = mlbLinks.slice(0, 5);
      
      // Look for price containers
      const priceContainers = html.match(/class="[^"]*price[^"]*"[^>]*>[^<]*/gi) || [];
      analysis.priceContainerSamples = priceContainers.slice(0, 5);

      // Check for andes (ML design system) components
      analysis.andesCount = (html.match(/andes/gi) || []).length;
      
      // Sample around first MLB link
      const firstMlb = html.indexOf('MLB');
      if (firstMlb > 0) {
        analysis.mlbContext = html.slice(Math.max(0, firstMlb - 200), firstMlb + 300);
      }
    }

    // For Webmotors: analyze structure
    if (url.includes('webmotors')) {
      analysis.comprarCount = (html.match(/\/comprar\//g) || []).length;
      analysis.cardCount = (html.match(/card/gi) || []).length;
      
      // Look for price in different formats  
      const price35 = html.indexOf('35.000') > -1 || html.indexOf('35000') > -1;
      const price37 = html.indexOf('37.000') > -1 || html.indexOf('37000') > -1;
      analysis.hasExpectedPrices = { '35000': price35, '37000': price37 };
      
      // Find context around prices
      const idx35 = Math.max(html.indexOf('35.000'), html.indexOf('35000'));
      if (idx35 > 0) {
        analysis.price35kContext = html.slice(Math.max(0, idx35 - 300), idx35 + 300);
      }
      
      const idx37 = Math.max(html.indexOf('37.000'), html.indexOf('37000'));
      if (idx37 > 0) {
        analysis.price37kContext = html.slice(Math.max(0, idx37 - 300), idx37 + 300);
      }
    }

    return new Response(
      JSON.stringify(analysis, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
