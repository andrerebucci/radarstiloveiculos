import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthReady } from '@/hooks/useAuthReady';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  userId: string;
  email: string | null;
  fullName: string | null;
  status: UserStatus;
  isAdmin: boolean;
}

export function useUserProfile() {
  const { ready, user } = useAuthReady();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (userId = user?.id, userEmail = user?.email ?? null) => {
    setLoading(true);
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);
    setProfile({
      userId,
      email: userEmail,
      fullName: p?.full_name ?? null,
      status: (p?.status as UserStatus) ?? 'pending',
      isAdmin: !!(roles || []).find((r) => r.role === 'admin'),
    });
    setLoading(false);
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!ready) return;
    load(user?.id, user?.email ?? null);
  }, [ready, user?.id, user?.email, load]);

  return { profile, loading, reload: load };
}
