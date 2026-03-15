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

    // Fetch ML via proxy and analyze HTML structure
    const mlUrl = encodeURIComponent('https://lista.mercadolivre.com.br/veiculos/carros-caminhonetes/honda/fit-em-sao-paulo/_YearRange_2009-2009_PriceRange_0-39000');
    const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${mlUrl}`);
    const html = await proxyRes.text();

    results.htmlLength = html.length;

    // Find MLB link patterns and extract samples
    const mlbLinks = html.match(/href="[^"]*MLB[^"]*"/g) || [];
    results.mlbLinkCount = mlbLinks.length;
    results.mlbLinkSamples = mlbLinks.slice(0, 5);

    // Find price patterns near MLB links
    const firstMlbIdx = html.indexOf('MLB');
    if (firstMlbIdx > 0) {
      // Get a big chunk around the first listing area
      results.firstMlbContext = html.slice(Math.max(0, firstMlbIdx - 500), firstMlbIdx + 2000);
    }

    // Look for poly-card or similar card components
    results.polyCardCount = (html.match(/poly-card/g) || []).length;
    results.polyComponentCount = (html.match(/poly-component/g) || []).length;

    // Find list item structures
    const liItems = html.match(/<li[^>]*class="[^"]*"[^>]*>/g) || [];
    results.liItemSamples = liItems.slice(0, 10).map(li => li.slice(0, 200));

    // Find price amounts - ML uses andes-money format
    const moneyPattern = html.match(/andes-money[^<]*|price[^<]*/gi) || [];
    results.moneyPatterns = moneyPattern.slice(0, 10);

    // Find a full card HTML
    // Try to find the structure between consecutive MLB links
    const allMlbPositions = [];
    let searchFrom = 0;
    for (let i = 0; i < 5; i++) {
      const pos = html.indexOf('MLB', searchFrom);
      if (pos === -1) break;
      allMlbPositions.push(pos);
      searchFrom = pos + 5;
    }

    if (allMlbPositions.length >= 2) {
      // Get the chunk between first and second MLB to see one card structure
      results.cardSample = html.slice(
        Math.max(0, allMlbPositions[0] - 300),
        Math.min(html.length, allMlbPositions[1] + 100)
      );
    }

    // Look for data attributes
    const dataAttrs = html.match(/data-[a-z-]+="[^"]*"/g) || [];
    const uniqueDataAttrs = [...new Set(dataAttrs.map(a => a.split('=')[0]))];
    results.dataAttributes = uniqueDataAttrs.slice(0, 20);

    // Find all class patterns containing 'result' or 'item' or 'card'
    const classPatterns = html.match(/class="[^"]*(?:result|item|card|listing)[^"]*"/gi) || [];
    results.relevantClasses = [...new Set(classPatterns)].slice(0, 15);

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
