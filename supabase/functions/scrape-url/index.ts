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

    // Try multiple methods in order
    const methods = [
      () => fetchDirect(url),
      () => fetchViaAllorigins(url),
      () => fetchViaAlloriginsJson(url),
      () => fetchViaCodetabs(url),
      () => fetchDirectMobile(url),
    ];

    for (const method of methods) {
      try {
        const result = await method();
        if (result && result.length > 1000) {
          // Check if it's a real page (not captcha/block page)
          const isBlocked = result.length < 10000 && (
            result.includes('captcha') || 
            result.includes('blocked') ||
            result.includes('suspicious-traffic') ||
            result.includes('px-captcha')
          );
          
          if (!isBlocked) {
            console.log(`Fetched HTML: ${result.length} chars`);
            return new Response(
              JSON.stringify({ success: true, html: result, source: 'edge-function' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          } else {
            console.log('Blocked page detected, trying next method...');
          }
        }
      } catch (e) {
        console.log('Method failed:', e instanceof Error ? e.message : String(e));
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'All fetch methods failed or returned blocked pages' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch URL' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchDirect(url: string): Promise<string> {
  const host = new URL(url).hostname;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Referer': `https://www.google.com/`,
      'Host': host,
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

async function fetchDirectMobile(url: string): Promise<string> {
  const host = new URL(url).hostname;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Sec-Ch-Ua-Mobile': '?1',
      'Sec-Ch-Ua-Platform': '"Android"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
      'Referer': 'https://www.google.com/',
      'Host': host,
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

async function fetchViaAllorigins(url: string): Promise<string> {
  const encoded = encodeURIComponent(url);
  const response = await fetch(`https://api.allorigins.win/raw?url=${encoded}`, {
    method: 'GET',
  });
  if (!response.ok) throw new Error(`Allorigins HTTP ${response.status}`);
  return await response.text();
}

async function fetchViaAlloriginsJson(url: string): Promise<string> {
  const encoded = encodeURIComponent(url);
  const response = await fetch(`https://api.allorigins.win/get?url=${encoded}`, {
    method: 'GET',
  });
  if (!response.ok) throw new Error(`Allorigins JSON HTTP ${response.status}`);
  const data = await response.json();
  return data.contents || '';
}

async function fetchViaCodetabs(url: string): Promise<string> {
  const encoded = encodeURIComponent(url);
  const response = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encoded}`, {
    method: 'GET',
  });
  if (!response.ok) throw new Error(`Codetabs HTTP ${response.status}`);
  return await response.text();
}
