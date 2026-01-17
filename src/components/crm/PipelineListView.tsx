import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Eye, Phone, Clock, ChevronRight, CheckCircle2, XCircle, Info } from 'lucide-react';
import { CRMPipeline } from '@/hooks/useCRMPipelines';
import { PipelineDetailSheet } from './PipelineDetailSheet';
import { cn } from '@/lib/utils';
import { isProcedureInSurgeries, FlowCategory } from '@/lib/crmStages';

interface PipelineListViewProps {
  pipelines: CRMPipeline[];
  procedureFilter: string;
  searchQuery: string;
  statusFilter: string;
  flowCategory: FlowCategory;
}

const STAGE_LABELS: Record<string, string> = {
  info: 'Información',
  anticipo: 'Anticipo',
  pedido: 'Pedido',
  en_camino: 'En Camino',
  cirugia: 'Cirugía',
};

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

export const PipelineListView = ({ pipelines, procedureFilter, searchQuery, statusFilter, flowCategory }: PipelineListViewProps) => {
  const [selectedPipeline, setSelectedPipeline] = useState<CRMPipeline | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Filter pipelines
  const filteredPipelines = useMemo(() => {
    return pipelines.filter((pipeline) => {
      // Status filter
      if (statusFilter !== 'all' && pipeline.status !== statusFilter) {
        return false;
      }

      // Flow category filter
      const procedureName = pipeline.procedure_type?.name;
      if (procedureName) {
        const isInSurgeries = isProcedureInSurgeries(procedureName);
        if (flowCategory === 'surgeries' && !isInSurgeries) return false;
        if (flowCategory === 'supplies' && isInSurgeries) return false;
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
  }, [pipelines, procedureFilter, searchQuery, statusFilter, flowCategory]);

  const handleRowClick = (pipeline: CRMPipeline) => {
    setSelectedPipeline(pipeline);
    setDetailOpen(true);
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Procedimiento</TableHead>
              <TableHead>Ojo</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Días</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPipelines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No hay pipelines que coincidan con los filtros
                </TableCell>
              </TableRow>
            ) : (
              filteredPipelines.map((pipeline) => {
                const daysInStage = Math.floor(
                  (new Date().getTime() - new Date(pipeline.updated_at).getTime()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <TableRow 
                    key={pipeline.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(pipeline)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {pipeline.patient?.first_name} {pipeline.patient?.last_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {pipeline.patient?.code && <span>{pipeline.patient.code}</span>}
                          {pipeline.patient?.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {pipeline.patient.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getColorClass(pipeline.procedure_type?.color || 'blue')}>
                        {pipeline.procedure_type?.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        <Eye className="h-3 w-3 mr-1" />
                        {pipeline.eye_side}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {pipeline.status === 'cancelado' ? (
                        <span className="text-sm text-destructive font-medium">Cancelado</span>
                      ) : (
                        <span className="text-sm">{STAGE_LABELS[pipeline.current_stage] || pipeline.current_stage}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge 
                          variant={
                            pipeline.status === 'completado' ? 'default' :
                            pipeline.status === 'cancelado' ? 'destructive' : 'secondary'
                          }
                          className="gap-1"
                        >
                          {pipeline.status === 'completado' && <CheckCircle2 className="h-3 w-3" />}
                          {pipeline.status === 'cancelado' && <XCircle className="h-3 w-3" />}
                          {pipeline.status}
                        </Badge>
                        {pipeline.status === 'cancelado' && pipeline.cancellation_reason && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-sm">{pipeline.cancellation_reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "flex items-center gap-1 text-sm",
                        daysInStage > 7 && "text-amber-600"
                      )}>
                        <Clock className="h-3 w-3" />
                        {daysInStage}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(pipeline.created_at), "d MMM yyyy", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PipelineDetailSheet
        pipeline={selectedPipeline}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
};
