import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Branch {
  id: string;
  code: 'central' | 'santa_lucia';
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
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

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const [currentBranch, setCurrentBranchState] = useState<Branch | null>(null);
  const queryClient = useQueryClient();

  // Fetch all active branches
  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('active', true)
        .order('code');
      if (error) throw error;
      return data as Branch[];
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
        return;
      }
    }

    // Default to Central
    const central = branches.find(b => b.code === 'central');
    if (central) {
      setCurrentBranchState(central);
      localStorage.setItem('current-branch-id', central.id);
    }
  }, [branches]);

  const setCurrentBranch = (branch: Branch) => {
    setCurrentBranchState(branch);
    localStorage.setItem('current-branch-id', branch.id);
    // Invalidate all queries to refetch with new branch
    queryClient.invalidateQueries();
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
