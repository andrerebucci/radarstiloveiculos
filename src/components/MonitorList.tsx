import { Monitor, SiteKey, HistoryEntry } from '../types/monitor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ExternalLink, Play, Trash2, AlertCircle, Clock, Bug, ArrowUpDown, Search, ChevronUp, ChevronDown, X, History as HistoryIcon, RefreshCw, Save } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ClientScraper } from '../utils/ClientScraper';
import { extractListingsFromHtml, ParsedListing } from '../utils/parsers';
import { differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { loadHistory, reconcileHistory, daysListed, clearHistory } from '../utils/history';

const STORAGE_KEY = 'cw_monitors_v1';

function persistMonitorUpdate(id: string, patch: Partial<Monitor>) {
  try {
    const list: Monitor[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const next = list.map((m) => (m.id === id ? { ...m, ...patch } : m));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('cw_monitors_updated'));
  } catch {}
}

function siteLabel(site: SiteKey) {
  return site === 'mercadolivre' ? 'Mercado Livre' : site === 'olx' ? 'OLX' : 'Webmotors';
}

function formatRemaining(ms: number) {
  if (ms <= 0) return 'agora';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const MonitorList = ({ monitors, onDelete }: { monitors: Monitor[]; onDelete: (id: string) => void }) => {
  const [checkingMonitor, setCheckingMonitor] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, Record<SiteKey, ParsedListing[]>>>({});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<Record<string, { key: string; direction: 'asc' | 'desc' }>>({});
  const [removedListings, setRemovedListings] = useState<Set<string>>(new Set());
  const [consolidatedSort, setConsolidatedSort] = useState<Record<string, { key: string; direction: 'asc' | 'desc' }>>({});
  const [historyByMonitor, setHistoryByMonitor] = useState<Record<string, HistoryEntry[]>>({});
  const [editingIntervalFor, setEditingIntervalFor] = useState<string | null>(null);
  const [intervalDraft, setIntervalDraft] = useState<string>('24');
  const [, forceTick] = useState(0);

  const checkingRef = useRef<string | null>(null);
  useEffect(() => { checkingRef.current = checkingMonitor; }, [checkingMonitor]);

  // Carrega histórico inicial dos monitores
  useEffect(() => {
    const next: Record<string, HistoryEntry[]> = {};
    monitors.forEach((m) => { next[m.id] = loadHistory(m.id); });
    setHistoryByMonitor(next);
  }, [monitors.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const addDebugLog = (message: string) => {
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const removeListing = (listingId: string) => {
    setRemovedListings(prev => new Set([...prev, listingId]));
  };

  const checkMonitor = useCallback(async (monitor: Monitor, opts: { silent?: boolean } = {}) => {
    if (checkingRef.current) return;
    setCheckingMonitor(monitor.id);
    if (!opts.silent) setDebugLogs([]);

    const resultsBySite: Record<SiteKey, ParsedListing[]> = { olx: [], webmotors: [], mercadolivre: [] };
    const sitesChecked: SiteKey[] = [];

    try {
      if (!opts.silent) {
        addDebugLog('Iniciando verificação...');
        toast.info('🔍 Verificando anúncios...');
      }

      for (const url of monitor.urls) {
        try {
          let site: SiteKey = 'olx';
          if (url.url.includes('webmotors')) site = 'webmotors';
          else if (url.url.includes('mercadolivre')) site = 'mercadolivre';
          sitesChecked.push(site);

          if (!opts.silent) {
            addDebugLog(`Processando: ${url.url}`);
            toast.info(`📡 Buscando em ${siteLabel(site)}...`);
          }

          const { html, source } = await ClientScraper.fetchHtml(url.url);
          if (!opts.silent) addDebugLog(`HTML via ${source}: ${html.length} caracteres`);

          const listings = extractListingsFromHtml(html, site);
          resultsBySite[site] = listings;
          if (!opts.silent) {
            addDebugLog(`${listings.length} anúncios em ${site}`);
            toast.success(`✅ ${siteLabel(site)}: ${listings.length} anúncios`);
          }
        } catch (error) {
          addDebugLog(`Erro ao processar ${url.url}: ${error}`);
          if (!opts.silent) toast.error(`❌ Erro em ${url.url}`);
        }
      }

      setLastResults(prev => ({ ...prev, [monitor.id]: resultsBySite }));

      // Reconciliar histórico
      const updated = reconcileHistory(monitor.id, resultsBySite, sitesChecked);
      setHistoryByMonitor(prev => ({ ...prev, [monitor.id]: updated }));

      // Persistir lastCheckedAt
      persistMonitorUpdate(monitor.id, { lastCheckedAt: new Date().toISOString() });

      const total = Object.values(resultsBySite).reduce((acc, l) => acc + l.length, 0);
      if (!opts.silent) {
        if (total > 0) toast.success(`🎉 ${total} anúncios encontrados!`);
        else toast.warning('⚠️ Nenhum anúncio encontrado');
      }
    } catch (error) {
      addDebugLog(`Erro geral: ${error}`);
      if (!opts.silent) toast.error('❌ Erro ao verificar anúncios');
    } finally {
      setCheckingMonitor(null);
    }
  }, []);

  // Auto-refresh: tick a cada 30s para atualizar contadores e disparar verificações vencidas.
  useEffect(() => {
    const id = setInterval(() => {
      forceTick((t) => t + 1);
      const now = Date.now();
      for (const m of monitors) {
        const hours = m.refreshIntervalHours ?? 24;
        const last = m.lastCheckedAt ? new Date(m.lastCheckedAt).getTime() : 0;
        const due = last === 0 ? false : now - last >= hours * 3600 * 1000;
        if (due && !checkingRef.current) {
          checkMonitor(m, { silent: true });
          break; // um por tick
        }
      }
    }, 30000);
    return () => clearInterval(id);
  }, [monitors, checkMonitor]);

  const sortListings = (listings: ParsedListing[], site: string, key: string) => {
    const tableKey = `${site}-${key}`;
    const currentSort = sortConfig[tableKey];
    const direction = currentSort?.key === key && currentSort.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig(prev => ({ ...prev, [tableKey]: { key, direction } }));
    return [...listings].sort((a, b) => {
      let aValue: number = 0, bValue: number = 0;
      switch (key) {
        case 'price':
          aValue = parseFloat(a.price?.replace(/\D/g, '') || '0');
          bValue = parseFloat(b.price?.replace(/\D/g, '') || '0');
          break;
        case 'mileage':
          aValue = parseFloat(a.mileage?.replace(/\D/g, '') || '0');
          bValue = parseFloat(b.mileage?.replace(/\D/g, '') || '0');
          break;
        case 'detectedAt':
          aValue = new Date(a.detectedAt).getTime();
          bValue = new Date(b.detectedAt).getTime();
          break;
      }
      return direction === 'asc' ? aValue - bValue : bValue - aValue;
    });
  };

  const getConsolidatedForMonitor = (monitorId: string): ParsedListing[] => {
    const sites = lastResults[monitorId];
    if (!sites) return [];
    const all: ParsedListing[] = [];
    Object.values(sites).forEach((arr) => all.push(...arr));
    const cfg = consolidatedSort[monitorId] || { key: 'detectedAt', direction: 'desc' as const };
    return all
      .filter((l) => !removedListings.has(`${l.url}-${l.site}`))
      .sort((a, b) => {
        if (cfg.key === 'price') {
          const pa = parseFloat(a.price?.replace(/[R$\s.]/g, '').replace(',', '.') || '0');
          const pb = parseFloat(b.price?.replace(/[R$\s.]/g, '').replace(',', '.') || '0');
          return cfg.direction === 'asc' ? pa - pb : pb - pa;
        }
        if (cfg.key === 'mileage') {
          const ma = parseFloat(a.mileage?.replace(/[^\d]/g, '') || '0');
          const mb = parseFloat(b.mileage?.replace(/[^\d]/g, '') || '0');
          return cfg.direction === 'asc' ? ma - mb : mb - ma;
        }
        if (cfg.key === 'site') {
          return cfg.direction === 'asc' ? a.site.localeCompare(b.site) : b.site.localeCompare(a.site);
        }
        return cfg.direction === 'asc'
          ? new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime()
          : new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
      });
  };

  const toggleConsolidatedSort = (monitorId: string, key: string) => {
    setConsolidatedSort((prev) => {
      const cur = prev[monitorId];
      const direction = cur?.key === key && cur.direction === 'asc' ? 'desc' : 'asc';
      return { ...prev, [monitorId]: { key, direction } };
    });
  };

  const saveIntervalEdit = (monitor: Monitor) => {
    const parsed = Math.max(1, Math.min(720, parseInt(intervalDraft || '24', 10) || 24));
    persistMonitorUpdate(monitor.id, { refreshIntervalHours: parsed });
    setEditingIntervalFor(null);
    toast.success(`Intervalo atualizado para ${parsed}h`);
  };

  const nextRefreshInfo = (m: Monitor) => {
    const hours = m.refreshIntervalHours ?? 24;
    if (!m.lastCheckedAt) return { label: 'Aguardando 1ª verificação', ms: Infinity };
    const nextAt = new Date(m.lastCheckedAt).getTime() + hours * 3600 * 1000;
    const ms = nextAt - Date.now();
    return { label: ms <= 0 ? 'verificando em breve…' : `em ${formatRemaining(ms)}`, ms };
  };

  if (monitors.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum monitor configurado</h3>
          <p className="text-muted-foreground mb-4">Crie seu primeiro monitor para começar a rastrear anúncios de veículos</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {monitors.map((monitor) => {
        const refresh = nextRefreshInfo(monitor);
        const history = historyByMonitor[monitor.id] || [];
        const soldOrGone = history.filter((h) => h.removedAt);
        const consolidated = getConsolidatedForMonitor(monitor.id);
        const hasResults = !!lastResults[monitor.id] && Object.values(lastResults[monitor.id]).some((l) => l.length > 0);

        return (
          <Card key={monitor.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                <span>{monitor.name}</span>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => checkMonitor(monitor)} disabled={checkingMonitor === monitor.id}>
                    {checkingMonitor === monitor.id ? (
                      <><Clock className="h-4 w-4 animate-spin" /> Verificando...</>
                    ) : (
                      <><Play className="h-4 w-4" /> Verificar agora</>
                    )}
                  </Button>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm">
                        <HistoryIcon className="h-4 w-4" /> Histórico
                        {soldOrGone.length > 0 && <Badge variant="secondary" className="ml-1">{soldOrGone.length}</Badge>}
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[600px] sm:w-[640px] overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Histórico — {monitor.name}</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { clearHistory(monitor.id); setHistoryByMonitor((p) => ({ ...p, [monitor.id]: [] })); toast.success('Histórico limpo'); }}
                        >
                          Limpar histórico
                        </Button>
                      </div>
                      {history.length === 0 ? (
                        <p className="text-muted-foreground mt-6">Nenhum anúncio registrado ainda. Execute uma verificação.</p>
                      ) : (
                        <>
                          <h4 className="font-semibold mt-4 mb-2">Saíram das buscas ({soldOrGone.length})</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Site</TableHead>
                                <TableHead>Anúncio</TableHead>
                                <TableHead>Preço</TableHead>
                                <TableHead>Dias no ar</TableHead>
                                <TableHead>Saiu em</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {soldOrGone.map((h, i) => (
                                <TableRow key={`gone-${i}`}>
                                  <TableCell><Badge variant="outline">{siteLabel(h.site)}</Badge></TableCell>
                                  <TableCell className="max-w-[220px] truncate">
                                    <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                      {h.title || h.url}
                                    </a>
                                  </TableCell>
                                  <TableCell>{h.price || '-'}</TableCell>
                                  <TableCell>{daysListed(h)}</TableCell>
                                  <TableCell className="text-xs">{h.removedAt ? format(new Date(h.removedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>

                          <h4 className="font-semibold mt-6 mb-2">Ativos rastreados ({history.length - soldOrGone.length})</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Site</TableHead>
                                <TableHead>Anúncio</TableHead>
                                <TableHead>Preço</TableHead>
                                <TableHead>Dias no ar</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {history.filter((h) => !h.removedAt).map((h, i) => (
                                <TableRow key={`act-${i}`}>
                                  <TableCell><Badge variant="outline">{siteLabel(h.site)}</Badge></TableCell>
                                  <TableCell className="max-w-[220px] truncate">
                                    <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                      {h.title || h.url}
                                    </a>
                                  </TableCell>
                                  <TableCell>{h.price || '-'}</TableCell>
                                  <TableCell>{daysListed(h)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </>
                      )}
                    </SheetContent>
                  </Sheet>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm"><Bug className="h-4 w-4" /> Debug</Button>
                    </SheetTrigger>
                    <SheetContent className="w-[600px] sm:w-[540px]">
                      <SheetHeader><SheetTitle>Logs de Depuração</SheetTitle></SheetHeader>
                      <div className="mt-6 space-y-2 h-[calc(100vh-120px)] overflow-y-auto">
                        {debugLogs.length === 0
                          ? <p className="text-muted-foreground">Nenhum log ainda.</p>
                          : debugLogs.map((log, i) => <div key={i} className="text-xs font-mono bg-muted p-2 rounded">{log}</div>)}
                      </div>
                    </SheetContent>
                  </Sheet>

                  <Button variant="destructive" size="sm" onClick={() => onDelete(monitor.id)}>
                    <Trash2 className="h-4 w-4" /> Deletar
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent>
              {/* Intervalo + próxima atualização */}
              <div className="mb-4 flex items-center gap-3 flex-wrap text-sm">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Atualiza a cada {monitor.refreshIntervalHours ?? 24}h
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Próxima: {refresh.label}
                </Badge>
                {monitor.lastCheckedAt && (
                  <span className="text-xs text-muted-foreground">
                    Última verificação: {format(new Date(monitor.lastCheckedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </span>
                )}
                {editingIntervalFor === monitor.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={intervalDraft}
                      onChange={(e) => setIntervalDraft(e.target.value)}
                      className="h-8 w-20"
                    />
                    <Button size="sm" variant="outline" onClick={() => saveIntervalEdit(monitor)}>
                      <Save className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingIntervalFor(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingIntervalFor(monitor.id);
                      setIntervalDraft(String(monitor.refreshIntervalHours ?? 24));
                    }}
                  >
                    Editar intervalo
                  </Button>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {monitor.urls.map((url, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">
                      {url.url.includes('olx') && '🟢 OLX'}
                      {url.url.includes('webmotors') && '🔵 Webmotors'}
                      {url.url.includes('mercadolivre') && '🟡 Mercado Livre'}
                    </Badge>
                    <a href={url.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 truncate">
                      <ExternalLink className="h-3 w-3" />
                      {url.url.length > 60 ? `${url.url.substring(0, 60)}...` : url.url}
                    </a>
                  </div>
                ))}
              </div>

              {/* Tabelas por site */}
              {hasResults && (
                <div className="mt-4 space-y-4">
                  {Object.entries(lastResults[monitor.id]).map(([site, listings]) => listings.length > 0 && (
                    <Card key={site}>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {site === 'olx' && '🟢 OLX'}
                          {site === 'webmotors' && '🔵 Webmotors'}
                          {site === 'mercadolivre' && '🟡 Mercado Livre'}
                          <Badge variant="secondary">{listings.length} anúncios</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Título</TableHead>
                              <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => {
                                const sorted = sortListings(listings, site, 'price');
                                setLastResults(prev => ({ ...prev, [monitor.id]: { ...prev[monitor.id], [site]: sorted } }));
                              }}>
                                <div className="flex items-center gap-1">Preço <ArrowUpDown className="h-3 w-3" /></div>
                              </TableHead>
                              <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => {
                                const sorted = sortListings(listings, site, 'mileage');
                                setLastResults(prev => ({ ...prev, [monitor.id]: { ...prev[monitor.id], [site]: sorted } }));
                              }}>
                                <div className="flex items-center gap-1">KM <ArrowUpDown className="h-3 w-3" /></div>
                              </TableHead>
                              <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => {
                                const sorted = sortListings(listings, site, 'detectedAt');
                                setLastResults(prev => ({ ...prev, [monitor.id]: { ...prev[monitor.id], [site]: sorted } }));
                              }}>
                                <div className="flex items-center gap-1">Detectado em <ArrowUpDown className="h-3 w-3" /></div>
                              </TableHead>
                              <TableHead>Localização</TableHead>
                              <TableHead>Dias Anunciados</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {listings.map((listing, index) => (
                              <TableRow key={index}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 max-w-xs truncate">
                                      {listing.title || 'Ver anúncio'}
                                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                    </a>
                                    <Button variant="ghost" size="sm" onClick={() => removeListing(`${listing.url}-${listing.site}`)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>{listing.price || '-'}</TableCell>
                                <TableCell>{listing.mileage || '-'}</TableCell>
                                <TableCell>{format(new Date(listing.detectedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell>
                                <TableCell className="text-sm">{listing.location || '-'}</TableCell>
                                <TableCell>{differenceInDays(new Date(), new Date(listing.detectedAt))} dia(s)</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Consolidado por monitor */}
                  {consolidated.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Search className="h-5 w-5" /> Todos os anúncios deste monitoramento
                          <Badge variant="secondary" className="ml-2">{consolidated.length}</Badge>
                        </CardTitle>
                        <CardDescription>Consolidação dos anúncios encontrados em todos os sites deste monitor.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleConsolidatedSort(monitor.id, 'site')}>
                                <div className="flex items-center gap-1">Site
                                  {consolidatedSort[monitor.id]?.key === 'site' && (consolidatedSort[monitor.id].direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                              </TableHead>
                              <TableHead>Título</TableHead>
                              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleConsolidatedSort(monitor.id, 'price')}>
                                <div className="flex items-center gap-1">Preço
                                  {consolidatedSort[monitor.id]?.key === 'price' && (consolidatedSort[monitor.id].direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                              </TableHead>
                              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleConsolidatedSort(monitor.id, 'mileage')}>
                                <div className="flex items-center gap-1">KM
                                  {consolidatedSort[monitor.id]?.key === 'mileage' && (consolidatedSort[monitor.id].direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                              </TableHead>
                              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleConsolidatedSort(monitor.id, 'detectedAt')}>
                                <div className="flex items-center gap-1">Detectado em
                                  {consolidatedSort[monitor.id]?.key === 'detectedAt' && (consolidatedSort[monitor.id].direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                              </TableHead>
                              <TableHead>Localização</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {consolidated.map((listing, index) => (
                              <TableRow key={`${listing.url}-${listing.site}-${index}`}>
                                <TableCell>
                                  <Badge variant={listing.site === 'mercadolivre' ? 'default' : listing.site === 'olx' ? 'secondary' : 'outline'}>
                                    {siteLabel(listing.site)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 max-w-xs truncate">
                                      {listing.title || listing.url}
                                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                    </a>
                                    <Button variant="ghost" size="sm" onClick={() => removeListing(`${listing.url}-${listing.site}`)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium">{listing.price || 'N/A'}</TableCell>
                                <TableCell>{listing.mileage || 'N/A'}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{new Date(listing.detectedAt).toLocaleString('pt-BR')}</TableCell>
                                <TableCell className="text-sm">{listing.location || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default MonitorList;
