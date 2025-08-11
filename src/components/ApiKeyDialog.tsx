import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { FirecrawlService } from '@/utils/FirecrawlService';

export const ApiKeyDialog = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(FirecrawlService.getApiKey() || '');

  const save = async () => {
    if (!key.trim()) return;
    FirecrawlService.saveApiKey(key.trim());
    const ok = await FirecrawlService.testApiKey(key.trim());
    toast({
      title: ok ? 'API Key configurada' : 'API Key salva',
      description: ok ? 'Conexão com Firecrawl verificada com sucesso.' : 'Não foi possível validar agora, tente rastrear para testar.',
      duration: 3000,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand">Configurar Firecrawl API Key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar Firecrawl API Key</DialogTitle>
          <DialogDescription>
            Insira sua API key do Firecrawl para permitir o rastreamento das páginas de busca.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="sk_..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={save} variant="brand">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
