import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useUserProfile } from '@/hooks/useUserProfile';
import { toast } from 'sonner';
import { ArrowLeft, Copy, LogOut, UserMinus, Plus } from 'lucide-react';

const db = supabase as any;

interface Org { id: string; code: string; name: string; owner_user_id: string }
interface Member { id: string; org_id: string; user_id: string; role: string; email?: string | null; full_name?: string | null }

function genCode() {
  const a = Math.random().toString(36).slice(2, 6).toUpperCase();
  const b = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORG-${a}${b}`;
}

export default function Organization() {
  const { profile, loading } = useUserProfile();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: memberships } = await db.from('organization_members').select('org_id').eq('user_id', profile?.userId);
    const orgIds = (memberships || []).map((m: any) => m.org_id);
    if (orgIds.length === 0) { setOrgs([]); setMembers({}); return; }
    const { data: orgRows } = await db.from('organizations').select('*').in('id', orgIds);
    setOrgs(orgRows || []);
    const { data: memRows } = await db.from('organization_members').select('*').in('org_id', orgIds);
    // enrich with profile info
    const userIds = Array.from(new Set((memRows || []).map((m: any) => m.user_id)));
    const { data: profs } = await db.from('profiles').select('user_id,email,full_name').in('user_id', userIds);
    const pMap = new Map<string, any>((profs || []).map((p: any) => [p.user_id, p]));
    const grouped: Record<string, Member[]> = {};
    for (const m of (memRows || []) as any[]) {
      const p = pMap.get(m.user_id);
      const enriched: Member = { ...m, email: p?.email ?? null, full_name: p?.full_name ?? null };
      (grouped[m.org_id] ||= []).push(enriched);
    }
    setMembers(grouped);
  };

  useEffect(() => { if (profile?.userId) load(); }, [profile?.userId]);

  const createOrg = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const code = genCode();
    const { data, error } = await db.rpc('create_organization', { _name: newName.trim(), _code: code });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNewName('');
    toast.success(`Organização criada. Código: ${code}`);
    load();
  };

  const joinOrg = async () => {
    if (!joinCode.trim() || !profile) return;
    setBusy(true);
    const { data: org, error } = await db.rpc('join_organization_by_code', { _code: joinCode.trim().toUpperCase() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Você entrou em ${org?.name ?? 'organização'}`);
    setJoinCode('');
    load();
  };

  const leaveOrg = async (orgId: string) => {
    if (!confirm('Sair desta organização?')) return;
    const { error } = await db.from('organization_members').delete().eq('org_id', orgId).eq('user_id', profile?.userId);
    if (error) toast.error(error.message); else { toast.success('Você saiu'); load(); }
  };

  const removeMember = async (orgId: string, userId: string) => {
    if (!confirm('Remover este membro?')) return;
    const { error } = await db.from('organization_members').delete().eq('org_id', orgId).eq('user_id', userId);
    if (error) toast.error(error.message); else { toast.success('Membro removido'); load(); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copiado'); };

  if (loading) return <main className="p-8">Carregando…</main>;
  if (!profile) return <main className="p-8">Faça login.</main>;

  return (
    <main className="min-h-screen bg-background p-6">
      <Helmet><title>Organização — Car Watchdog</title></Helmet>
      <div className="container space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Minha Organização</h1>
          <Button asChild variant="outline"><Link to="/"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link></Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Criar organização</CardTitle><CardDescription>Você vira o dono e recebe um código compartilhável.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Nome (ex: Família Silva)" value={newName} onChange={e => setNewName(e.target.value)} />
              <Button onClick={createOrg} disabled={busy} className="w-full"><Plus className="h-4 w-4 mr-2" /> Criar</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Entrar em organização</CardTitle><CardDescription>Cole o código (ex: ORG-AB12CD).</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="ORG-XXXXXX" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
              <Button onClick={joinOrg} disabled={busy} variant="secondary" className="w-full">Entrar</Button>
            </CardContent>
          </Card>
        </div>

        {orgs.map(org => {
          const isOwner = org.owner_user_id === profile.userId;
          return (
            <Card key={org.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle>{org.name} {isOwner && <Badge className="ml-2">Dono</Badge>}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      Código: <code className="bg-muted px-2 py-0.5 rounded">{org.code}</code>
                      <Button size="sm" variant="ghost" onClick={() => copy(org.code)}><Copy className="h-3 w-3" /></Button>
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => leaveOrg(org.id)}><LogOut className="h-4 w-4 mr-1" /> Sair</Button>
                </div>
              </CardHeader>
              <CardContent>
                <h4 className="text-sm font-medium mb-2">Membros ({(members[org.id] || []).length})</h4>
                <ul className="divide-y">
                  {(members[org.id] || []).map(m => (
                    <li key={m.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="text-sm">{m.full_name || m.email || m.user_id}</div>
                        <div className="text-xs text-muted-foreground">{m.email} · {m.role}</div>
                      </div>
                      {isOwner && m.user_id !== profile.userId && (
                        <Button size="sm" variant="ghost" onClick={() => removeMember(org.id, m.user_id)}><UserMinus className="h-4 w-4" /></Button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
