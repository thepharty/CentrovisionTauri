import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CRMPipeline {
  id: string;
  patient_id: string;
  procedure_type_id: string;
  doctor_id: string | null;
  branch_id: string;
  current_stage: string;
  eye_side: 'OD' | 'OI' | 'OU';
  status: string;
  priority: string;
  notes: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: {
    id: string;
    first_name: string;
    last_name: string;
    code: string | null;
    phone: string | null;
  };
  procedure_type?: {
    id: string;
    name: string;
    color: string;
  };
  doctor?: {
    user_id: string;
    full_name: string;
  };
  branch?: {
    id: string;
    name: string;
  };
}

export interface CRMPipelineStage {
  id: string;
  pipeline_id: string;
  stage_name: string;
  status: string;
  completed_at: string | null;
  notes: string | null;
  amount: number | null;
  stage_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_by_profile?: {
    full_name: string | null;
  };
}

export interface CRMPipelineNote {
  id: string;
  pipeline_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
}

export interface CreatePipelineData {
  patient_id: string;
  procedure_type_id: string;
  doctor_id?: string | null;
  branch_id: string;
  eye_side: 'OD' | 'OI' | 'OU';
  priority?: string;
  notes?: string;
  stages?: string[]; // Custom stages from procedure type
}

export const useCRMPipelines = (branchId?: string, status?: string) => {
  return useQuery({
    queryKey: ['crm-pipelines', branchId, status],
    queryFn: async () => {
      let query = supabase
        .from('crm_pipelines')
        .select(`
          *,
          patient:patients(id, first_name, last_name, code, phone),
          procedure_type:crm_procedure_types(id, name, color),
          branch:branches(id, name),
          doctor:profiles!doctor_id(user_id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CRMPipeline[];
    },
  });
};

export const useCRMPipelineStages = (pipelineId: string) => {
  return useQuery({
    queryKey: ['crm-pipeline-stages', pipelineId],
    queryFn: async () => {
      // First get the stages
      const { data: stages, error } = await supabase
        .from('crm_pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('stage_order', { ascending: true });

      if (error) throw error;

      // Get unique updated_by user ids
      const updatedByIds = [...new Set(stages?.filter(s => s.updated_by).map(s => s.updated_by) || [])];
      
      // Fetch profiles for those users
      let profilesMap: Record<string, string> = {};
      if (updatedByIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', updatedByIds);
        
        profiles?.forEach(p => {
          profilesMap[p.user_id] = p.full_name || '';
        });
      }

      // Merge profile info into stages
      return (stages || []).map(stage => ({
        ...stage,
        updated_by_profile: stage.updated_by ? { full_name: profilesMap[stage.updated_by] || null } : undefined,
      })) as CRMPipelineStage[];
    },
    enabled: !!pipelineId,
  });
};

export const useCRMPipelineNotes = (pipelineId: string) => {
  return useQuery({
    queryKey: ['crm-pipeline-notes', pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_pipeline_notes')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CRMPipelineNote[];
    },
    enabled: !!pipelineId,
  });
};

export const useCreatePipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePipelineData) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Separate stages from the rest of the data (stages go to crm_pipeline_stages, not crm_pipelines)
      const { stages, ...pipelineData } = data;

      // Get the first stage name - default to 'info' if not provided
      const stagesFromData = stages || ['info', 'anticipo', 'pedido', 'ya_clinica', 'cirugia'];
      const firstStage = stagesFromData[0];

      // Create pipeline with explicit current_stage
      const { data: pipeline, error } = await supabase
        .from('crm_pipelines')
        .insert({
          ...pipelineData,
          created_by: user?.id,
          current_stage: firstStage,
        })
        .select()
        .single();

      if (error) throw error;

      // Create initial stages using custom stages or default
      const stageInserts = stagesFromData.map((stage, index) => ({
        pipeline_id: pipeline.id,
        stage_name: stage,
        status: index === 0 ? 'in_progress' : 'pending',
        stage_order: index,
        created_by: user?.id,
        updated_by: index === 0 ? user?.id : null,
      }));

      await supabase.from('crm_pipeline_stages').insert(stageInserts);

      return pipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-pipelines'] });
      toast.success('Pipeline creado exitosamente');
    },
    onError: (error) => {
      console.error('Error creating pipeline:', error);
      toast.error('Error al crear el pipeline');
    },
  });
};

export const useUpdatePipelineStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pipelineId,
      newStage,
      notes,
      amount
    }: {
      pipelineId: string;
      newStage: string;
      notes?: string;
      amount?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // IMPORTANTE: Usar .select().single() para verificar que el UPDATE funcionó
      // RLS puede bloquear silenciosamente sin devolver error
      const { data: updatedPipeline, error: pipelineError } = await supabase
        .from('crm_pipelines')
        .update({ current_stage: newStage })
        .eq('id', pipelineId)
        .select('id, current_stage')
        .single();

      if (pipelineError) {
        console.error('Error updating pipeline:', pipelineError);
        throw new Error(`No se pudo actualizar la etapa: ${pipelineError.message}`);
      }

      // Verificar que el update realmente ocurrió (RLS puede bloquearlo silenciosamente)
      if (!updatedPipeline || updatedPipeline.current_stage !== newStage) {
        throw new Error('No tienes permisos para actualizar este pipeline. Contacta al administrador.');
      }

      // Get current stages
      const { data: stages } = await supabase
        .from('crm_pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('stage_order', { ascending: true });

      if (stages) {
        const stageIndex = stages.findIndex(s => s.stage_name === newStage);

        // Update all previous stages to completed
        for (let i = 0; i < stageIndex; i++) {
          if (stages[i].status !== 'completed') {
            await supabase
              .from('crm_pipeline_stages')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_by: user?.id
              })
              .eq('id', stages[i].id);
          }
        }

        // Update current stage
        await supabase
          .from('crm_pipeline_stages')
          .update({
            status: 'in_progress',
            notes: notes || null,
            amount: amount || null,
            updated_by: user?.id,
          })
          .eq('pipeline_id', pipelineId)
          .eq('stage_name', newStage);
      }

      return { pipelineId, newStage };
    },
    // Optimistic update: actualizar UI inmediatamente antes de que el servidor responda
    onMutate: async ({ pipelineId, newStage }) => {
      // Cancelar cualquier refetch en progreso para evitar sobrescribir el optimistic update
      await queryClient.cancelQueries({ queryKey: ['crm-pipelines'] });

      // Guardar snapshot del estado anterior (para rollback si hay error)
      const previousQueries = queryClient.getQueriesData<CRMPipeline[]>({ queryKey: ['crm-pipelines'] });

      // Actualizar optimisticamente TODAS las queries que coincidan con ['crm-pipelines']
      queryClient.setQueriesData<CRMPipeline[]>(
        { queryKey: ['crm-pipelines'] },
        (old) => {
          if (!old) return old;
          return old.map(pipeline =>
            pipeline.id === pipelineId
              ? { ...pipeline, current_stage: newStage }
              : pipeline
          );
        }
      );

      return { previousQueries };
    },
    onError: (error, _variables, context) => {
      // Rollback al estado anterior si hay error
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      console.error('Error updating stage:', error);
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la etapa');
    },
    onSuccess: () => {
      toast.success('Etapa actualizada');
    },
    onSettled: (_data, _error, variables) => {
      // Siempre refetch después de éxito o error para sincronizar con el servidor
      queryClient.invalidateQueries({ queryKey: ['crm-pipelines'] });
      // Usar variables en lugar de data para asegurar que siempre tengamos el pipelineId
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline-stages', variables.pipelineId] });
    },
  });
};

export const useAddPipelineNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pipelineId, note }: { pipelineId: string; note: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('crm_pipeline_notes')
        .insert({
          pipeline_id: pipelineId,
          note,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline-notes', variables.pipelineId] });
      toast.success('Nota agregada');
    },
    onError: (error) => {
      console.error('Error adding note:', error);
      toast.error('Error al agregar la nota');
    },
  });
};

export const useCompletePipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pipelineId: string) => {
      const { error } = await supabase
        .from('crm_pipelines')
        .update({ status: 'completado', current_stage: 'cirugia' })
        .eq('id', pipelineId);

      if (error) throw error;

      // Mark all stages as completed
      await supabase
        .from('crm_pipeline_stages')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('pipeline_id', pipelineId);

      return pipelineId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-pipelines'] });
      toast.success('Pipeline completado');
    },
    onError: (error) => {
      console.error('Error completing pipeline:', error);
      toast.error('Error al completar el pipeline');
    },
  });
};

export const useCancelPipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pipelineId, reason }: { pipelineId: string; reason: string }) => {
      const { error } = await supabase
        .from('crm_pipelines')
        .update({ 
          status: 'cancelado',
          cancellation_reason: reason 
        })
        .eq('id', pipelineId);

      if (error) throw error;
      return pipelineId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-pipelines'] });
      toast.success('Pipeline cancelado');
    },
    onError: (error) => {
      console.error('Error cancelling pipeline:', error);
      toast.error('Error al cancelar el pipeline');
    },
  });
};
