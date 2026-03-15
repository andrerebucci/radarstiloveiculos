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

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching URL:', url);

    // First request to get cookies
    const initialResponse = await fetch(url, {
      method: 'GET',
      headers: getHeaders(url),
      redirect: 'follow',
    });

    // Extract cookies from response
    const cookies = initialResponse.headers.get('set-cookie') || '';
    
    let html = await initialResponse.text();

    // If blocked (403/captcha), retry with cookies
    if (initialResponse.status === 403 || html.length < 1000) {
      console.log('First attempt blocked, retrying with cookies...');
      
      const retryResponse = await fetch(url, {
        method: 'GET',
        headers: {
          ...getHeaders(url),
          'Cookie': cookies,
        },
        redirect: 'follow',
      });

      if (retryResponse.ok) {
        html = await retryResponse.text();
      } else {
        // Try mobile user agent as last resort
        console.log('Retrying with mobile UA...');
        const mobileResponse = await fetch(url, {
          method: 'GET',
          headers: getMobileHeaders(url),
          redirect: 'follow',
        });
        html = await mobileResponse.text();
        
        if (!mobileResponse.ok) {
          console.error('All attempts failed:', mobileResponse.status);
          return new Response(
            JSON.stringify({ success: false, error: `HTTP ${mobileResponse.status}: ${mobileResponse.statusText}` }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log('Fetched HTML size:', html.length);

    return new Response(
      JSON.stringify({ success: true, html, source: 'edge-function' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch URL';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getHeaders(url: string): Record<string, string> {
  const host = new URL(url).hostname;
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': `https://${host}/`,
    'Host': host,
  };
}

function getMobileHeaders(url: string): Record<string, string> {
  const host = new URL(url).hostname;
  return {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Ch-Ua-Mobile': '?1',
    'Sec-Ch-Ua-Platform': '"Android"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': `https://www.google.com/`,
    'Host': host,
  };
}
