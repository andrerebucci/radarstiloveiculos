import type { SiteKey } from '../types/monitor';

const KEY = 'cw_notes_v1';

type NotesMap = Record<string, string>;

const keyOf = (url: string, site: SiteKey) => `${site}::${url}`;

function loadAll(): NotesMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as NotesMap;
  } catch {
    return {};
  }
}

function saveAll(map: NotesMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event('cw_notes_updated'));
}

export function getNote(url: string, site: SiteKey): string {
  return loadAll()[keyOf(url, site)] || '';
}

export function setNote(url: string, site: SiteKey, text: string) {
  const map = loadAll();
  const k = keyOf(url, site);
  if (text.trim()) map[k] = text;
  else delete map[k];
  saveAll(map);
}

export function getAllNotes(): NotesMap {
  return loadAll();
}
