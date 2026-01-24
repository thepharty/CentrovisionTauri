import { useState, useEffect } from 'react';
import { Appointment } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface QuickNoteDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
}

export function QuickNoteDialog({ appointment, open, onClose }: QuickNoteDialogProps) {
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  useEffect(() => {
    if (appointment && open) {
      setNote(appointment.reception_notes || '');
    }
  }, [appointment, open]);

  const updateNoteMutation = useMutation({
    mutationFn: async (newNote: string) => {
      if (!appointment) return;

      if (isLocalMode) {
        await invoke('update_appointment', {
          id: appointment.id,
          update: { reception_notes: newNote || null }
        });
      } else {
        const { error } = await supabase
          .from('appointments')
          .update({ reception_notes: newNote || null })
          .eq('id', appointment.id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Nota guardada exitosamente');
      onClose();
    },
    onError: (error: any) => {
      toast.error('Error al guardar nota: ' + error.message);
    },
  });

  const handleSave = () => {
    updateNoteMutation.mutate(note);
  };

  if (!appointment) return null;

  const canEdit = role !== 'doctor';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-amber-500" />
            <DialogTitle>Nota de Recepción</DialogTitle>
          </div>
          <DialogDescription>
            <div className="space-y-1 mt-2">
              <div className="font-medium text-foreground">
                {appointment.patient?.first_name} {appointment.patient?.last_name}
              </div>
              <div className="text-sm">
                {format(new Date(appointment.starts_at), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!canEdit ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-800">
                Solo el personal no médico puede editar estas notas.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Confirmar cita 1 día antes - tel. 8094-1234&#10;Traer lentes actuales y receta anterior&#10;Paciente prefiere citas temprano"
              className="min-h-[120px] resize-none"
              disabled={!canEdit}
              maxLength={500}
            />
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Nota visible para todo el personal</span>
              <span>{note.length}/500</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!canEdit || updateNoteMutation.isPending}
          >
            {updateNoteMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
