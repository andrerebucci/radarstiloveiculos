export type SiteKey = 'olx' | 'webmotors' | 'mercadolivre';

export interface ParsedListing {
  url: string;
  title?: string;
  priceText?: string;
}

const SITE_PATTERNS: Record<SiteKey, RegExp> = {
  olx: /https?:\/\/(?:www\.)?olx\.com\.br[^"'\s)]+/gi,
  webmotors: /https?:\/\/(?:www\.)?webmotors\.com\.br[^"'\s)]+/gi,
  mercadolivre: /https?:\/\/(?:www\.)?mercadolivre\.com\.br[^"'\s)]+/gi,
};

const PRICE_REGEX = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/i;

export function extractListingsFromHtml(html: string, site: SiteKey): ParsedListing[] {
  const pattern = SITE_PATTERNS[site];
  const matches = html.match(pattern) || [];
  const unique = Array.from(new Set(matches));

  const listings: ParsedListing[] = unique.map((u) => ({ url: normalizeUrl(u) }));

  // Try to grab some nearby price hints
  listings.forEach((item) => {
    try {
      const idx = html.indexOf(item.url);
      if (idx !== -1) {
        const window = html.slice(Math.max(0, idx - 400), Math.min(html.length, idx + 400));
        const price = window.match(PRICE_REGEX)?.[0];
        if (price) item.priceText = price;
      }
    } catch {}
  });

  return listings;
}

function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.toString();
  } catch {
    return u;
  }
}
