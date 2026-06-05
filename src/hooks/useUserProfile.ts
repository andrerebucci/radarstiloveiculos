import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthReady } from '@/hooks/useAuthReady';

const db = supabase as any;

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

  const load = async (userId = user?.id, userEmail = user?.email ?? null) => {
    setLoading(true);
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: roles }] = await Promise.all([
      db.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      db.from('user_roles').select('role').eq('user_id', userId),
    ]);
    setProfile({
      userId,
      email: userEmail,
      fullName: p?.full_name ?? null,
      status: (p?.status as UserStatus) ?? 'pending',
      isAdmin: !!(roles || []).find((r: any) => r.role === 'admin'),
    });
    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    load(user?.id, user?.email ?? null);
  }, [ready, user?.id, user?.email]);

  return { profile, loading, reload: load };
}
