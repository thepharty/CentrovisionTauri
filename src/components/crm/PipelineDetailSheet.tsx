import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  Phone, 
  User, 
  Eye,
  MessageSquare,
  Send,
  DollarSign,
  ChevronRight,
  XCircle
} from 'lucide-react';
import { CRMPipeline, useCRMPipelineStages, useCRMPipelineNotes, useUpdatePipelineStage, useAddPipelineNote, useCompletePipeline, useCancelPipeline } from '@/hooks/useCRMPipelines';
import { cn } from '@/lib/utils';
import { 
  getStagesForProcedure, 
  getStageOrderForProcedure,
  STAGE_LABELS 
} from '@/lib/crmStages';
import { CancelPipelineDialog } from './CancelPipelineDialog';
import { useConfetti } from '@/hooks/useConfetti';

interface PipelineDetailSheetProps {
  pipeline: CRMPipeline | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export const PipelineDetailSheet = ({ pipeline, open, onOpenChange }: PipelineDetailSheetProps) => {
  const [newNote, setNewNote] = useState('');
  const [anticipoAmount, setAnticipoAmount] = useState('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const { data: stages } = useCRMPipelineStages(pipeline?.id || '');
  const { data: notes } = useCRMPipelineNotes(pipeline?.id || '');
  const updateStage = useUpdatePipelineStage();
  const addNote = useAddPipelineNote();
  const completePipeline = useCompletePipeline();
  const cancelPipeline = useCancelPipeline();
  const { fireConfetti } = useConfetti();

  // Get stages for this procedure type
  const procedureStages = useMemo(() => {
    return getStagesForProcedure(pipeline?.procedure_type?.name);
  }, [pipeline?.procedure_type?.name]);

  const stageOrder = useMemo(() => {
    return getStageOrderForProcedure(pipeline?.procedure_type?.name);
  }, [pipeline?.procedure_type?.name]);

  if (!pipeline) return null;

  // Normalize status - accept both 'active' and 'activo'
  const isActive = pipeline.status === 'active' || pipeline.status === 'activo';

  // Map legacy en_camino to ya_clinica for display
  const currentStageNormalized = pipeline.current_stage === 'en_camino' ? 'ya_clinica' : pipeline.current_stage;
  const currentStageIndex = stageOrder.indexOf(currentStageNormalized);

  const handleAdvanceStage = () => {
    if (currentStageIndex < stageOrder.length - 1) {
      const nextStage = stageOrder[currentStageIndex + 1];
      updateStage.mutate({
        pipelineId: pipeline.id,
        newStage: nextStage,
        amount: nextStage === 'anticipo' ? parseFloat(anticipoAmount) || undefined : undefined,
      });
      setAnticipoAmount('');
    }
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      addNote.mutate({ pipelineId: pipeline.id, note: newNote.trim() });
      setNewNote('');
    }
  };

  const handleComplete = () => {
    fireConfetti();
    completePipeline.mutate(pipeline.id);
    // Delay para disfrutar el confeti antes de cerrar
    setTimeout(() => {
      onOpenChange(false);
    }, 1500);
  };

  const handleCancel = (reason: string) => {
    cancelPipeline.mutate({ pipelineId: pipeline.id, reason });
    setCancelDialogOpen(false);
    onOpenChange(false);
  };

  const daysInCurrentStage = Math.floor(
    (new Date().getTime() - new Date(pipeline.updated_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {pipeline.patient?.first_name} {pipeline.patient?.last_name}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
          <div className="space-y-6 py-4">
            {/* Patient Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {pipeline.patient?.code && (
                  <span>Código: {pipeline.patient.code}</span>
                )}
                {pipeline.patient?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {pipeline.patient.phone}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={getColorClass(pipeline.procedure_type?.color || 'blue')}>
                  {pipeline.procedure_type?.name}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {pipeline.eye_side}
                </Badge>
                {pipeline.priority !== 'normal' && (
                  <Badge variant={pipeline.priority === 'urgente' ? 'destructive' : 'default'}>
                    {pipeline.priority}
                  </Badge>
                )}
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  {daysInCurrentStage} días en etapa
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Stage Progress */}
            <div className="space-y-4">
              <h4 className="font-medium">Progreso del Pipeline</h4>
              <div className="space-y-3">
                {stageOrder.map((stageId, index) => {
                  const stage = procedureStages.find(s => s.id === stageId);
                  // Find stage data - handle legacy en_camino mapping
                  const stageData = stages?.find(s => s.stage_name === stageId || (stageId === 'ya_clinica' && s.stage_name === 'en_camino'));
                  const isCompleted = index < currentStageIndex;
                  const isCurrent = index === currentStageIndex;
                  const isPending = index > currentStageIndex;

                  return (
                    <div 
                      key={stageId}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border",
                        isCurrent && "border-primary bg-primary/5",
                        isCompleted && "border-green-500/30 bg-green-50 dark:bg-green-950/20",
                        isPending && "border-muted bg-muted/30"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                      ) : isCurrent ? (
                        <Clock className="h-5 w-5 text-primary shrink-0" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium text-sm",
                          isPending && "text-muted-foreground"
                        )}>
                          {stage?.label || STAGE_LABELS[stageId] || stageId}
                        </p>
                        {stageData?.completed_at && (
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(stageData.completed_at), "d MMM yyyy", { locale: es })}
                            {stageData.updated_by_profile?.full_name && (
                              <span className="ml-1">
                                por <span className="font-medium">{stageData.updated_by_profile.full_name}</span>
                              </span>
                            )}
                          </p>
                        )}
                        {stageData?.amount && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            Q{stageData.amount.toLocaleString()}
                          </p>
                        )}
                      </div>
                      {isCurrent && index < stageOrder.length - 1 && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Advance Stage Action */}
            {isActive && currentStageIndex < stageOrder.length - 1 && (
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <h4 className="font-medium text-sm">Avanzar a siguiente etapa</h4>
                {stageOrder[currentStageIndex + 1] === 'anticipo' && (
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Monto del anticipo (opcional)</label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 border rounded-l-md bg-muted text-sm">Q</span>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={anticipoAmount}
                        onChange={(e) => setAnticipoAmount(e.target.value)}
                        className="rounded-l-none"
                      />
                    </div>
                  </div>
                )}
                <Button 
                  onClick={handleAdvanceStage}
                  disabled={updateStage.isPending}
                  className="w-full"
                >
                  Avanzar a: {procedureStages[currentStageIndex + 1]?.label || STAGE_LABELS[stageOrder[currentStageIndex + 1]]}
                </Button>
              </div>
            )}

            {/* Complete/Cancel Actions */}
            {isActive && currentStageIndex === stageOrder.length - 1 && (
              <Button 
                onClick={handleComplete} 
                className="w-full"
                disabled={completePipeline.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Completar
              </Button>
            )}

            <Separator />

            {/* Notes Section */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Notas ({notes?.length || 0})
              </h4>

              {/* Add Note */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Agregar una nota..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
              </div>
              <Button 
                onClick={handleAddNote}
                disabled={!newNote.trim() || addNote.isPending}
                size="sm"
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                Agregar Nota
              </Button>

              {/* Notes List */}
              <div className="space-y-3">
                {notes?.map((note) => (
                  <div key={note.id} className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-sm">{note.note}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(note.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Initial Notes */}
            {pipeline.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Notas Iniciales</h4>
                  <p className="text-sm text-muted-foreground">{pipeline.notes}</p>
                </div>
              </>
            )}

            {/* Cancel Pipeline */}
            {isActive && (
              <>
                <Separator />
                <Button 
                  variant="outline" 
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar Pipeline
                </Button>
              </>
            )}
          </div>
        </ScrollArea>

        <CancelPipelineDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          onConfirm={handleCancel}
          patientName={`${pipeline.patient?.first_name} ${pipeline.patient?.last_name}`}
          isPending={cancelPipeline.isPending}
        />
      </SheetContent>
    </Sheet>
  );
};