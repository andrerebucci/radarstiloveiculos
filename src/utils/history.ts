import type { HistoryEntry, SiteKey } from '../types/monitor';
import type { ParsedListing } from './parsers';

const KEY_PREFIX = 'cw_history_v1_';

export function loadHistory(monitorId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + monitorId);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(monitorId: string, entries: HistoryEntry[]) {
  localStorage.setItem(KEY_PREFIX + monitorId, JSON.stringify(entries));
}

export function clearHistory(monitorId: string) {
  localStorage.removeItem(KEY_PREFIX + monitorId);
}

const keyOf = (url: string, site: SiteKey) => `${site}::${url}`;

/**
 * Concilia os resultados de uma verificação com o histórico existente.
 * - Anúncios novos → criados com firstSeenAt = agora.
 * - Anúncios já vistos → atualizam lastSeenAt e dados (limpam removedAt se reapareceram).
 * - Anúncios não vistos nesta rodada → recebem removedAt (apenas se ainda não tinham).
 * Apenas os sites efetivamente verificados nesta rodada são considerados para marcar remoções.
 */
export function reconcileHistory(
  monitorId: string,
  results: Record<SiteKey, ParsedListing[]>,
  sitesChecked: SiteKey[],
): HistoryEntry[] {
  const now = new Date().toISOString();
  const existing = loadHistory(monitorId);
  const byKey = new Map<string, HistoryEntry>(existing.map((e) => [keyOf(e.url, e.site), e]));

  const seenNow = new Set<string>();

  for (const site of sitesChecked) {
    for (const item of results[site] || []) {
      const k = keyOf(item.url, site);
      seenNow.add(k);
      const prev = byKey.get(k);
      if (prev) {
        prev.lastSeenAt = now;
        prev.removedAt = undefined; // reapareceu
        prev.title = item.title ?? prev.title;
        prev.price = item.price ?? prev.price;
        prev.mileage = item.mileage ?? prev.mileage;
        prev.location = item.location ?? prev.location;
      } else {
        byKey.set(k, {
          url: item.url,
          site,
          title: item.title,
          price: item.price,
          mileage: item.mileage,
          location: item.location,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      }
    }
  }

  // Marca como removidos os anúncios dos sites verificados que não apareceram.
  for (const [k, entry] of byKey) {
    if (!sitesChecked.includes(entry.site)) continue;
    if (seenNow.has(k)) continue;
    if (!entry.removedAt) entry.removedAt = now;
  }

  const all = Array.from(byKey.values());
  saveHistory(monitorId, all);
  return all;
}

/** Dias entre firstSeenAt e (removedAt || agora). */
export function daysListed(entry: HistoryEntry): number {
  const start = new Date(entry.firstSeenAt).getTime();
  const end = entry.removedAt ? new Date(entry.removedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 86400000));
}
