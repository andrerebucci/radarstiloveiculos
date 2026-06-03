export type SiteKey = 'olx' | 'webmotors' | 'mercadolivre';

export interface MonitorUrl {
  site: SiteKey;
  url: string;
}

export interface Monitor {
  id: string;
  name: string;
  urls: MonitorUrl[];
  createdAt: string;
  /** Intervalo entre verificações automáticas, em horas. */
  refreshIntervalHours?: number;
  /** ISO timestamp da última verificação executada. */
  lastCheckedAt?: string;
  /** Se verdadeiro, o monitor é visível para todos os membros da organização. */
  shared?: boolean;
  /** Organização à qual o monitor pertence (quando compartilhado). */
  organizationId?: string | null;
}

export interface Listing {
  id: string;
  url: string;
  site: SiteKey;
  firstSeenAt: string;
  lastSeenAt: string;
  priceText?: string;
}

/** Registro de histórico de um anúncio que já foi visto pelo monitor. */
export interface HistoryEntry {
  url: string;
  site: SiteKey;
  title?: string;
  price?: string;
  mileage?: string;
  location?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Preenchido quando o anúncio deixou de aparecer nas buscas. */
  removedAt?: string;
}
