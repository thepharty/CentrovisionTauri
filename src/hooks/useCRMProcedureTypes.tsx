import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CRMProcedureType {
  id: string;
  name: string;
  color: string;
  default_stages: string[];
  display_order: number;
  active: boolean;
  created_at: string;
}

export const useCRMProcedureTypes = () => {
  return useQuery({
    queryKey: ['crm-procedure-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_procedure_types')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data as CRMProcedureType[];
    },
  });
};
