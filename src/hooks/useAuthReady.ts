import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthReadyState {
  ready: boolean;
  session: Session | null;
  user: User | null;
}

export function useAuthReady() {
  const [state, setState] = useState<AuthReadyState>({
    ready: false,
    session: null,
    user: null,
  });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({
        ready: true,
        session: data.session ?? null,
        user: data.session?.user ?? null,
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        ready: true,
        session: session ?? null,
        user: session?.user ?? null,
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}