import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { FirecrawlService } from '@/utils/FirecrawlService';
import { ClientScraper } from '@/utils/ClientScraper';
import { extractListingsFromHtml } from '@/utils/parsers';
import { CarDetailsTable } from '@/components/CarDetailsTable';
import type { Listing, Monitor, SiteKey } from '@/types/monitor';

const MONITOR_KEY = 'cw_monitors_v1';
const LISTINGS_KEY = 'cw_listings_v1';

type ListingMap = Record<string, Listing[]>; // monitorId -> listings

export const MonitorList = () => {
  const { toast } = useToast();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [listingsByMonitor, setListingsByMonitor] = useState<ListingMap>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  type DebugInfo = { lastHtmlBytes?: number; lastItemCount?: number; lastError?: string; lastUrl?: string };
  const [debugOpen, setDebugOpen] = useState<Record<string, boolean>>({});
  const [debugInfo, setDebugInfo] = useState<Record<string, DebugInfo>>({});

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
    const hasKey = !!FirecrawlService.getApiKey();
    if (!hasKey) {
      toast({ title: 'Modo sem Firecrawl', description: 'Usando proxy público para baixar HTML.', duration: 3000 });
    }
    setLoadingId(m.id);
    try {
      const stored: Listing[] = listingsByMonitor[m.id] || [];
      const known = new Set(stored.map((s) => s.url));
      const now = new Date().toISOString();
      let found: Listing[] = [...stored];

      let dbg: { lastHtmlBytes?: number; lastItemCount?: number; lastError?: string; lastUrl?: string } = {};

      for (const u of m.urls) {
        if (hasKey) {
          let handledByFirecrawl = false;
          try {
            const res = await FirecrawlService.crawlWebsite(u.url);
            if (res.success && res.data && (res.data.data?.length ?? 0) > 0) {
              for (const page of res.data.data) {
                const raw = (page.html || page.markdown || (page as any).content || (page as any).text || '') as string;
                const items = extractListingsFromHtml(raw, u.site as SiteKey);
                dbg = {
                  lastHtmlBytes: raw ? raw.length : 0,
                  lastItemCount: items.length,
                  lastError: undefined,
                  lastUrl: (page as any).url || u.url,
                };
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
              handledByFirecrawl = true;
            } else {
              const errText = !res.success ? String((res as any).error || 'Falha desconhecida') : 'Sem páginas retornadas';
              dbg = { ...dbg, lastError: errText, lastUrl: u.url };
            }
          } catch (e: any) {
            const errText = e?.message || 'Erro desconhecido';
            dbg = { ...dbg, lastError: errText, lastUrl: u.url };
          }

          if (!handledByFirecrawl) {
            try {
              const { html, source } = await ClientScraper.fetchHtml(u.url);
              const raw = html || '';
              const items = extractListingsFromHtml(raw, u.site as SiteKey);
              dbg = {
                lastHtmlBytes: raw ? raw.length : 0,
                lastItemCount: items.length,
                lastError: undefined,
                lastUrl: `${u.url} (${source})`,
              };
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
            } catch (err: any) {
              const msg = err?.message || 'Falha ao baixar HTML';
              dbg = { ...dbg, lastError: msg, lastUrl: u.url };
              toast({ title: 'Erro ao verificar', description: msg, duration: 3000, variant: 'destructive' as any });
            }
          }
        } else {
          try {
            const { html, source } = await ClientScraper.fetchHtml(u.url);
            const raw = html || '';
            const items = extractListingsFromHtml(raw, u.site as SiteKey);
            dbg = {
              lastHtmlBytes: raw ? raw.length : 0,
              lastItemCount: items.length,
              lastError: undefined,
              lastUrl: `${u.url} (${source})`,
            };
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
          } catch (err: any) {
            const msg = err?.message || 'Falha ao baixar HTML';
            dbg = { ...dbg, lastError: msg, lastUrl: u.url };
            toast({ title: 'Erro ao verificar', description: msg, duration: 3000, variant: 'destructive' as any });
          }
        }
      }

      const updatedMap: ListingMap = { ...listingsByMonitor, [m.id]: found };
      setListingsByMonitor(updatedMap);
      localStorage.setItem(LISTINGS_KEY, JSON.stringify(updatedMap));
      setDebugInfo((prev) => ({ ...prev, [m.id]: dbg }));

      const newCount = found.length - stored.length;
      if (newCount > 0) {
        toast({ title: 'Verificação concluída', description: `${newCount} novos anúncios.`, duration: 3000 });
      } else {
        toast({ title: 'Nenhum novo anúncio', description: 'Nada novo foi encontrado desta vez.', duration: 2500 });
      }
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
                  <Button variant="outline" onClick={() => setDebugOpen((p) => ({ ...p, [m.id]: !p[m.id] }))}>
                    {debugOpen[m.id] ? 'Ocultar depuração' : 'Depuração'}
                  </Button>
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
              {debugOpen[m.id] && (
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <div>Última URL: {debugInfo[m.id]?.lastUrl || '-'}</div>
                  <div>Tamanho do conteúdo: {debugInfo[m.id]?.lastHtmlBytes ?? 0} bytes</div>
                  <div>Itens detectados: {debugInfo[m.id]?.lastItemCount ?? 0}</div>
                  <div>Erro: {debugInfo[m.id]?.lastError || '-'}</div>
                </div>
              )}
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

      {aggregate.length > 0 && (
        <CarDetailsTable urls={aggregate.map(l => l.url)} />
      )}
    </div>
  );
};
