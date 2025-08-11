import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { FirecrawlService } from '@/utils/FirecrawlService';
import { extractListingsFromHtml } from '@/utils/parsers';
import type { Listing, Monitor, SiteKey } from '@/types/monitor';

const MONITOR_KEY = 'cw_monitors_v1';
const LISTINGS_KEY = 'cw_listings_v1';

type ListingMap = Record<string, Listing[]>; // monitorId -> listings

export const MonitorList = () => {
  const { toast } = useToast();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [listingsByMonitor, setListingsByMonitor] = useState<ListingMap>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const list: Monitor[] = JSON.parse(localStorage.getItem(MONITOR_KEY) || '[]');
      setMonitors(list);
      const lm: ListingMap = JSON.parse(localStorage.getItem(LISTINGS_KEY) || '{}');
      setListingsByMonitor(lm);
    };

    load();

    const onMonitorsUpdated = () => load();
    window.addEventListener('cw_monitors_updated', onMonitorsUpdated as any);

    const onStorage = (e: StorageEvent) => {
      if (e.key === MONITOR_KEY || e.key === LISTINGS_KEY) load();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('cw_monitors_updated', onMonitorsUpdated as any);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const aggregate = useMemo(() => {
    return Object.entries(listingsByMonitor).flatMap(([monitorId, arr]) =>
      arr.map((l) => ({ ...l, monitorId }))
    ).sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt));
  }, [listingsByMonitor]);

  const runCheck = async (m: Monitor) => {
    if (!FirecrawlService.getApiKey()) {
      toast({ title: 'Configure a API Key', description: 'Defina sua Firecrawl API key para rastrear.', duration: 3000 });
      return;
    }
    setLoadingId(m.id);
    try {
      const stored: Listing[] = listingsByMonitor[m.id] || [];
      const known = new Set(stored.map((s) => s.url));
      const now = new Date().toISOString();
      let found: Listing[] = [...stored];

      for (const u of m.urls) {
        const res = await FirecrawlService.crawlWebsite(u.url);
        if (!res.success || !res.data) continue;
        for (const page of res.data.data) {
          const html = page.html || '';
          const items = extractListingsFromHtml(html, u.site as SiteKey);
          for (const it of items) {
            if (!known.has(it.url)) {
              found.push({
                id: it.url,
                url: it.url,
                site: u.site,
                firstSeenAt: now,
                lastSeenAt: now,
                priceText: it.priceText,
              });
              known.add(it.url);
            }
          }
        }
      }

      const updatedMap: ListingMap = { ...listingsByMonitor, [m.id]: found };
      setListingsByMonitor(updatedMap);
      localStorage.setItem(LISTINGS_KEY, JSON.stringify(updatedMap));
      toast({ title: 'Verificação concluída', description: `${found.length - (stored.length)} novos anúncios.`, duration: 3000 });
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro ao verificar', description: 'Tente novamente em instantes.', duration: 3000, variant: 'destructive' as any });
    } finally {
      setLoadingId(null);
    }
  };

  const removeMonitor = (id: string) => {
    const list = monitors.filter(m => m.id !== id);
    setMonitors(list);
    localStorage.setItem(MONITOR_KEY, JSON.stringify(list));
    const lm: ListingMap = { ...listingsByMonitor };
    delete lm[id];
    setListingsByMonitor(lm);
    localStorage.setItem(LISTINGS_KEY, JSON.stringify(lm));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {monitors.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{m.name}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => removeMonitor(m.id)}>Remover</Button>
                  <Button variant="brand" onClick={() => runCheck(m)} disabled={loadingId === m.id}>
                    {loadingId === m.id ? 'Verificando...' : 'Verificar agora'}
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                {m.urls.map(u => u.site).join(' • ')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novos Anúncios</CardTitle>
          <CardDescription>Agregado de todos os monitoramentos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fonte</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Detectado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregate.map((l) => (
                  <TableRow key={`${l.monitorId}-${l.id}`}>
                    <TableCell className="capitalize">{l.site}</TableCell>
                    <TableCell>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                        {l.url}
                      </a>
                    </TableCell>
                    <TableCell>{l.priceText || '-'}</TableCell>
                    <TableCell>{new Date(l.firstSeenAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
