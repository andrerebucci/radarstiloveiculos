export type SiteKey = 'olx' | 'webmotors' | 'mercadolivre';

export interface MonitorUrl {
  site: SiteKey;
  url: string;
}

export interface Monitor {
  id: string;
  name: string;
  urls: MonitorUrl[]; // at least one
  createdAt: string;
}

export interface Listing {
  id: string; // hash of url
  url: string;
  site: SiteKey;
  firstSeenAt: string;
  lastSeenAt: string;
  priceText?: string;
}
