import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  theme: 'light' | 'dark' | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getSessionKey = (value: Session | null): string =>
  value ? `${value.user.id}:${value.access_token}` : 'signed-out';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const lastSessionKeyRef = useRef<string>('unset');

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error.message);
        if (mountedRef.current) {
          setProfile(null);
        }
        return;
      }

      if (mountedRef.current) {
        setProfile((data as UserProfile | null) ?? null);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      if (mountedRef.current) {
        setProfile(null);
      }
    }
  }, []);

  const applySession = useCallback(async (nextSession: Session | null, force = false) => {
    const nextKey = getSessionKey(nextSession);
    if (!force && lastSessionKeyRef.current === nextKey) {
      if (mountedRef.current) {
        setLoading(false);
      }
      return;
    }

    lastSessionKeyRef.current = nextKey;

    if (!mountedRef.current) {
      return;
    }

    setSession(nextSession);
    const nextUser = nextSession?.user ?? null;
    setUser(nextUser);

    if (nextUser) {
      await fetchProfile(nextUser.id);
    } else {
      setProfile(null);
    }

    if (mountedRef.current) {
      setLoading(false);
    }
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchProfile(user.id);
  }, [fetchProfile, user]);

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await applySession(data.session ?? null, true);
      } catch (error) {
        console.error('Error initializing auth session:', error);
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    void initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession ?? null);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthContextType>(() => ({
    user,
    profile,
    session,
    loading,
    signOut,
    refreshProfile,
  }), [loading, profile, refreshProfile, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
