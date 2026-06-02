import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useUserProfile } from '@/hooks/useUserProfile';
import { toast } from 'sonner';
import { Check, X, ArrowLeft } from 'lucide-react';

const db = supabase as any;

interface ProfileRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function Admin() {
  const { profile, loading } = useUserProfile();
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await db.from('profiles').select('*').order('created_at', { ascending: false });
    setRows(data || []);
  };

  useEffect(() => {
    if (profile?.isAdmin) load();
  }, [profile?.isAdmin]);

  if (loading) return <main className="p-8">Carregando…</main>;
  if (!profile) return <main className="p-8">Faça login para acessar o painel.</main>;
  if (!profile.isAdmin) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-muted-foreground">Você não tem permissão para acessar o painel admin.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link></Button>
      </main>
    );
  }

  const setStatus = async (userId: string, status: 'approved' | 'rejected') => {
    setBusy(userId);
    const { error } = await db.from('profiles').update({ status }).eq('user_id', userId);
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success(status === 'approved' ? 'Usuário aprovado' : 'Usuário recusado');
      load();
    }
  };

  const pending = rows.filter(r => r.status === 'pending');
  const others = rows.filter(r => r.status !== 'pending');

  return (
    <main className="min-h-screen bg-background p-6">
      <Helmet><title>Painel admin — Car Watchdog</title></Helmet>
      <div className="container space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Painel de Administração</h1>
          <Button asChild variant="outline"><Link to="/"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link></Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Pendentes ({pending.length})</CardTitle></CardHeader>
          <CardContent>
            {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cadastro pendente.</p> : (
              <ul className="divide-y">
                {pending.map(r => (
                  <li key={r.user_id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{r.full_name || r.email || r.user_id}</div>
                      <div className="text-sm text-muted-foreground">{r.email} · cadastrado em {new Date(r.created_at).toLocaleString('pt-BR')}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" disabled={busy === r.user_id} onClick={() => setStatus(r.user_id, 'approved')}><Check className="h-4 w-4 mr-1" /> Aprovar</Button>
                      <Button size="sm" variant="destructive" disabled={busy === r.user_id} onClick={() => setStatus(r.user_id, 'rejected')}><X className="h-4 w-4 mr-1" /> Recusar</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Outros usuários ({others.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {others.map(r => (
                <li key={r.user_id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.full_name || r.email || r.user_id}</div>
                    <div className="text-sm text-muted-foreground">{r.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === 'approved' ? 'default' : 'destructive'}>{r.status}</Badge>
                    {r.status === 'approved' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.user_id, 'rejected')}>Bloquear</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.user_id, 'approved')}>Reativar</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
