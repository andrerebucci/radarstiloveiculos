import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthReady } from '@/hooks/useAuthReady';

const db = supabase as any;

export interface UserOrg {
  id: string;
  name: string;
  code: string;
}

export function useUserOrganizations() {
  const { ready, user } = useAuthReady();
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (userId = user?.id) => {
    setLoading(true);
    if (!userId) {
      setOrgs([]);
      setLoading(false);
      return;
    }
    const { data: memberships } = await db
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId);
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
    if (!ready) return;
    load(user?.id);
  }, [ready, user?.id]);

  return { orgs, loading, reload: load };
}
