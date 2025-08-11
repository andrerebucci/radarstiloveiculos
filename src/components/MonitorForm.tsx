import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import type { Monitor, MonitorUrl } from '@/types/monitor';

interface Props {
  onAdded?: (monitor: Monitor) => void;
}

export const MonitorForm = ({ onAdded }: Props) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [olx, setOlx] = useState('');
  const [wm, setWm] = useState('');
  const [ml, setMl] = useState('');

  const add = () => {
    const urls: MonitorUrl[] = [];
    if (olx) urls.push({ site: 'olx', url: olx.trim() });
    if (wm) urls.push({ site: 'webmotors', url: wm.trim() });
    if (ml) urls.push({ site: 'mercadolivre', url: ml.trim() });
    if (!name.trim() || urls.length === 0) {
      toast({ title: 'Preencha os campos', description: 'Informe um nome e ao menos uma URL.', duration: 3000 });
      return;
    }
    const monitor: Monitor = {
      id: crypto.randomUUID(),
      name: name.trim(),
      urls,
      createdAt: new Date().toISOString(),
    };

    const list: Monitor[] = JSON.parse(localStorage.getItem('cw_monitors_v1') || '[]');
    list.push(monitor);
    localStorage.setItem('cw_monitors_v1', JSON.stringify(list));
    // Notify other components to refresh without full page reload
    window.dispatchEvent(new Event('cw_monitors_updated'));

    setName(''); setOlx(''); setWm(''); setMl('');
    toast({ title: 'Monitoramento adicionado', description: 'Você já pode verificar novos anúncios.', duration: 3000 });
    onAdded?.(monitor);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar Monitoramento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="Descrição (ex: Corolla XEI 2018-2020 até 90k)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="URL da busca na OLX" value={olx} onChange={(e) => setOlx(e.target.value)} />
        <Input placeholder="URL da busca na Webmotors" value={wm} onChange={(e) => setWm(e.target.value)} />
        <Input placeholder="URL da busca no Mercado Livre" value={ml} onChange={(e) => setMl(e.target.value)} />
        <div className="flex justify-end">
          <Button variant="brand" onClick={add}>Adicionar</Button>
        </div>
      </CardContent>
    </Card>
  );
};
