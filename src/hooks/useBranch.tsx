import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from './useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  theme_primary_hsl?: string | null;
  pdf_header_url?: string | null;
}

interface BranchContextType {
  currentBranch: Branch | null;
  availableBranches: Branch[];
  setCurrentBranch: (branch: Branch) => void;
  loading: boolean;
}

const BranchContext = createContext<BranchContextType>({
  currentBranch: null,
  availableBranches: [],
  setCurrentBranch: () => {},
  loading: true,
});

export const useBranch = () => useContext(BranchContext);

// Helper to check if a branch ID is valid (non-null/undefined)
export const isValidBranchId = (branchId: string | null | undefined): branchId is string => {
  return !!branchId;
};

// Color primario por defecto (azul de Tailwind/shadcn)
const DEFAULT_PRIMARY_HSL = '221 74% 54%';

// Aplica el tema de la sucursal a la app
const applyBranchTheme = (branch: Branch | null) => {
  const hsl = branch?.theme_primary_hsl || DEFAULT_PRIMARY_HSL;
  document.documentElement.style.setProperty('--primary', hsl);
  // Para colores primarios (típicamente saturados), el texto blanco funciona mejor
  // Solo usar texto oscuro si el color es muy claro (lightness > 70%)
  const parts = hsl.split(' ');
  const lightness = parseFloat(parts[2] || '54');
  const foreground = lightness > 70 ? '222.2 47.4% 11.2%' : '0 0% 100%';
  document.documentElement.style.setProperty('--primary-foreground', foreground);
};

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const [currentBranch, setCurrentBranchState] = useState<Branch | null>(null);
  const queryClient = useQueryClient();
  const { connectionMode } = useNetworkStatus();

  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Fetch all active branches
  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', connectionMode],
    queryFn: async () => {
      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[useBranch] Getting branches from PostgreSQL local');
        const data = await invoke<Branch[]>('get_branches', {});
        return data.filter(b => b.active).sort((a, b) => a.code.localeCompare(b.code));
      }

      // Modo Supabase
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('active', true)
        .order('code');
      if (error) throw error;
      return (data || []) as Branch[];
    },
  });

  // Initialize from localStorage or default to Central
  useEffect(() => {
    if (branches.length === 0) return;

    const savedBranchId = localStorage.getItem('current-branch-id');
    if (savedBranchId) {
      const saved = branches.find(b => b.id === savedBranchId);
      if (saved) {
        setCurrentBranchState(saved);
        applyBranchTheme(saved);
        return;
      } else {
        // Invalid branch ID in localStorage, remove it
        console.warn('[Branch] Invalid branch ID in localStorage, clearing:', savedBranchId);
        localStorage.removeItem('current-branch-id');
      }
    }

    // Default to first branch (VY or whatever is first)
    const defaultBranch = branches.find(b => b.code === 'VY') || branches[0];
    if (defaultBranch) {
      setCurrentBranchState(defaultBranch);
      localStorage.setItem('current-branch-id', defaultBranch.id);
      applyBranchTheme(defaultBranch);
    }
  }, [branches]);

  const setCurrentBranch = (branch: Branch) => {
    setCurrentBranchState(branch);
    localStorage.setItem('current-branch-id', branch.id);

    // Aplicar tema de la sucursal
    applyBranchTheme(branch);

    // Invalidate specific queries that depend on branch
    // Use setTimeout to avoid navigation interruption
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['caja-summary'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    }, 0);
  };

  return (
    <BranchContext.Provider
      value={{
        currentBranch,
        availableBranches: branches,
        setCurrentBranch,
        loading: isLoading,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};
