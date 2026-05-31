import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';
import { AuthService } from '@/services/AuthService';

type Profile = Tables<'profiles'>;

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    AuthService.getSession().then((sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        AuthService.getProfile().then(setProfile);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = AuthService.onAuthStateChange(
      async (event, sess) => {
        setSession(sess);
        setUser(sess?.user ?? null);

        if (event === 'SIGNED_IN' && sess?.user) {
          const prof = await AuthService.getProfile();
          setProfile(prof);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    const result = await AuthService.signInWithGoogle();
    if (!result.success) {
      console.error('Google sign-in failed:', result.error);
      setLoading(false);
    }
    // Redirect happens automatically, loading will be resolved on return
  };

  const signOut = async () => {
    setLoading(true);
    await AuthService.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
