import { supabase } from '@/integrations/supabase/client';
import type { Monitor, HistoryEntry, SiteKey } from '@/types/monitor';

const MONITORS_KEY = 'cw_monitors_v1';
const HISTORY_PREFIX = 'cw_history_v1_';
const NOTES_KEY = 'cw_notes_v1';
const LAST_SYNC_KEY = 'cw_cloud_last_sync';

// Use any-cast because the Supabase types file is regenerated asynchronously.
const db = supabase as any;

function readLocalMonitors(): Monitor[] {
  try { return JSON.parse(localStorage.getItem(MONITORS_KEY) || '[]'); } catch { return []; }
}
function writeLocalMonitors(list: Monitor[]) {
  localStorage.setItem(MONITORS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('cw_monitors_updated'));
}
function readLocalHistory(monitorId: string): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_PREFIX + monitorId) || '[]'); } catch { return []; }
}
function writeLocalHistory(monitorId: string, entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_PREFIX + monitorId, JSON.stringify(entries));
}
function readLocalNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; }
}
function writeLocalNotes(map: Record<string, string>) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event('cw_notes_updated'));
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Push the entire local state to the cloud (upsert). Safe to call repeatedly. */
export async function pushAll(userId: string) {
  const monitors = readLocalMonitors();

  // Monitors
  if (monitors.length > 0) {
    const rows = monitors.map((m) => ({
      id: m.id,
      user_id: userId,
      name: m.name,
      urls: m.urls,
      refresh_interval_hours: m.refreshIntervalHours ?? 24,
      last_checked_at: m.lastCheckedAt ?? null,
      created_at: m.createdAt,
      shared: m.shared ?? false,
      organization_id: m.organizationId ?? null,
    }));
    await db.from('monitors').upsert(rows, { onConflict: 'id' });
  }

  // History
  for (const m of monitors) {
    const hist = readLocalHistory(m.id);
    if (hist.length === 0) continue;
    const rows = hist.map((h) => ({
      user_id: userId,
      monitor_id: m.id,
      site: h.site,
      url: h.url,
      title: h.title ?? null,
      price: h.price ?? null,
      mileage: h.mileage ?? null,
      location: h.location ?? null,
      first_seen_at: h.firstSeenAt,
      last_seen_at: h.lastSeenAt,
      removed_at: h.removedAt ?? null,
    }));
    // chunk to avoid payload limits
    for (let i = 0; i < rows.length; i += 200) {
      await db.from('history_entries').upsert(rows.slice(i, i + 200), { onConflict: 'monitor_id,site,url' });
    }
  }

  // Notes
  const notesMap = readLocalNotes();
  const noteRows = Object.entries(notesMap).map(([key, text]) => {
    const [site, ...rest] = key.split('::');
    return { user_id: userId, site, url: rest.join('::'), text };
  });
  if (noteRows.length > 0) {
    await db.from('notes').upsert(noteRows, { onConflict: 'user_id,site,url' });
  }
}

/** Pull everything from cloud into local storage (cloud-wins for items present in cloud). */
export async function pullAll(userId: string) {
  const { data: monitorsRemote } = await db.from('monitors').select('*').eq('user_id', userId);
  const monitors: Monitor[] = (monitorsRemote || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    urls: r.urls || [],
    createdAt: r.created_at,
    refreshIntervalHours: r.refresh_interval_hours,
    lastCheckedAt: r.last_checked_at ?? undefined,
    shared: !!r.shared,
    organizationId: r.organization_id ?? null,
  }));
  writeLocalMonitors(monitors);

  const { data: historyRemote } = await db.from('history_entries').select('*').eq('user_id', userId);
  const byMonitor = new Map<string, HistoryEntry[]>();
  for (const r of historyRemote || []) {
    const arr = byMonitor.get(r.monitor_id) || [];
    arr.push({
      url: r.url,
      site: r.site as SiteKey,
      title: r.title ?? undefined,
      price: r.price ?? undefined,
      mileage: r.mileage ?? undefined,
      location: r.location ?? undefined,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      removedAt: r.removed_at ?? undefined,
    });
    byMonitor.set(r.monitor_id, arr);
  }
  for (const m of monitors) writeLocalHistory(m.id, byMonitor.get(m.id) || []);

  const { data: notesRemote } = await db.from('notes').select('*').eq('user_id', userId);
  const map: Record<string, string> = {};
  for (const n of notesRemote || []) map[`${n.site}::${n.url}`] = n.text;
  writeLocalNotes(map);
}

/** Push local first (so locally-only data isn't lost), then pull merged state back. */
export async function syncNow(): Promise<{ ok: boolean; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: 'Não autenticado' };
  const timeout = new Promise<{ ok: false; error: string }>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: 'Tempo esgotado (60s)' }), 60000)
  );
  const work = (async () => {
    try {
      await pushAll(userId);
      await pullAll(userId);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || String(e) };
    }
  })();
  return Promise.race([work, timeout]);
}


export function getLastSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

// ===== Backup / Restore (JSON) =====

export function exportBackupBlob(): Blob {
  const monitors = readLocalMonitors();
  const history: Record<string, HistoryEntry[]> = {};
  for (const m of monitors) history[m.id] = readLocalHistory(m.id);
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    monitors,
    history,
    notes: readLocalNotes(),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export function downloadBackup() {
  const blob = exportBackupBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `car-watchdog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importBackupFile(file: File): Promise<{ ok: boolean; error?: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.monitors)) return { ok: false, error: 'Arquivo inválido' };
    writeLocalMonitors(data.monitors);
    const history = data.history || {};
    for (const [mid, entries] of Object.entries(history)) writeLocalHistory(mid, entries as HistoryEntry[]);
    if (data.notes) writeLocalNotes(data.notes);
    // Push to cloud if logged in
    const userId = await getCurrentUserId();
    if (userId) await pushAll(userId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
