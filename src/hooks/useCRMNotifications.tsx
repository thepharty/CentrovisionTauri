import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useBranch } from "./useBranch";
import { isProcedureInSurgeries } from "@/lib/crmStages";

type FlowCategory = 'surgeries' | 'supplies';

export interface CRMActivity {
  id: string;
  pipeline_id: string;
  activity_type: 'pipeline_created' | 'stage_changed' | 'pipeline_completed' | 'pipeline_cancelled';
  from_stage: string | null;
  to_stage: string | null;
  reason: string | null;
  created_by: string | null;
  branch_id: string;
  created_at: string;
  pipeline?: {
    patient?: {
      first_name: string;
      last_name: string;
    };
    procedure_type?: {
      name: string;
      color: string;
    };
    eye_side: string;
  };
  creator?: {
    full_name: string;
  };
}

export function useCRMNotifications() {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const queryClient = useQueryClient();

  // Get last read timestamp for user
  const { data: lastRead } = useQuery({
    queryKey: ["crm-last-read", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("crm_activity_read")
        .select("last_read_at")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data?.last_read_at || null;
    },
    enabled: !!user?.id,
  });

  // Get unread activities with procedure info for category counts
  const { data: unreadActivities = [] } = useQuery({
    queryKey: ["crm-unread-activities", user?.id, currentBranch?.id, lastRead],
    queryFn: async () => {
      if (!user?.id || !currentBranch?.id) return [];
      
      let query = supabase
        .from("crm_activity_log")
        .select(`
          id,
          pipeline:crm_pipelines(
            procedure_type:crm_procedure_types(name)
          )
        `)
        .eq("branch_id", currentBranch.id);
      
      if (lastRead) {
        query = query.gt("created_at", lastRead);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !!currentBranch?.id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Calculate counts by category
  const unreadCount = unreadActivities.length;
  
  const unreadCountSurgeries = unreadActivities.filter(a => {
    const procedureName = (a.pipeline as any)?.procedure_type?.name;
    return procedureName && isProcedureInSurgeries(procedureName);
  }).length;
  
  const unreadCountSupplies = unreadActivities.filter(a => {
    const procedureName = (a.pipeline as any)?.procedure_type?.name;
    return procedureName && !isProcedureInSurgeries(procedureName);
  }).length;

  // Get recent activities (last 48 hours)
  const { data: recentActivities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ["crm-recent-activities", currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      const twoDaysAgo = new Date();
      twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);

      const { data, error} = await supabase
        .from("crm_activity_log")
        .select(`
          *,
          pipeline:crm_pipelines(
            eye_side,
            patient:patients(first_name, last_name),
            procedure_type:crm_procedure_types(name, color)
          ),
          creator:profiles!created_by(full_name)
        `)
        .eq("branch_id", currentBranch.id)
        .gte("created_at", twoDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as CRMActivity[];
    },
    enabled: !!currentBranch?.id,
  });

  // Realtime subscription for instant badge updates
  useEffect(() => {
    if (!currentBranch?.id) return;

    const channel = supabase
      .channel('crm-activity-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crm_activity_log'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['crm-unread-activities'] });
          queryClient.invalidateQueries({ queryKey: ['crm-recent-activities'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBranch?.id, queryClient]);

  // Mark activities as read
  const markAsRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from("crm_activity_read")
        .upsert({
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-last-read"] });
      queryClient.invalidateQueries({ queryKey: ["crm-unread-activities"] });
    },
  });

  // Filter activities by category
  const getFilteredActivities = (category: FlowCategory) => {
    return recentActivities.filter(activity => {
      const procedureName = activity.pipeline?.procedure_type?.name;
      if (!procedureName) return true;
      
      if (category === 'surgeries') {
        return isProcedureInSurgeries(procedureName);
      } else {
        return !isProcedureInSurgeries(procedureName);
      }
    });
  };

  return {
    unreadCount,
    unreadCountSurgeries,
    unreadCountSupplies,
    recentActivities,
    getFilteredActivities,
    isLoadingActivities,
    lastRead,
    markAsRead: markAsRead.mutate,
  };
}
