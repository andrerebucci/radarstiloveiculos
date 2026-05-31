import type { Monitor, HistoryEntry, SiteKey } from '@/types/monitor';
import type { Tables } from '@/integrations/supabase/types';

type DbListing = Tables<'listings'>;

export interface BackupData {
  version: 1;
  exportedAt: string;
  monitors: Monitor[];
  history: Record<string, HistoryEntry[]>;
  notes: Record<string, string>; // key: `${site}::${url}`
}

export class BackupService {
  static exportToJSON(monitors: Monitor[], historyByMonitor: Record<string, HistoryEntry[]>): BackupData {
    const notes: Record<string, string> = {};

    // Collect notes from localStorage
    Object.values(historyByMonitor).forEach((entries) => {
      entries.forEach((entry) => {
        const key = `${entry.site}::${entry.url}`;
        const note = localStorage.getItem(`cw_note_${key}`);
        if (note) notes[key] = note;
      });
    });

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      monitors,
      history: historyByMonitor,
      notes,
    };
  }

  static downloadJSON(data: BackupData, filename?: string): void {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `car-watchdog-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static parseJSON(jsonString: string): BackupData | null {
    try {
      const data = JSON.parse(jsonString) as BackupData;
      if (data.version !== 1) {
        console.error('Unsupported backup version:', data.version);
        return null;
      }
      return data;
    } catch (error) {
      console.error('Error parsing backup JSON:', error);
      return null;
    }
  }

  static async restoreFromJSON(data: BackupData): Promise<{
    monitors: Monitor[];
    historyByMonitor: Record<string, HistoryEntry[]>;
  }> {
    // Restore monitors to localStorage (for immediate use)
    localStorage.setItem('cw_monitors_v1', JSON.stringify(data.monitors));
    window.dispatchEvent(new Event('cw_monitors_updated'));

    // Restore history
    Object.entries(data.history).forEach(([monitorId, entries]) => {
      localStorage.setItem(`cw_history_v1_${monitorId}`, JSON.stringify(entries));
    });

    // Restore notes
    Object.entries(data.notes).forEach(([key, note]) => {
      localStorage.setItem(`cw_note_${key}`, note);
    });
    window.dispatchEvent(new Event('cw_notes_updated'));

    return {
      monitors: data.monitors,
      historyByMonitor: data.history,
    };
  }

  static exportToCSV(monitors: Monitor[], historyByMonitor: Record<string, HistoryEntry[]>): string {
    const lines: string[] = [];

    // Header
    lines.push('Tipo,MonitorID,MonitorNome,Site,URL,Titulo,Preco,KM,Localizacao,PrimeiraVista,UltimaVista,RemovidoEm,Nota');

    // Listings
    Object.entries(historyByMonitor).forEach(([monitorId, entries]) => {
      const monitor = monitors.find((m) => m.id === monitorId);
      const monitorName = monitor?.name || '';

      entries.forEach((entry) => {
        const note = this.getNoteFromLocalStorage(entry.site, entry.url);
        lines.push([
          'listing',
          monitorId,
          this.escapeCSV(monitorName),
          entry.site,
          entry.url,
          this.escapeCSV(entry.title || ''),
          this.escapeCSV(entry.price || ''),
          this.escapeCSV(entry.mileage || ''),
          this.escapeCSV(entry.location || ''),
          entry.firstSeenAt,
          entry.lastSeenAt,
          entry.removedAt || '',
          this.escapeCSV(note),
        ].join(','));
      });
    });

    return lines.join('\n');
  }

  static downloadCSV(csv: string, filename?: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `car-watchdog-backup-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static parseCSV(csvString: string): {
    monitors: Monitor[];
    historyByMonitor: Record<string, HistoryEntry[]>;
  } {
    const lines = csvString.split('\n').slice(1); // Skip header
    const monitors: Monitor[] = [];
    const historyByMonitor: Record<string, HistoryEntry[]> = {};
    const notes: Record<string, string> = {};
    const seenMonitorIds = new Set<string>();

    lines.forEach((line) => {
      if (!line.trim()) return;

      const cols = this.parseCSVLine(line);
      if (cols.length < 13) return;

      const [type, monitorId, monitorName, site, url, title, price, mileage, location, firstSeenAt, lastSeenAt, removedAt, note] = cols;

      if (type !== 'listing') return;
      if (!monitorId || !url || !site) return;

      // Track monitor
      if (!seenMonitorIds.has(monitorId)) {
        seenMonitorIds.add(monitorId);
        monitors.push({
          id: monitorId,
          name: monitorName || 'Imported Monitor',
          urls: [],
          createdAt: firstSeenAt || new Date().toISOString(),
        });
      }

      // Add to history
      if (!historyByMonitor[monitorId]) {
        historyByMonitor[monitorId] = [];
      }

      historyByMonitor[monitorId].push({
        url,
        site: site as SiteKey,
        title: title || undefined,
        price: price || undefined,
        mileage: mileage || undefined,
        location: location || undefined,
        firstSeenAt: firstSeenAt || new Date().toISOString(),
        lastSeenAt: lastSeenAt || new Date().toISOString(),
        removedAt: removedAt || undefined,
      });

      // Track note
      if (note) {
        notes[`${site}::${url}`] = note;
      }
    });

    // Save notes to localStorage
    Object.entries(notes).forEach(([key, note]) => {
      localStorage.setItem(`cw_note_${key}`, note);
    });

    return { monitors, historyByMonitor };
  }

  // ========== Helpers ==========

  private static escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  private static getNoteFromLocalStorage(site: SiteKey, url: string): string {
    const key = `${site}::${url}`;
    // Try both key formats used in the codebase
    return localStorage.getItem(`cw_note_${key}`) || localStorage.getItem(`cw_notes_v1_${key}`) || '';
  }
}
