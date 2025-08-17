import { Monitor, SiteKey } from '../types/monitor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ExternalLink, Play, Trash2, AlertCircle, Clock, Bug, ArrowUpDown, Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ClientScraper } from '../utils/ClientScraper';
import { extractListingsFromHtml, ParsedListing } from '../utils/parsers';
import { differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';

const MonitorList = ({ monitors, onDelete }: { monitors: Monitor[]; onDelete: (id: string) => void }) => {
  const [checkingMonitor, setCheckingMonitor] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, Record<SiteKey, ParsedListing[]>>>({});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<Record<string, { key: string; direction: 'asc' | 'desc' }>>({});
  const [removedListings, setRemovedListings] = useState<Set<string>>(new Set());
  const [consolidatedSortConfig, setConsolidatedSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'detectedAt', direction: 'desc' });

  const addDebugLog = (message: string) => {
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const removeListing = (listingId: string) => {
    setRemovedListings(prev => new Set([...prev, listingId]));
  };

  const getConsolidatedListings = () => {
    const allListings: ParsedListing[] = [];
    
    Object.values(lastResults).forEach(monitorResults => {
      Object.values(monitorResults).forEach(listings => {
        allListings.push(...listings);
      });
    });

    return allListings
      .filter(listing => !removedListings.has(`${listing.url}-${listing.site}`))
      .sort((a, b) => {
        if (consolidatedSortConfig.key === 'price') {
          const priceA = parseFloat(a.price?.replace(/[R$\s.]/g, '').replace(',', '.') || '0');
          const priceB = parseFloat(b.price?.replace(/[R$\s.]/g, '').replace(',', '.') || '0');
          return consolidatedSortConfig.direction === 'asc' ? priceA - priceB : priceB - priceA;
        }
        if (consolidatedSortConfig.key === 'mileage') {
          const mileageA = parseFloat(a.mileage?.replace(/[^\d]/g, '') || '0');
          const mileageB = parseFloat(b.mileage?.replace(/[^\d]/g, '') || '0');
          return consolidatedSortConfig.direction === 'asc' ? mileageA - mileageB : mileageB - mileageA;
        }
        if (consolidatedSortConfig.key === 'detectedAt') {
          return consolidatedSortConfig.direction === 'asc' 
            ? new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime()
            : new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
        }
        if (consolidatedSortConfig.key === 'site') {
          return consolidatedSortConfig.direction === 'asc' 
            ? a.site.localeCompare(b.site)
            : b.site.localeCompare(a.site);
        }
        return 0;
      });
  };

  const sortListings = (listings: ParsedListing[], site: string, key: string) => {
    const tableKey = `${site}-${key}`;
    const currentSort = sortConfig[tableKey];
    const direction = currentSort?.key === key && currentSort.direction === 'asc' ? 'desc' : 'asc';
    
    setSortConfig(prev => ({
      ...prev,
      [tableKey]: { key, direction }
    }));

    return [...listings].sort((a, b) => {
      let aValue, bValue;
      
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
        default:
          return 0;
      }
      
      if (direction === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
  };

  const checkMonitor = async (monitor: Monitor) => {
    setCheckingMonitor(monitor.id);
    setDebugLogs([]);
    const resultsBySite: Record<SiteKey, ParsedListing[]> = {
      olx: [],
      webmotors: [],
      mercadolivre: []
    };
    
    try {
      addDebugLog('Iniciando verificação...');
      toast.info('🔍 Verificando anúncios...', { 
        description: 'Usando proxies para obter resultados' 
      });
      
      for (const url of monitor.urls) {
        try {
          addDebugLog(`Processando: ${url}`);
          
          // Detect site type from URL
          let site: SiteKey = 'olx';
          if (url.url.includes('webmotors')) site = 'webmotors';
          else if (url.url.includes('mercadolivre')) site = 'mercadolivre';
          
          addDebugLog(`Site detectado: ${site}`);
          toast.info(`📡 Buscando em ${site}...`);
          
          const { html, source } = await ClientScraper.fetchHtml(url.url);
          addDebugLog(`HTML obtido via ${source}: ${html.length} caracteres`);
          
          const listings = extractListingsFromHtml(html, site);
          resultsBySite[site] = listings;
          
          addDebugLog(`${listings.length} anúncios encontrados em ${site}`);
          toast.success(`✅ ${site}: ${listings.length} anúncios`);
          
        } catch (error) {
          const errorMsg = `Erro ao processar ${url.url}: ${error}`;
          addDebugLog(errorMsg);
          toast.error(`❌ Erro em ${url.url.includes('webmotors') ? 'webmotors' : url.url.includes('mercadolivre') ? 'mercadolivre' : 'olx'}`);
        }
      }
      
      setLastResults(prev => ({ ...prev, [monitor.id]: resultsBySite }));
      
      const totalResults = Object.values(resultsBySite).reduce((acc, listings) => acc + listings.length, 0);
      
      if (totalResults > 0) {
        addDebugLog(`Verificação concluída: ${totalResults} anúncios total`);
        toast.success(`🎉 ${totalResults} anúncios encontrados!`);
      } else {
        addDebugLog('Verificação concluída: nenhum anúncio encontrado');
        toast.warning('⚠️ Nenhum anúncio encontrado');
      }
      
    } catch (error) {
      const errorMsg = `Erro geral: ${error}`;
      addDebugLog(errorMsg);
      toast.error('❌ Erro ao verificar anúncios');
    } finally {
      setCheckingMonitor(null);
    }
  };

  if (monitors.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum monitor configurado</h3>
          <p className="text-muted-foreground mb-4">
            Crie seu primeiro monitor para começar a rastrear anúncios de veículos
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {monitors.map((monitor) => (
        <Card key={monitor.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{monitor.name}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkMonitor(monitor)}
                  disabled={checkingMonitor === monitor.id}
                  className="flex items-center gap-2"
                >
                  {checkingMonitor === monitor.id ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Verificar agora
                    </>
                  )}
                </Button>
                
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Bug className="h-4 w-4" />
                      Debug
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-[600px] sm:w-[540px]">
                    <SheetHeader>
                      <SheetTitle>Logs de Depuração</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-2 h-[calc(100vh-120px)] overflow-y-auto">
                      {debugLogs.length === 0 ? (
                        <p className="text-muted-foreground">Nenhum log ainda. Execute uma verificação para ver os logs.</p>
                      ) : (
                        debugLogs.map((log, index) => (
                          <div key={index} className="text-xs font-mono bg-muted p-2 rounded">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(monitor.id)}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Deletar
                </Button>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-2 mb-4">
              {monitor.urls.map((url, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">
                    {url.url.includes('olx') && '🟢 OLX'}
                    {url.url.includes('webmotors') && '🔵 Webmotors'}
                    {url.url.includes('mercadolivre') && '🟡 Mercado Livre'}
                  </Badge>
                  <a 
                    href={url.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 truncate"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {url.url.length > 60 ? `${url.url.substring(0, 60)}...` : url.url}
                  </a>
                </div>
              ))}
            </div>
          </CardContent>

          {lastResults[monitor.id] && Object.entries(lastResults[monitor.id]).some(([_, listings]) => listings.length > 0) && (
            <div className="mt-4 space-y-4">
              {Object.entries(lastResults[monitor.id]).map(([site, listings]) => 
                listings.length > 0 && (
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
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => {
                                const sortedListings = sortListings(listings, site, 'price');
                                setLastResults(prev => ({
                                  ...prev,
                                  [monitor.id]: {
                                    ...prev[monitor.id],
                                    [site]: sortedListings
                                  }
                                }));
                              }}
                            >
                              <div className="flex items-center gap-1">
                                Preço
                                <ArrowUpDown className="h-3 w-3" />
                              </div>
                            </TableHead>
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => {
                                const sortedListings = sortListings(listings, site, 'mileage');
                                setLastResults(prev => ({
                                  ...prev,
                                  [monitor.id]: {
                                    ...prev[monitor.id],
                                    [site]: sortedListings
                                  }
                                }));
                              }}
                            >
                              <div className="flex items-center gap-1">
                                KM
                                <ArrowUpDown className="h-3 w-3" />
                              </div>
                            </TableHead>
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => {
                                const sortedListings = sortListings(listings, site, 'detectedAt');
                                setLastResults(prev => ({
                                  ...prev,
                                  [monitor.id]: {
                                    ...prev[monitor.id],
                                    [site]: sortedListings
                                  }
                                }));
                              }}
                            >
                              <div className="flex items-center gap-1">
                                Detectado em
                                <ArrowUpDown className="h-3 w-3" />
                              </div>
                            </TableHead>
                            <TableHead>Dias Anunciados</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {listings.map((listing, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <a 
                                    href={listing.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 max-w-xs truncate"
                                  >
                                    {listing.title || 'Ver anúncio'}
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeListing(`${listing.url}-${listing.site}`)}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>{listing.price || '-'}</TableCell>
                              <TableCell>{listing.mileage || '-'}</TableCell>
                              <TableCell>
                                {format(new Date(listing.detectedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                              </TableCell>
                              <TableCell>
                                {differenceInDays(new Date(), new Date(listing.detectedAt))} dia(s)
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          )}
        </Card>
      ))}

      {/* Painel Consolidado */}
      {Object.keys(lastResults).length > 0 && getConsolidatedListings().length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Todos os Anúncios Encontrados
              <Badge variant="secondary" className="ml-2">
                {getConsolidatedListings().length} anúncios
              </Badge>
            </CardTitle>
            <CardDescription>
              Consolidação de todos os anúncios encontrados em todos os sites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setConsolidatedSortConfig({
                        key: 'site',
                        direction: consolidatedSortConfig.key === 'site' && consolidatedSortConfig.direction === 'asc' ? 'desc' : 'asc'
                      });
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Site
                      {consolidatedSortConfig.key === 'site' && (
                        consolidatedSortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setConsolidatedSortConfig({
                        key: 'price',
                        direction: consolidatedSortConfig.key === 'price' && consolidatedSortConfig.direction === 'asc' ? 'desc' : 'asc'
                      });
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Preço
                      {consolidatedSortConfig.key === 'price' && (
                        consolidatedSortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setConsolidatedSortConfig({
                        key: 'mileage',
                        direction: consolidatedSortConfig.key === 'mileage' && consolidatedSortConfig.direction === 'asc' ? 'desc' : 'asc'
                      });
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Quilometragem
                      {consolidatedSortConfig.key === 'mileage' && (
                        consolidatedSortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setConsolidatedSortConfig({
                        key: 'detectedAt',
                        direction: consolidatedSortConfig.key === 'detectedAt' && consolidatedSortConfig.direction === 'asc' ? 'desc' : 'asc'
                      });
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Detectado em
                      {consolidatedSortConfig.key === 'detectedAt' && (
                        consolidatedSortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getConsolidatedListings().map((listing, index) => (
                  <TableRow key={`${listing.url}-${listing.site}-${index}`}>
                    <TableCell>
                      <Badge variant={listing.site === 'mercadolivre' ? 'default' : listing.site === 'olx' ? 'secondary' : 'outline'}>
                        {listing.site === 'mercadolivre' ? 'Mercado Livre' : listing.site === 'olx' ? 'OLX' : 'Webmotors'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <a
                          href={listing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 max-w-xs truncate"
                        >
                          {listing.title || listing.url}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeListing(`${listing.url}-${listing.site}`)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {listing.price || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {listing.mileage || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(listing.detectedAt).toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MonitorList;