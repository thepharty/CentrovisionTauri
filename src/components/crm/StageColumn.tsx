import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { CRMPipeline } from '@/hooks/useCRMPipelines';
import { DraggablePipelineCard } from './DraggablePipelineCard';

interface StageColumnProps {
  stage: string;
  label: string;
  color: string;
  pipelines: CRMPipeline[];
  onPipelineClick: (pipeline: CRMPipeline) => void;
}

export const StageColumn = ({ stage, label, color, pipelines, onPipelineClick }: StageColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex-1 min-w-[280px] max-w-[320px] rounded-lg border bg-card transition-all",
        isOver && "ring-2 ring-primary ring-offset-2 bg-primary/5"
      )}
    >
      {/* Column Header */}
      <div className={cn("px-4 py-3 rounded-t-lg", color)}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{label}</h3>
          <span className="text-xs font-medium bg-background/20 px-2 py-0.5 rounded-full">
            {pipelines.length}
          </span>
        </div>
      </div>

      {/* Column Content */}
      <div className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto">
        {pipelines.map((pipeline) => (
          <DraggablePipelineCard
            key={pipeline.id}
            pipeline={pipeline}
            onClick={() => onPipelineClick(pipeline)}
          />
        ))}

        {pipelines.length === 0 && (
          <div className={cn(
            "flex items-center justify-center h-24 text-sm text-muted-foreground border-2 border-dashed rounded-lg",
            isOver && "border-primary bg-primary/10"
          )}>
            {isOver ? "Soltar aquí" : "Sin pacientes"}
          </div>
        )}
      </div>
    </div>
  );
};
