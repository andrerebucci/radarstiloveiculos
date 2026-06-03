import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export interface UserOrg {
  id: string;
  name: string;
  code: string;
}

export function useUserOrganizations() {
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user) {
      setOrgs([]);
      setLoading(false);
      return;
    }
    const { data: memberships } = await db
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id);
    const ids = (memberships || []).map((m: any) => m.org_id);
    if (ids.length === 0) {
      setOrgs([]);
      setLoading(false);
      return;
    }
    const { data: orgsData } = await db
      .from('organizations')
      .select('id, name, code')
      .in('id', ids);
    setOrgs((orgsData || []) as UserOrg[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
  }, []);

  return { orgs, loading, reload: load };
}
