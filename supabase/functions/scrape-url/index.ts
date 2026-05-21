const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url: rawUrl } = await req.json();

    if (!rawUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Strip URL fragment — server-irrelevant and confuses some proxies
    const url = String(rawUrl).split('#')[0];

    console.log('Fetching URL:', url);

    const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
    const needsJs = /webmotors\.com\.br|mercadolivre\.com\.br|mercadolibre\.com/.test(host);

    const baseMethods: Array<{ name: string; fn: () => Promise<string> }> = [
      { name: 'direct', fn: () => fetchDirect(url) },
      { name: 'direct-mobile', fn: () => fetchDirectMobile(url) },
      { name: 'allorigins-raw', fn: () => fetchViaAllorigins(url) },
      { name: 'allorigins-json', fn: () => fetchViaAlloriginsJson(url) },
      { name: 'codetabs', fn: () => fetchViaCodetabs(url) },
    ];
    const firecrawlMethod = { name: 'firecrawl', fn: () => fetchViaFirecrawl(url) };
    // For SPAs (Webmotors/ML) try Firecrawl first since plain fetches are unreliable
    const methods = needsJs ? [firecrawlMethod, ...baseMethods] : [...baseMethods, firecrawlMethod];

    let lastError = '';
    for (const m of methods) {
      try {
        const html = await m.fn();
        if (!html || html.length < 5000) {
          lastError = `${m.name}: response too small (${html?.length || 0} chars)`;
          console.log(lastError);
          continue;
        }

        const lower = html.toLowerCase();
        const isBlocked =
          lower.includes('suspicious-traffic') ||
          lower.includes('px-captcha') ||
          lower.includes('/recaptcha/') ||
          lower.includes('cf-challenge') ||
          lower.includes('access denied') ||
          lower.includes('ui-empty-state') && html.length < 20000 ||
          (lower.includes('captcha') && html.length < 50000);

        if (isBlocked) {
          lastError = `${m.name}: blocked/captcha/empty page (${html.length} chars)`;
          console.log(lastError);
          continue;
        }

        console.log(`OK via ${m.name}: ${html.length} chars`);
        return new Response(
          JSON.stringify({ success: true, html, source: m.name }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        lastError = `${m.name}: ${e instanceof Error ? e.message : String(e)}`;
        console.log(lastError);
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: `All fetch methods failed. Last: ${lastError}` }),
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

async function fetchViaFirecrawl(url: string): Promise<string> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not configured');

  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['html'],
      onlyMainContent: false,
      waitFor: 3000,
      location: { country: 'BR', languages: ['pt-BR'] },
    }),
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    throw new Error(`Firecrawl HTTP ${response.status}: ${txt.slice(0, 200)}`);
  }
  const data = await response.json();
  const html = data?.data?.html || data?.html || data?.data?.rawHtml || '';
  if (!html) throw new Error('Firecrawl returned no HTML');
  return html;
}
