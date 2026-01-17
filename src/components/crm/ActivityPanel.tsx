import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Activity, CheckCircle2, XCircle, ArrowRight, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CRMActivity } from "@/hooks/useCRMNotifications";
import { STAGE_LABELS } from "@/lib/crmStages";

interface ActivityPanelProps {
  activities: CRMActivity[];
  isLoading: boolean;
  lastRead: string | null;
  onMarkAsRead?: () => void;
}

export function ActivityPanel({ activities, isLoading, lastRead, onMarkAsRead }: ActivityPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'pipeline_created':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'stage_changed':
        return <ArrowRight className="h-4 w-4 text-blue-500" />;
      case 'pipeline_completed':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'pipeline_cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityText = (activity: CRMActivity) => {
    const patientName = activity.pipeline?.patient 
      ? `${activity.pipeline.patient.first_name} ${activity.pipeline.patient.last_name}`
      : 'Paciente';
    const procedureName = activity.pipeline?.procedure_type?.name || 'Procedimiento';
    const eyeSide = activity.pipeline?.eye_side || '';
    const creatorName = activity.creator?.full_name;
    
    const fromStageLabel = activity.from_stage ? STAGE_LABELS[activity.from_stage] || activity.from_stage : '';
    const toStageLabel = activity.to_stage ? STAGE_LABELS[activity.to_stage] || activity.to_stage : '';

    switch (activity.activity_type) {
      case 'pipeline_created':
        return (
          <span>
            Nuevo pipeline: <strong>{patientName}</strong> - {procedureName} ({eyeSide})
            {creatorName && (
              <span className="text-muted-foreground"> por: {creatorName}</span>
            )}
          </span>
        );
      case 'stage_changed':
        return (
          <span>
            <strong>{patientName}</strong> avanzó de <Badge variant="outline" className="mx-1 text-xs">{fromStageLabel}</Badge> a <Badge variant="outline" className="mx-1 text-xs">{toStageLabel}</Badge>
            {creatorName && (
              <span className="text-muted-foreground"> por: {creatorName}</span>
            )}
          </span>
        );
      case 'pipeline_completed':
        return (
          <span>
            Pipeline completado: <strong>{patientName}</strong> - {procedureName}
            {creatorName && (
              <span className="text-muted-foreground"> por: {creatorName}</span>
            )}
          </span>
        );
      case 'pipeline_cancelled':
        return (
          <span>
            Pipeline cancelado: <strong>{patientName}</strong> - {procedureName}
            {creatorName && (
              <span className="text-muted-foreground"> por: {creatorName}</span>
            )}
            {activity.reason && (
              <span className="block text-xs text-muted-foreground mt-1 italic">
                Razón: {activity.reason}
              </span>
            )}
          </span>
        );
      default:
        return <span>Actividad en pipeline</span>;
    }
  };

  const isNew = (activityDate: string) => {
    if (!lastRead) return true;
    return new Date(activityDate) > new Date(lastRead);
  };

  if (isLoading) {
    return (
      <div className="bg-muted/50 rounded-lg p-4 mb-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="h-4 w-4 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return null;
  }

  const newActivitiesCount = activities.filter(a => isNew(a.created_at)).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <div className="bg-muted/50 rounded-lg border">
        <div className="flex items-center justify-between p-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="justify-start p-0 h-auto hover:bg-transparent">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="font-medium">Actividad Reciente</span>
                {newActivitiesCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {newActivitiesCount} nuevas
                  </Badge>
                )}
                {isOpen ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
              </div>
            </Button>
          </CollapsibleTrigger>
          {newActivitiesCount > 0 && onMarkAsRead && (
            <Button variant="ghost" size="sm" onClick={onMarkAsRead} className="text-xs">
              Marcar como leído
            </Button>
          )}
        </div>
        
        <CollapsibleContent>
          <ScrollArea className="h-64 px-4 pb-4">
            <div className="space-y-3 pr-3">
              {activities.map((activity) => (
                <div 
                  key={activity.id} 
                  className={`flex items-start gap-3 p-2 rounded-md transition-colors ${
                    isNew(activity.created_at) ? 'bg-primary/5 border-l-2 border-primary' : ''
                  }`}
                >
                  <div className="mt-0.5">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      {getActivityText(activity)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(activity.created_at), { 
                        addSuffix: true, 
                        locale: es 
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
