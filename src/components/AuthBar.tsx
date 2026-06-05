import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { downloadBackup, importBackupFile, syncNow, getLastSync } from '@/utils/cloudSync';
import { Cloud, CloudOff, Download, Upload, LogIn, LogOut, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthReady } from '@/hooks/useAuthReady';

export const AuthBar = () => {
  const { ready, user } = useAuthReady();
  const [email, setEmail] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getLastSync());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready) return;
    setEmail(user?.email ?? null);
  }, [ready, user?.email]);


  // Auto-push on local changes (debounced) when logged in
  useEffect(() => {
    if (!email) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { runSync(true); }, 2000);
    };
    window.addEventListener('cw_monitors_updated', trigger);
    window.addEventListener('cw_notes_updated', trigger);
    window.addEventListener('cw_history_updated', trigger);
    return () => {
      window.removeEventListener('cw_monitors_updated', trigger);
      window.removeEventListener('cw_notes_updated', trigger);
      window.removeEventListener('cw_history_updated', trigger);
      if (t) clearTimeout(t);
    };
  }, [email]);

  const runSync = async (silent = false) => {
    setSyncing(true);
    const res = await syncNow();
    setSyncing(false);
    if (res.ok) {
      setLastSync(getLastSync());
      if (!silent) toast.success('Dados sincronizados com a nuvem');
    } else if (!silent) {
      toast.error(`Falha na sincronização: ${res.error}`);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    toast.success('Você saiu da conta');
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Importar este arquivo vai substituir seus dados locais. Continuar?')) return;
    const res = await importBackupFile(file);
    if (res.ok) toast.success('Backup importado com sucesso');
    else toast.error(`Erro: ${res.error}`);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {email ? (
        <>
          <Badge variant="secondary" className="gap-1"><Cloud className="h-3 w-3" /> {email}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link to="/organizacao"><Users className="h-4 w-4" /> Minha Organização</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => runSync(false)} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
          {lastSync && (
            <span className="text-xs text-muted-foreground">
              última: {new Date(lastSync).toLocaleTimeString('pt-BR')}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /> Sair</Button>
        </>
      ) : (
        <>
          <Badge variant="outline" className="gap-1"><CloudOff className="h-3 w-3" /> Sem sincronização</Badge>
          <Button variant="outline" size="sm" asChild>
            <Link to="/auth"><LogIn className="h-4 w-4" /> Entrar</Link>
          </Button>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={downloadBackup}><Download className="h-4 w-4" /> Exportar</Button>
      <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" /> Importar
      </Button>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />
    </div>
  );
};
