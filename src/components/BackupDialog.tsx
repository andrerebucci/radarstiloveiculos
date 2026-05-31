import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Download, Upload, FileJson, FileSpreadsheet, TriangleAlert as AlertTriangle } from 'lucide-react';
import { BackupService } from '@/utils/backup';
import { loadHistory } from '@/utils/history';
import type { Monitor } from '@/types/monitor';

interface Props {
  monitors: Monitor[];
  onRestore: (monitors: Monitor[], historyByMonitor: Record<string, string[]>) => void;
}

export const BackupDialog = ({ monitors, onRestore }: Props) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const historyByMonitor: Record<string, any[]> = {};
    monitors.forEach((m) => {
      historyByMonitor[m.id] = loadHistory(m.id);
    });

    const data = BackupService.exportToJSON(monitors, historyByMonitor);
    BackupService.downloadJSON(data);

    toast({
      title: 'Backup exportado',
      description: `${monitors.length} monitor(es) exportado(s) com sucesso.`,
    });
  };

  const handleExportCSV = () => {
    const historyByMonitor: Record<string, any[]> = {};
    monitors.forEach((m) => {
      historyByMonitor[m.id] = loadHistory(m.id);
    });

    const csv = BackupService.exportToCSV(monitors, historyByMonitor);
    BackupService.downloadCSV(csv);

    toast({
      title: 'Backup exportado',
      description: 'Arquivo CSV gerado com sucesso.',
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const content = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();

      let monitors: Monitor[] = [];
      let historyByMonitor: Record<string, any[]> = {};

      if (ext === 'json') {
        const data = BackupService.parseJSON(content);
        if (!data) {
          toast({
            title: 'Arquivo invalido',
            description: 'Nao foi possivel ler o arquivo JSON.',
            variant: 'destructive',
          });
          return;
        }
        const restored = await BackupService.restoreFromJSON(data);
        monitors = restored.monitors;
        historyByMonitor = restored.historyByMonitor;
      } else if (ext === 'csv') {
        const parsed = BackupService.parseCSV(content);
        monitors = parsed.monitors;
        historyByMonitor = parsed.historyByMonitor;

        // Save to localStorage
        localStorage.setItem('cw_monitors_v1', JSON.stringify(monitors));
        Object.entries(historyByMonitor).forEach(([id, entries]) => {
          localStorage.setItem(`cw_history_v1_${id}`, JSON.stringify(entries));
        });
        window.dispatchEvent(new Event('cw_monitors_updated'));
      } else {
        toast({
          title: 'Formato nao suportado',
          description: 'Use arquivos .json ou .csv.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Backup restaurado',
        description: `${monitors.length} monitor(es) importado(s) com sucesso.`,
      });

      onRestore(monitors, historyByMonitor as any);
      setOpen(false);
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Erro na importacao',
        description: 'Nao foi possivel importar o arquivo.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Backup
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Backup e Restauracao</DialogTitle>
          <DialogDescription>
            Exporte seus dados para um arquivo ou restaure a partir de um backup anterior.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="export" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">Exportar</TabsTrigger>
            <TabsTrigger value="import">Importar</TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escolha o formato para exportar seus monitoramentos e historico de anuncios.
            </p>
            <div className="flex gap-3">
              <Button onClick={handleExportJSON} variant="outline" className="flex-1">
                <FileJson className="h-4 w-4 mr-2" />
                JSON
              </Button>
              <Button onClick={handleExportCSV} variant="outline" className="flex-1">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              JSON: completo, permite restauracao. CSV: legivel em Excel, somente para analise.
            </p>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Carregue um arquivo de backup (.json ou .csv) para restaurar seus dados.
            </p>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Atencao: a importacao substituira seus dados atuais. Faca um backup antes de continuar.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleImportFile}
                className="hidden"
                id="backup-file-input"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-2" />
                {importing ? 'Importando...' : 'Selecionar arquivo'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
