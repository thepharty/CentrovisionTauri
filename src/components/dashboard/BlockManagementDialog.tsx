import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toClinicTime } from "@/lib/timezone";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface BlockManagementDialogProps {
  block: any | null;
  open: boolean;
  onClose: () => void;
}

export function BlockManagementDialog({ block, open, onClose }: BlockManagementDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase
        .from('schedule_blocks')
        .delete()
        .eq('id', blockId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bloqueo eliminado correctamente');
      queryClient.invalidateQueries({ queryKey: ['schedule_blocks'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al eliminar el bloqueo');
    }
  });

  if (!block) return null;

  const blockStart = toClinicTime(new Date(block.starts_at));
  const blockEnd = toClinicTime(new Date(block.ends_at));

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🚫 Gestionar Bloqueo de Horario</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            {/* Detectar si es bloqueo multi-día */}
            {format(blockStart, 'yyyy-MM-dd') === format(blockEnd, 'yyyy-MM-dd') ? (
              // Bloqueo de un solo día - formato compacto
              <>
                <div>
                  <strong>Fecha:</strong> {format(blockStart, "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </div>
                <div>
                  <strong>Horario:</strong> {format(blockStart, 'HH:mm')} - {format(blockEnd, 'HH:mm')}
                </div>
              </>
            ) : (
              // Bloqueo multi-día - formato extendido
              <>
                <div>
                  <strong>Fecha inicio:</strong> {format(blockStart, "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </div>
                <div>
                  <strong>Hora inicio:</strong> {format(blockStart, 'HH:mm')}
                </div>
                <div>
                  <strong>Fecha fin:</strong> {format(blockEnd, "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </div>
                <div>
                  <strong>Hora fin:</strong> {format(blockEnd, 'HH:mm')}
                </div>
              </>
            )}
            
            {/* Información del creador */}
            {block.created_by_profile?.full_name && (
              <div>
                <strong>Bloqueado por:</strong> {block.created_by_profile.full_name}
              </div>
            )}
            
            {/* Razón del bloqueo (si existe) */}
            {block.reason && (
              <div>
                <strong>Razón:</strong> {block.reason}
              </div>
            )}
            <div className="text-sm text-muted-foreground mt-4">
              ¿Qué deseas hacer con este bloqueo?
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate(block.id)}
            className="bg-destructive hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar Bloqueo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
