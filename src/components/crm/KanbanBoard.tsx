import { useState, useMemo, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CRMPipeline, useUpdatePipelineStage } from '@/hooks/useCRMPipelines';
import { useCRMProcedureTypes } from '@/hooks/useCRMProcedureTypes';
import { StageColumn } from './StageColumn';
import { PipelineDetailSheet } from './PipelineDetailSheet';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  STAGES_REFRACTIVE,
  STAGES_WITH_SUPPLIES,
  getStagesForProcedure,
  getStageOrderForProcedure,
  isProcedureInSurgeries,
  FlowCategory
} from '@/lib/crmStages';

interface KanbanBoardProps {
  pipelines: CRMPipeline[];
  procedureFilter: string;
  searchQuery: string;
  flowCategory: FlowCategory;
}

const getColorClass = (color: string) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    cyan: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  };
  return colorMap[color] || colorMap.blue;
};

export const KanbanBoard = ({ pipelines, procedureFilter, searchQuery, flowCategory }: KanbanBoardProps) => {
  const [activePipeline, setActivePipeline] = useState<CRMPipeline | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<CRMPipeline | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const updateStage = useUpdatePipelineStage();
  const { data: procedureTypes } = useCRMProcedureTypes();

  // Keep selectedPipeline in sync with updated pipelines data
  useEffect(() => {
    if (selectedPipeline && pipelines) {
      const updatedPipeline = pipelines.find(p => p.id === selectedPipeline.id);
      if (updatedPipeline && updatedPipeline.current_stage !== selectedPipeline.current_stage) {
        setSelectedPipeline(updatedPipeline);
      }
    }
  }, [pipelines, selectedPipeline]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  // Determine which stages to show based on flow category
  const currentStages = useMemo(() => {
    if (procedureFilter !== 'all') {
      return getStagesForProcedure(procedureFilter);
    }
    // Use stages based on flow category
    return flowCategory === 'surgeries' ? STAGES_REFRACTIVE : STAGES_WITH_SUPPLIES;
  }, [procedureFilter, flowCategory]);

  // Filter pipelines
  const filteredPipelines = useMemo(() => {
    const filtered = pipelines.filter((pipeline) => {
      // Only show active pipelines (both 'activo' in Spanish and 'active' in English)
      if (pipeline.status !== 'activo' && pipeline.status !== 'active') {
        return false;
      }

      // Flow category filter
      const procedureName = pipeline.procedure_type?.name;
      if (procedureName) {
        const isInSurgeries = isProcedureInSurgeries(procedureName);
        if (flowCategory === 'surgeries' && !isInSurgeries) {
          return false;
        }
        if (flowCategory === 'supplies' && isInSurgeries) {
          return false;
        }
      }

      // Procedure filter
      if (procedureFilter !== 'all' && procedureName !== procedureFilter) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const patientName = `${pipeline.patient?.first_name} ${pipeline.patient?.last_name}`.toLowerCase();
        const patientCode = pipeline.patient?.code?.toLowerCase() || '';
        return patientName.includes(query) || patientCode.includes(query);
      }

      return true;
    });

    return filtered;
  }, [pipelines, procedureFilter, searchQuery, flowCategory]);

  // Group pipelines by stage - with special handling for mixed view
  const pipelinesByStage = useMemo(() => {
    const grouped: Record<string, CRMPipeline[]> = {};
    currentStages.forEach(stage => {
      // Include pipelines that match this stage directly
      // Also map legacy 'en_camino' to 'ya_clinica'
      grouped[stage.id] = filteredPipelines.filter(p => {
        if (p.current_stage === stage.id) return true;
        // Handle legacy en_camino mapping
        if (stage.id === 'ya_clinica' && p.current_stage === 'en_camino') return true;
        return false;
      });
    });
    return grouped;
  }, [filteredPipelines, currentStages]);

  const handleDragStart = (event: DragStartEvent) => {
    const pipeline = filteredPipelines.find(p => p.id === event.active.id);
    setActivePipeline(pipeline || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePipeline(null);

    if (!over) return;

    const pipelineId = active.id as string;
    const newStage = over.id as string;

    // Find the pipeline
    const pipeline = filteredPipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    
    // Same stage - no change needed
    const currentStage = pipeline.current_stage === 'en_camino' ? 'ya_clinica' : pipeline.current_stage;
    if (currentStage === newStage) return;

    // Get stages for this pipeline's procedure type
    const pipelineStages = getStageOrderForProcedure(pipeline.procedure_type?.name);
    
    // Validate stage is valid for this procedure type
    if (!pipelineStages.includes(newStage)) {
      toast.error('Esta etapa no aplica para este tipo de procedimiento');
      return;
    }

    const currentIndex = pipelineStages.indexOf(currentStage);
    const newIndex = pipelineStages.indexOf(newStage);

    // Can only move forward one stage at a time, or back to any previous stage
    if (newIndex > currentIndex + 1) {
      toast.error('No puedes saltar etapas. Avanza una etapa a la vez.');
      return;
    }

    // Update the stage
    updateStage.mutate({
      pipelineId,
      newStage,
    });
  };

  const handlePipelineClick = (pipeline: CRMPipeline) => {
    setSelectedPipeline(pipeline);
    setDetailOpen(true);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {currentStages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage.id}
              label={stage.label}
              color={stage.color}
              pipelines={pipelinesByStage[stage.id] || []}
              onPipelineClick={handlePipelineClick}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activePipeline && (
            <div className="p-3 rounded-lg border bg-background shadow-xl w-[260px] rotate-3">
              <div className="space-y-2">
                <p className="font-medium text-sm truncate">
                  {activePipeline.patient?.first_name} {activePipeline.patient?.last_name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge 
                    variant="secondary" 
                    className={cn("text-xs", getColorClass(activePipeline.procedure_type?.color || 'blue'))}
                  >
                    {activePipeline.procedure_type?.name}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Eye className="h-3 w-3 mr-1" />
                    {activePipeline.eye_side}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <PipelineDetailSheet
        pipeline={selectedPipeline}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
};