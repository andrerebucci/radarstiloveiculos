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

    // Test Webmotors API
    const wmApiUrl = 'https://www.webmotors.com.br/api/search/car?url=https://www.webmotors.com.br/carros/sp/honda/fit/de.2009/ate.2009&tipoveiculo=carros&estadocidade=S%C3%A3o%20Paulo&marca1=HONDA&modelo1=FIT&anode=2009&anoate=2009&precoate=39000&anunciante=Concession%C3%A1ria%7CLoja%7CPessoa%20F%C3%ADsica&o=5&page=1';
    
    // Test ML API
    const mlApiUrl = 'https://api.mercadolibre.com/sites/MLB/search?category=MLB1744&q=honda+fit+2009&price=*-39000&state=SP';

    const results: any = {};

    // Test Webmotors API
    try {
      const wmRes = await fetch(wmApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.webmotors.com.br/',
        }
      });
      results.webmotors_api_status = wmRes.status;
      if (wmRes.ok) {
        const wmData = await wmRes.json();
        results.webmotors_api_type = typeof wmData;
        results.webmotors_api_keys = Object.keys(wmData).slice(0, 20);
        if (wmData.SearchResults) {
          results.webmotors_results_count = wmData.SearchResults.length;
          if (wmData.SearchResults[0]) {
            results.webmotors_first_item = JSON.stringify(wmData.SearchResults[0]).slice(0, 2000);
          }
        } else if (Array.isArray(wmData)) {
          results.webmotors_array_length = wmData.length;
          if (wmData[0]) results.webmotors_first_item = JSON.stringify(wmData[0]).slice(0, 2000);
        }
        results.webmotors_raw_sample = JSON.stringify(wmData).slice(0, 3000);
      } else {
        results.webmotors_api_body = await wmRes.text().then(t => t.slice(0, 500));
      }
    } catch (e) {
      results.webmotors_api_error = String(e);
    }

    // Test Webmotors search API v2
    try {
      const wmRes2 = await fetch('https://www.webmotors.com.br/api/search/car?tipoveiculo=carros&estadocidade=S%C3%A3o+Paulo&marca1=HONDA&modelo1=FIT&anode=2009&anoate=2009&precoate=39000&o=5&page=1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.webmotors.com.br/',
          'Origin': 'https://www.webmotors.com.br',
        }
      });
      results.webmotors_api2_status = wmRes2.status;
      const body2 = await wmRes2.text();
      results.webmotors_api2_body = body2.slice(0, 2000);
    } catch (e) {
      results.webmotors_api2_error = String(e);
    }

    // Test ML API
    try {
      const mlRes = await fetch(mlApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        }
      });
      results.ml_api_status = mlRes.status;
      if (mlRes.ok) {
        const mlData = await mlRes.json();
        results.ml_results_count = mlData.results?.length;
        results.ml_paging = mlData.paging;
        if (mlData.results?.[0]) {
          results.ml_first_item = JSON.stringify(mlData.results[0]).slice(0, 2000);
        }
      } else {
        results.ml_api_body = await mlRes.text().then(t => t.slice(0, 500));
      }
    } catch (e) {
      results.ml_api_error = String(e);
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
