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

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
      });

    const baseMethods: Array<{ name: string; fn: () => Promise<string>; timeout: number }> = [
      { name: 'direct', fn: () => fetchDirect(url), timeout: 10_000 },
      { name: 'direct-mobile', fn: () => fetchDirectMobile(url), timeout: 10_000 },
      { name: 'allorigins-raw', fn: () => fetchViaAllorigins(url), timeout: 12_000 },
      { name: 'allorigins-json', fn: () => fetchViaAlloriginsJson(url), timeout: 12_000 },
      { name: 'codetabs', fn: () => fetchViaCodetabs(url), timeout: 12_000 },
    ];
    const firecrawlMethod = { name: 'firecrawl', fn: () => fetchViaFirecrawl(url), timeout: 45_000 };
    // For SPAs (Webmotors/ML) AND OLX (plain fetches consistently 403), prefer Firecrawl first.
    const preferFirecrawl = needsJs || /olx\.com\.br/.test(host);
    const methods = preferFirecrawl ? [firecrawlMethod, ...baseMethods] : [...baseMethods, firecrawlMethod];

    let lastError = '';
    for (const m of methods) {
      try {
        const html = await withTimeout(m.fn(), m.timeout, m.name);
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

async function fetchViaFirecrawlWithKey(url: string, apiKey: string, label: string): Promise<string> {

  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  const needsStealth = /mercadolivre\.com\.br|mercadolibre\.com/.test(host);

  const attempt = async (waitFor: number): Promise<string> => {
    const body: Record<string, unknown> = {
      url,
      formats: ['html'],
      onlyMainContent: false,
      waitFor,
      location: { country: 'BR', languages: ['pt-BR'] },
    };
    if (needsStealth) body.proxy = 'stealth';

    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      throw new Error(`Firecrawl HTTP ${response.status}: ${txt.slice(0, 200)}`);
    }
    const data = await response.json();
    return data?.data?.html || data?.html || data?.data?.rawHtml || '';
  };

  let html = await attempt(needsStealth ? 8000 : 4000);
  // Retry once for ML if first attempt looks like a stub/empty page
  if (needsStealth && (!html || html.length < 50000)) {
    console.log(`Firecrawl ML stub (${html?.length || 0} chars), retrying with longer wait...`);
    try {
      const retry = await attempt(12000);
      if (retry && retry.length > html.length) html = retry;
    } catch (e) {
      console.log('Firecrawl retry failed:', e instanceof Error ? e.message : String(e));
    }
  }
  if (!html) throw new Error(`Firecrawl ${label}: empty HTML`);
  console.log(`Firecrawl OK via ${label} key (${html.length} chars)`);
  return html;
}

async function fetchViaFirecrawl(url: string): Promise<string> {
  const primary = Deno.env.get('FIRECRAWL_API_KEY');
  const backup = Deno.env.get('FIRECRAWL_API_KEY_BACKUP');
  const keys: Array<{ key: string; label: string }> = [];
  if (primary) keys.push({ key: primary, label: 'primary' });
  if (backup) keys.push({ key: backup, label: 'backup' });
  if (keys.length === 0) throw new Error('FIRECRAWL_API_KEY not configured');

  let lastError: unknown = null;
  for (const { key, label } of keys) {
    try {
      console.log(`Firecrawl: trying ${label} key`);
      return await fetchViaFirecrawlWithKey(url, key, label);
    } catch (e) {
      lastError = e;
      console.log(`Firecrawl ${label} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('Firecrawl failed on all keys'));
}
