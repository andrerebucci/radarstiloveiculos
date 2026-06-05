import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthReady } from '@/hooks/useAuthReady';

export interface UserOrg {
  id: string;
  name: string;
  code: string;
}

export function useUserOrganizations() {
  const { ready, user } = useAuthReady();
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (userId = user?.id) => {
    setLoading(true);
    if (!userId) {
      setOrgs([]);
      setLoading(false);
      return;
    }
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId);
    const ids = (memberships || []).map((m) => m.org_id);
    if (ids.length === 0) {
      setOrgs([]);
      setLoading(false);
      return;
    }
    const { data: orgsData } = await supabase
      .from('organizations')
      .select('id, name, code')
      .in('id', ids);
    setOrgs((orgsData || []) as UserOrg[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!ready) return;
    load(user?.id);
  }, [ready, user?.id, load]);

  return { orgs, loading, reload: load };
}
