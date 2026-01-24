import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useBranch, isValidBranchId } from "./useBranch";
import { isProcedureInSurgeries } from "@/lib/crmStages";
import { useNetworkStatus } from "./useNetworkStatus";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type FlowCategory = 'surgeries' | 'supplies';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Types for Tauri commands
interface CRMUnreadActivity {
  id: string;
  procedure_name: string | null;
}

interface CRMActivityLogLocal {
  id: string;
  pipeline_id: string;
  activity_type: string;
  from_stage: string | null;
  to_stage: string | null;
  reason: string | null;
  created_by: string | null;
  branch_id: string;
  created_at: string;
  eye_side: string | null;
  patient?: {
    first_name: string;
    last_name: string;
  };
  procedure_type?: {
    name: string;
    color: string;
  };
  creator?: {
    full_name: string;
  };
}

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
  const { connectionMode } = useNetworkStatus();
  const queryClient = useQueryClient();

  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Get last read timestamp for user
  const { data: lastRead } = useQuery({
    queryKey: ["crm-last-read", user?.id, connectionMode],
    queryFn: async () => {
      if (!user?.id) return null;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[useCRMNotifications] Getting last read from PostgreSQL local');
        const data = await invoke<string | null>('get_crm_activity_read', {
          userId: user.id,
        });
        return data;
      }

      // Modo Supabase
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
    queryKey: ["crm-unread-activities", user?.id, currentBranch?.id, lastRead, connectionMode],
    queryFn: async () => {
      if (!user?.id || !currentBranch?.id) return [];

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[useCRMNotifications] Getting unread activities from PostgreSQL local');
        const data = await invoke<CRMUnreadActivity[]>('get_crm_unread_activities', {
          branchId: currentBranch.id,
          lastRead: lastRead || null,
        });
        // Transform to match expected format
        return data.map(a => ({
          id: a.id,
          pipeline: {
            procedure_type: a.procedure_name ? { name: a.procedure_name } : null,
          },
        }));
      }

      // Modo Supabase
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
    enabled: !!user?.id && isValidBranchId(currentBranch?.id),
    refetchInterval: isLocalMode ? false : 30000, // Solo refetch en modo Supabase
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
    queryKey: ["crm-recent-activities", currentBranch?.id, connectionMode],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[useCRMNotifications] Getting recent activities from PostgreSQL local');
        const data = await invoke<CRMActivityLogLocal[]>('get_crm_recent_activities', {
          branchId: currentBranch.id,
        });
        // Transform to match expected CRMActivity format
        return data.map(a => ({
          id: a.id,
          pipeline_id: a.pipeline_id,
          activity_type: a.activity_type as CRMActivity['activity_type'],
          from_stage: a.from_stage,
          to_stage: a.to_stage,
          reason: a.reason,
          created_by: a.created_by,
          branch_id: a.branch_id,
          created_at: a.created_at,
          pipeline: {
            eye_side: a.eye_side || '',
            patient: a.patient,
            procedure_type: a.procedure_type,
          },
          creator: a.creator,
        })) as CRMActivity[];
      }

      // Modo Supabase
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
    enabled: isValidBranchId(currentBranch?.id),
  });

  // Realtime subscription for instant badge updates
  useEffect(() => {
    if (!isValidBranchId(currentBranch?.id)) return;

    // Modo LOCAL: escuchar eventos Tauri db:change desde PostgreSQL LISTEN/NOTIFY
    if (isLocalMode) {
      let unlisten: UnlistenFn | null = null;
      let debounceTimer: NodeJS.Timeout;

      const setupListener = async () => {
        try {
          unlisten = await listen<{ table: string; operation: string; id?: string }>('db:change', (event) => {
            const { table } = event.payload;
            const crmTables = ['crm_activity_log', 'crm_pipelines', 'crm_pipeline_stages', 'crm_pipeline_notes', 'crm_activity_read'];

            if (crmTables.includes(table)) {
              console.log(`[useCRMNotifications] Local DB change: ${table}`);
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['crm-unread-activities'] });
                queryClient.invalidateQueries({ queryKey: ['crm-recent-activities'] });
                queryClient.invalidateQueries({ queryKey: ['crm-last-read'] });
              }, 300);
            }
          });
          console.log('[useCRMNotifications] Listening for local CRM changes via Tauri events');
        } catch (error) {
          console.error('[useCRMNotifications] Error setting up Tauri listener:', error);
        }
      };

      setupListener();
      return () => {
        clearTimeout(debounceTimer);
        unlisten?.();
      };
    }

    // Modo SUPABASE: canal WebSocket
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
  }, [currentBranch?.id, queryClient, isLocalMode]);

  // Mark activities as read
  const markAsRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;

      // En modo local, usar Tauri command
      if (isLocalMode) {
        console.log('[useCRMNotifications] Marking as read via PostgreSQL local');
        await invoke('upsert_crm_activity_read', {
          userId: user.id,
        });
        return;
      }

      // Modo Supabase
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
