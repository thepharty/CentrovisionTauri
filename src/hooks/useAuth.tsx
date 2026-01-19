import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole } from '@/types/database';
import { useNavigate } from 'react-router-dom';
import {
  isTauri,
  cacheAuthSession,
  getCachedSession,
  clearCachedSession,
  getCachedUser,
  checkNetworkStatus,
  triggerInitialSync,
} from '@/lib/dataSource';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  roles: AppRole[]; // All roles for the user
  isLoggingOut: boolean;
  isOfflineMode: boolean; // True when using cached session offline
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  role: null,
  roles: [],
  isLoggingOut: false,
  isOfflineMode: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const navigate = useNavigate();

  const hasRole = (checkRole: AppRole): boolean => roles.includes(checkRole);

  const roleFetchRef = useRef<{ inProgress: boolean; userId?: string; lastFetch?: number }>({ inProgress: false });
  const ROLE_CACHE_DURATION = 2 * 60 * 1000; // 2 minutos
  const ROLE_DEBOUNCE_TIME = 10 * 1000; // 10 segundos

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth Event]', event, session?.user?.email);
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (event === 'SIGNED_IN' && session?.user) {
        // Keep loading true until role is fetched
        setLoading(true);
        fetchUserRoleOnce(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setRole(null);
        setRoles([]);
        setUser(null);
        setSession(null);
        roleFetchRef.current = { inProgress: false };
        
        // Limpiar localStorage cache
        try {
          const keys = Object.keys(localStorage);
          keys.forEach(key => {
            if (key.startsWith('role_cache_')) {
              localStorage.removeItem(key);
            }
          });
        } catch (err) {
          console.warn('[Auth] Error cleaning cache on SIGNED_OUT:', err);
        }
        
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('[Auth] Token refreshed successfully');
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('[Auth Init] Session:', session?.user?.email);

      if (session?.user) {
        setSession(session);
        setUser(session?.user ?? null);
        setIsOfflineMode(false);
        fetchUserRoleOnce(session.user.id);

        // In Tauri mode, cache the session for offline use
        if (isTauri()) {
          try {
            const { data: rolesData } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', session.user.id);

            const userRoles = rolesData?.map(r => r.role) || [];

            const { data: profileData } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('user_id', session.user.id)
              .single();

            await cacheAuthSession(
              session.user.id,
              session.user.email || '',
              session.access_token,
              session.refresh_token || '',
              userRoles,
              profileData?.full_name
            );
            console.log('[Auth] Session cached for offline use');

            // Trigger initial sync to populate local SQLite database
            try {
              const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
              if (apiKey) {
                console.log('[Auth] Triggering initial sync...');
                const syncResult = await triggerInitialSync(apiKey);
                console.log('[Auth] Initial sync completed:', syncResult);
              }
            } catch (syncErr) {
              console.warn('[Auth] Initial sync failed (will retry later):', syncErr);
            }
          } catch (err) {
            console.warn('[Auth] Failed to cache session:', err);
          }
        }
      } else {
        // No active session - check for cached session in Tauri mode
        if (isTauri()) {
          try {
            const isOnline = await checkNetworkStatus();

            if (!isOnline) {
              // Offline - try to use cached session
              const cachedUser = await getCachedUser();

              if (cachedUser) {
                console.log('[Auth] Using cached session for offline mode:', cachedUser.email);

                // Create a minimal user object for offline mode
                const offlineUser = {
                  id: cachedUser.id,
                  email: cachedUser.email,
                  aud: 'authenticated',
                  role: 'authenticated',
                  created_at: '',
                  app_metadata: {},
                  user_metadata: { full_name: cachedUser.full_name },
                } as User;

                setUser(offlineUser);
                setRoles(cachedUser.roles as AppRole[]);
                setRole(
                  cachedUser.roles.includes('admin')
                    ? 'admin' as AppRole
                    : (cachedUser.roles[0] as AppRole) || null
                );
                setIsOfflineMode(true);
                setLoading(false);
                return;
              }
            }
          } catch (err) {
            console.warn('[Auth] Failed to check cached session:', err);
          }
        }

        setSession(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRoleOnce = async (userId: string) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Debouncing: No hacer más de 1 fetch cada 10 segundos por usuario
    const now = Date.now();
    if (roleFetchRef.current.userId === userId && 
        roleFetchRef.current.lastFetch && 
        (now - roleFetchRef.current.lastFetch) < ROLE_DEBOUNCE_TIME) {
      console.log('[Auth] Skipping role fetch due to debounce');
      setLoading(false);
      return;
    }

    // Ya hay un fetch en progreso
    if (roleFetchRef.current.inProgress) {
      console.log('[Auth] Role fetch already in progress');
      return;
    }

    // Si ya tenemos el rol y es el mismo usuario, no refetch
    if (roleFetchRef.current.userId === userId && role) {
      setLoading(false);
      return;
    }

    // Revisar cache en localStorage
    try {
      const cachedRole = localStorage.getItem(`role_cache_${userId}`);
      const cachedRoles = localStorage.getItem(`roles_cache_${userId}`);
      const cachedTimestamp = localStorage.getItem(`role_cache_timestamp_${userId}`);
      
      if (cachedRole && cachedTimestamp) {
        const age = Date.now() - parseInt(cachedTimestamp, 10);
        if (age < ROLE_CACHE_DURATION) {
          console.log('[Auth] Using cached role:', cachedRole);
          setRole(cachedRole as AppRole);
          if (cachedRoles) {
            try {
              const parsedRoles = JSON.parse(cachedRoles) as AppRole[];
              setRoles(parsedRoles);
              console.log('[Auth] Using cached roles:', parsedRoles);
            } catch {
              setRoles([cachedRole as AppRole]);
            }
          } else {
            setRoles([cachedRole as AppRole]);
          }
          roleFetchRef.current.userId = userId;
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('[Auth] Error reading role cache:', err);
    }

    roleFetchRef.current.inProgress = true;
    roleFetchRef.current.lastFetch = now;
    console.log('[Auth] Fetching role for user:', userId);
    
    try {
      // Get ALL roles for the user (they might have multiple)
      const { data, error, status } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) {
        if ((error as any).code === '429' || status === 429) {
          console.warn('[Auth] Rate limit hit, retrying with longer backoff...');
          for (let i = 0; i < 3; i++) {
            await new Promise((r) => setTimeout(r, Math.pow(3, i) * 1000));
            const retry = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', userId);
            if (!retry.error && retry.data && retry.data.length > 0) {
              // Priorizar admin si existe
              const fetchedRoles = retry.data.map(r => r.role as AppRole);
              const fetchedRole = fetchedRoles.includes('admin' as AppRole) 
                ? 'admin' as AppRole 
                : fetchedRoles[0];
              console.log('[Auth] Roles fetched after retry:', fetchedRoles, '- Using:', fetchedRole);
              setRoles(fetchedRoles);
              setRole(fetchedRole);
              try {
                localStorage.setItem(`role_cache_${userId}`, fetchedRole);
                localStorage.setItem(`roles_cache_${userId}`, JSON.stringify(fetchedRoles));
                localStorage.setItem(`role_cache_timestamp_${userId}`, Date.now().toString());
              } catch (err) {
                console.warn('[Auth] Error saving role to cache:', err);
              }
              setLoading(false);
              return;
            }
          }
          console.error('[Auth] Failed to fetch role after retries');
        } else {
          console.error('[Auth] Error fetching user role:', error);
        }
      } else if (data && data.length > 0) {
        // Priorizar admin si el usuario tiene múltiples roles
        const fetchedRoles = data.map(r => r.role as AppRole);
        const fetchedRole = fetchedRoles.includes('admin' as AppRole) 
          ? 'admin' as AppRole 
          : fetchedRoles[0];
        console.log('[Auth] Roles fetched successfully:', fetchedRoles, '- Using:', fetchedRole);
        setRoles(fetchedRoles);
        setRole(fetchedRole);
        try {
          localStorage.setItem(`role_cache_${userId}`, fetchedRole);
          localStorage.setItem(`roles_cache_${userId}`, JSON.stringify(fetchedRoles));
          localStorage.setItem(`role_cache_timestamp_${userId}`, Date.now().toString());
        } catch (err) {
          console.warn('[Auth] Error saving role to cache:', err);
        }
      }
    } catch (err) {
      console.error('[Auth] Unexpected error fetching user role:', err);
    } finally {
      roleFetchRef.current.inProgress = false;
      roleFetchRef.current.userId = userId;
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Navigation will occur after auth state updates and role is fetched
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string, userRole: AppRole) => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        }
      }
    });
    
    if (!error && data.user) {
      // Create user role
      await supabase
        .from('user_roles')
        .insert({
          user_id: data.user.id,
          role: userRole,
        });
    }
    
    return { error };
  };

  const signOut = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      // Limpiar cache antes de hacer signOut
      const userId = user?.id;
      if (userId) {
        localStorage.removeItem(`role_cache_${userId}`);
        localStorage.removeItem(`roles_cache_${userId}`);
        localStorage.removeItem(`role_cache_timestamp_${userId}`);
      }

      // Clear Tauri cached session
      if (isTauri()) {
        try {
          await clearCachedSession();
          console.log('[Auth] Tauri cached session cleared');
        } catch (err) {
          console.warn('[Auth] Failed to clear Tauri cached session:', err);
        }
      }

      // Resetear refs
      roleFetchRef.current = { inProgress: false };

      // Intentar logout en servidor (skip if offline mode)
      let error = null;
      if (!isOfflineMode) {
        const result = await supabase.auth.signOut();
        error = result.error;
      }

      // Limpiar estado local siempre
      setRole(null);
      setIsOfflineMode(false);
      setUser(null);
      setSession(null);
      
      if (error) {
        console.warn('[Auth] Logout error (cleaning local state anyway):', error);
      }
    } catch (err) {
      console.error('[Auth] Unexpected logout error:', err);
    } finally {
      setIsLoggingOut(false);
      navigate('/auth');
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, roles, isLoggingOut, isOfflineMode, signIn, signUp, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};
