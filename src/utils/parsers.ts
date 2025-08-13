export type SiteKey = 'olx' | 'webmotors' | 'mercadolivre';

import { WebmotorsParser } from './WebmotorsParser';

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
  // Prefer structured DOM parsing; fallback to regex context scan
  const domResults = extractViaDom(html, site);
  if (domResults.length > 0) return domResults;
  return extractViaRegexContext(html, site);
}

function extractViaDom(html: string, site: SiteKey): ParsedListing[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let anchors: HTMLAnchorElement[] = [];
    if (site === 'olx') {
      anchors = Array.from(doc.querySelectorAll('a[href*="olx.com.br"]')) as HTMLAnchorElement[];
    } else if (site === 'webmotors') {
      // Buscar links mais específicos da Webmotors
      anchors = Array.from(doc.querySelectorAll('a[href*="webmotors.com.br/comprar"], a[href*="/comprar/"], a[data-testid*="vehicle"], a[class*="vehicle"]')) as HTMLAnchorElement[];
    } else if (site === 'mercadolivre') {
      anchors = Array.from(doc.querySelectorAll('a[href*="mercadolivre.com.br"]')) as HTMLAnchorElement[];
    }

    // Site-specific URL filters to keep only item pages
    const keep = (href: string) => {
      if (site === 'olx') return /\/(d|item)\//i.test(href);
      if (site === 'webmotors') return /\/comprar\//i.test(href) && /\d{8,}/i.test(href);
      if (site === 'mercadolivre') return /\bMLB\d+/i.test(href) || /\/item\//i.test(href);
      return true;
    };

    const base = site === 'olx'
      ? 'https://www.olx.com.br'
      : site === 'webmotors'
      ? 'https://www.webmotors.com.br'
      : 'https://www.mercadolivre.com.br';

    const seen = new Set<string>();
    const results: ParsedListing[] = [];

    for (const a of anchors) {
      let href = a.getAttribute('href') || '';
      if (!href) continue;
      if (href.startsWith('/')) href = new URL(href, base).toString();
      if (!keep(href)) continue;
      const url = normalizeUrl(href);
      if (seen.has(url)) continue;

      const container = (a.closest('li, article, div, section') as HTMLElement) || a.parentElement as HTMLElement | null;
      const textSource = (container?.textContent || a.textContent || '') as string;
      const price = textSource.match(PRICE_REGEX)?.[0];

      results.push({
        url,
        title: a.getAttribute('title') || a.textContent?.trim() || undefined,
        priceText: price || undefined,
      });
      seen.add(url);
      if (results.length >= 10) break; // limit to reduce noise
    }

    return results;
  } catch {
    return [];
  }
}

function extractViaRegexContext(html: string, site: SiteKey): ParsedListing[] {
  // Para Webmotors, usar o parser especializado
  if (site === 'webmotors') {
    WebmotorsParser.debugExtraction(html);
    const webmotorsListings = WebmotorsParser.extractListings(html);
    return webmotorsListings.map(w => ({
      url: w.url,
      title: w.title,
      priceText: w.price,
    }));
  }

  // Padrões originais para outros sites
  const pattern = site === 'olx'
    ? /https?:\/\/(?:[\w.-]+\.)?olx\.com\.br\/d\/[^"'\s)]+/gi
    : /https?:\/\/(?:www\.)?mercadolivre\.com\.br[^"'\s)]+MLB\d+[^"'\s)]*/gi;

  const matches = html.match(pattern) || [];
  const unique = Array.from(new Set(matches));
  const listings: ParsedListing[] = unique.slice(0, 10).map((u) => ({ url: normalizeUrl(u) }));

  // Try to grab some nearby price hints
  listings.forEach((item) => {
    try {
      const idx = html.indexOf(item.url);
      if (idx !== -1) {
        const context = html.slice(Math.max(0, idx - 600), Math.min(html.length, idx + 600));
        const price = context.match(PRICE_REGEX)?.[0];
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
