import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCRMProcedureTypes, CRMProcedureType } from '@/hooks/useCRMProcedureTypes';
import { useCreatePipeline } from '@/hooks/useCRMPipelines';
import { useBranch } from '@/hooks/useBranch';

const formSchema = z.object({
  patient_id: z.string().min(1, 'Selecciona un paciente'),
  procedure_type_id: z.string().min(1, 'Selecciona un tipo de procedimiento'),
  doctor_id: z.string().optional(),
  eye_side: z.enum(['OD', 'OI', 'OU']),
  priority: z.enum(['normal', 'alta', 'urgente']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface NewPipelineDialogProps {
  trigger?: React.ReactNode;
}

export const NewPipelineDialog = ({ trigger }: NewPipelineDialogProps) => {
  const [open, setOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const { currentBranch } = useBranch();
  const { data: procedureTypes } = useCRMProcedureTypes();
  const createPipeline = useCreatePipeline();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patient_id: '',
      procedure_type_id: '',
      doctor_id: '',
      eye_side: 'OU',
      priority: 'normal',
      notes: '',
    },
  });

  // Search patients
  const { data: patients } = useQuery({
    queryKey: ['patients-search', patientSearch],
    queryFn: async () => {
      if (patientSearch.length < 2) return [];
      
      const { data, error } = await supabase
        .from('patients')
        .select('id, first_name, last_name, code, phone')
        .or(`first_name.ilike.%${patientSearch}%,last_name.ilike.%${patientSearch}%,code.ilike.%${patientSearch}%`)
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: patientSearch.length >= 2,
  });

  // Fetch doctors - solo usuarios con rol doctor
  const { data: doctors } = useQuery({
    queryKey: ['doctors-for-crm'],
    queryFn: async () => {
      // Primero obtener los user_ids que tienen rol doctor
      const { data: doctorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'doctor');
      
      if (rolesError) throw rolesError;
      if (!doctorRoles || doctorRoles.length === 0) return [];
      
      // Luego obtener sus perfiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', doctorRoles.map(r => r.user_id))
        .eq('is_visible_in_dashboard', true)
        .order('full_name');
      
      if (profilesError) throw profilesError;
      return profiles || [];
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!currentBranch?.id) return;

    // Get the selected procedure type to use its default_stages
    const selectedProcedureType = procedureTypes?.find(pt => pt.id === data.procedure_type_id);
    const stages = selectedProcedureType?.default_stages || ['info', 'anticipo', 'pedido', 'ya_clinica', 'cirugia'];

    await createPipeline.mutateAsync({
      patient_id: data.patient_id,
      procedure_type_id: data.procedure_type_id,
      doctor_id: data.doctor_id || null,
      branch_id: currentBranch.id,
      eye_side: data.eye_side,
      priority: data.priority,
      notes: data.notes,
      stages: stages,
    });

    setOpen(false);
    form.reset();
    setPatientSearch('');
  };

  const selectedPatient = patients?.find(p => p.id === form.watch('patient_id'));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Pipeline
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Pipeline de Cirugía</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Patient Search */}
            <div className="space-y-2">
              <FormLabel>Paciente</FormLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar paciente..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {patients && patients.length > 0 && !selectedPatient && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {patients.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                      onClick={() => {
                        form.setValue('patient_id', patient.id);
                        setPatientSearch(`${patient.first_name} ${patient.last_name}`);
                      }}
                    >
                      <span className="font-medium">{patient.first_name} {patient.last_name}</span>
                      {patient.code && (
                        <span className="text-muted-foreground ml-2">({patient.code})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedPatient && (
                <div className="text-sm text-muted-foreground">
                  Seleccionado: {selectedPatient.first_name} {selectedPatient.last_name}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="ml-2 h-auto p-0"
                    onClick={() => {
                      form.setValue('patient_id', '');
                      setPatientSearch('');
                    }}
                  >
                    Cambiar
                  </Button>
                </div>
              )}
              {form.formState.errors.patient_id && (
                <p className="text-sm text-destructive">{form.formState.errors.patient_id.message}</p>
              )}
            </div>

            {/* Procedure Type */}
            <FormField
              control={form.control}
              name="procedure_type_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Procedimiento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar procedimiento" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {procedureTypes?.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Doctor */}
            <FormField
              control={form.control}
              name="doctor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Doctor Asignado (opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar doctor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {doctors?.map((doctor) => (
                        <SelectItem key={doctor.user_id} value={doctor.user_id}>
                          {doctor.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Eye Side */}
            <FormField
              control={form.control}
              name="eye_side"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ojo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="OD">OD (Derecho)</SelectItem>
                      <SelectItem value="OI">OI (Izquierdo)</SelectItem>
                      <SelectItem value="OU">OU (Ambos)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridad</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Notas adicionales..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createPipeline.isPending}>
                {createPipeline.isPending ? 'Creando...' : 'Crear Pipeline'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
