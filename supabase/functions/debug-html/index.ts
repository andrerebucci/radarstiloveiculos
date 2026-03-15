const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const results: any = {};

    // ML API - try different endpoints
    const mlEndpoints = [
      'https://api.mercadolibre.com/sites/MLB/search?q=honda+fit+2009',
      'https://api.mercadolibre.com/sites/MLB/search?q=honda+fit&yearRange=2009-2009',
      'https://api.mercadolibre.com/sites/MLB/search?category=MLB1744&q=honda+fit',
    ];

    for (let i = 0; i < mlEndpoints.length; i++) {
      try {
        const res = await fetch(mlEndpoints[i], {
          headers: { 'Accept': 'application/json' }
        });
        results[`ml_endpoint${i}_status`] = res.status;
        const body = await res.text();
        results[`ml_endpoint${i}_body`] = body.slice(0, 1000);
      } catch (e) {
        results[`ml_endpoint${i}_error`] = String(e);
      }
    }

    // Try allorigins proxy for Webmotors
    try {
      const wmUrl = encodeURIComponent('https://www.webmotors.com.br/carros/sp/honda/fit/de.2009/ate.2009?tipoveiculo=carros&marca1=HONDA&modelo1=FIT&anode=2009&anoate=2009&precoate=39000&o=5&page=1');
      const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${wmUrl}`);
      results.wm_proxy_status = proxyRes.status;
      const proxyBody = await proxyRes.text();
      results.wm_proxy_length = proxyBody.length;
      results.wm_proxy_has_prices = proxyBody.includes('35.000') || proxyBody.includes('35000');
      results.wm_proxy_has_comprar = proxyBody.includes('/comprar/');
      results.wm_proxy_sample = proxyBody.slice(0, 500);
    } catch (e) {
      results.wm_proxy_error = String(e);
    }

    // Try allorigins for ML
    try {
      const mlUrl = encodeURIComponent('https://lista.mercadolivre.com.br/veiculos/carros-caminhonetes/honda/fit-em-sao-paulo/_YearRange_2009-2009_PriceRange_0-39000');
      const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${mlUrl}`);
      results.ml_proxy_status = proxyRes.status;
      const proxyBody = await proxyRes.text();
      results.ml_proxy_length = proxyBody.length;
      results.ml_proxy_has_mlb = (proxyBody.match(/MLB/g) || []).length;
      results.ml_proxy_has_prices = proxyBody.includes('R$');
      results.ml_proxy_sample = proxyBody.slice(0, 500);
    } catch (e) {
      results.ml_proxy_error = String(e);
    }

    // Try Google web cache for Webmotors
    try {
      const cacheRes = await fetch('https://webcache.googleusercontent.com/search?q=cache:webmotors.com.br/carros/sp/honda/fit/de.2009/ate.2009', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      results.wm_cache_status = cacheRes.status;
      const cacheBody = await cacheRes.text();
      results.wm_cache_length = cacheBody.length;
    } catch (e) {
      results.wm_cache_error = String(e);
    }

    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
