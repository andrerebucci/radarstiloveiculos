import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: roles }] = await Promise.all([
      db.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      db.from('user_roles').select('role').eq('user_id', user.id),
    ]);
    setProfile({
      userId: user.id,
      email: user.email ?? null,
      fullName: p?.full_name ?? null,
      status: (p?.status as UserStatus) ?? 'pending',
      isAdmin: !!(roles || []).find((r: any) => r.role === 'admin'),
    });
    setLoading(false);
  };

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
  }, []);

  return { profile, loading, reload: load };
}
