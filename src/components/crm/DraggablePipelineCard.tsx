import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Clock, Eye, GripVertical, Phone, AlertTriangle } from 'lucide-react';
import { CRMPipeline } from '@/hooks/useCRMPipelines';
import { cn } from '@/lib/utils';

interface DraggablePipelineCardProps {
  pipeline: CRMPipeline;
  onClick: () => void;
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

export const DraggablePipelineCard = ({ pipeline, onClick }: DraggablePipelineCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: pipeline.id });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  // Días totales desde que se creó el pipeline
  const totalDays = Math.floor(
    (new Date().getTime() - new Date(pipeline.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Días en la etapa actual
  const stageDate = pipeline.stage_changed_at || pipeline.updated_at;
  const daysInStage = Math.floor(
    (new Date().getTime() - new Date(stageDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  const isOverdue = daysInStage > 7;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-3 rounded-lg border bg-background cursor-pointer hover:shadow-md transition-shadow",
        isDragging && "opacity-50 shadow-lg z-50",
        isOverdue && "border-amber-400",
        pipeline.priority === 'urgente' && "border-destructive",
        pipeline.priority === 'alta' && "border-orange-400"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <button
          className="mt-1 p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Patient Name */}
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm truncate">
              {pipeline.patient?.first_name} {pipeline.patient?.last_name}
            </p>
            {(isOverdue || pipeline.priority !== 'normal') && (
              <AlertTriangle className={cn(
                "h-4 w-4 shrink-0",
                pipeline.priority === 'urgente' ? "text-destructive" : 
                pipeline.priority === 'alta' ? "text-orange-500" : "text-amber-500"
              )} />
            )}
          </div>

          {/* Procedure Badge */}
          <div className="flex flex-wrap gap-1.5">
            <Badge 
              variant="secondary" 
              className={cn("text-xs", getColorClass(pipeline.procedure_type?.color || 'blue'))}
            >
              {pipeline.procedure_type?.name}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Eye className="h-3 w-3 mr-1" />
              {pipeline.eye_side}
            </Badge>
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1" title="Días en etapa actual">
              <Clock className="h-3 w-3" />
              {daysInStage}d
            </span>
            {totalDays !== daysInStage && (
              <span className="text-muted-foreground/60" title="Días totales">
                ({totalDays}d total)
              </span>
            )}
            {pipeline.patient?.phone && (
              <span className="flex items-center gap-1 truncate">
                <Phone className="h-3 w-3" />
                {pipeline.patient.phone}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
