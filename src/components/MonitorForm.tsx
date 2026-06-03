import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import type { Monitor, MonitorUrl } from '@/types/monitor';

interface Props {
  onAdded?: (monitor: Monitor) => void;
}

export const MonitorForm = ({ onAdded }: Props) => {
  const { toast } = useToast();
  const { orgs } = useUserOrganizations();
  const [name, setName] = useState('');
  const [olx, setOlx] = useState('');
  const [wm, setWm] = useState('');
  const [ml, setMl] = useState('');
  const [intervalHours, setIntervalHours] = useState<string>('24');
  const [shared, setShared] = useState(false);
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    if (orgs.length > 0 && !orgId) setOrgId(orgs[0].id);
    if (orgs.length === 0) {
      setShared(false);
      setOrgId('');
    }
  }, [orgs, orgId]);

  const add = () => {
    const urls: MonitorUrl[] = [];
    if (olx) urls.push({ site: 'olx', url: olx.trim() });
    if (wm) urls.push({ site: 'webmotors', url: wm.trim() });
    if (ml) urls.push({ site: 'mercadolivre', url: ml.trim() });
    if (!name.trim() || urls.length === 0) {
      toast({ title: 'Preencha os campos', description: 'Informe um nome e ao menos uma URL.', duration: 3000 });
      return;
    }
    const parsedHours = Math.max(1, Math.min(720, parseInt(intervalHours || '24', 10) || 24));
    const willShare = shared && !!orgId;
    const monitor: Monitor = {
      id: crypto.randomUUID(),
      name: name.trim(),
      urls,
      createdAt: new Date().toISOString(),
      refreshIntervalHours: parsedHours,
      shared: willShare,
      organizationId: willShare ? orgId : null,
    };

    const list: Monitor[] = JSON.parse(localStorage.getItem('cw_monitors_v1') || '[]');
    list.push(monitor);
    localStorage.setItem('cw_monitors_v1', JSON.stringify(list));
    window.dispatchEvent(new Event('cw_monitors_updated'));

    setName(''); setOlx(''); setWm(''); setMl(''); setIntervalHours('24');
    toast({ title: 'Monitoramento adicionado', description: willShare ? 'Compartilhado com a organização.' : 'Você já pode verificar novos anúncios.', duration: 3000 });
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
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Atualizar a cada (horas):</label>
          <Input
            type="number"
            min={1}
            max={720}
            className="w-28"
            value={intervalHours}
            onChange={(e) => setIntervalHours(e.target.value)}
          />
        </div>

        {orgs.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="share-toggle" className="text-sm">Compartilhar com a organização</Label>
                <p className="text-xs text-muted-foreground">Outros membros da organização poderão ver este monitor.</p>
              </div>
              <Switch id="share-toggle" checked={shared} onCheckedChange={setShared} />
            </div>
            {shared && orgs.length > 1 && (
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a organização" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name} ({o.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {shared && orgs.length === 1 && (
              <p className="text-xs text-muted-foreground">Organização: <strong>{orgs[0].name}</strong> ({orgs[0].code})</p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="brand" onClick={add}>Adicionar</Button>
        </div>
      </CardContent>
    </Card>
  );
};
