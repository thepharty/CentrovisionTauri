import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/hooks/useBranch';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, UserRound, Scissors, ArrowLeft, Check, FileText } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad, { SignaturePadRef } from '@/components/signature/SignaturePad';

// Texto del consentimiento informado genérico
const CONSENT_TEXT = `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTO QUIRÚRGICO

Yo, el/la paciente abajo firmante, declaro que:

1. He sido informado(a) de manera clara y comprensible sobre el procedimiento quirúrgico que se me va a realizar, incluyendo su naturaleza, propósito y los beneficios esperados.

2. Se me han explicado los riesgos y posibles complicaciones asociados con el procedimiento, incluyendo pero no limitado a: infección, sangrado, reacciones adversas a la anestesia, y resultados no satisfactorios.

3. He tenido la oportunidad de hacer preguntas y todas mis dudas han sido resueltas satisfactoriamente.

4. Entiendo que no se me ha garantizado ningún resultado específico y que los resultados pueden variar de persona a persona.

5. Autorizo al equipo médico de CentroVisión a realizar el procedimiento quirúrgico indicado, así como cualquier procedimiento adicional que sea necesario durante la cirugía para tratar condiciones imprevistas.

6. He proporcionado información completa y veraz sobre mi historial médico, alergias, medicamentos que tomo y cualquier otra condición relevante.

7. Acepto seguir las instrucciones pre y postoperatorias proporcionadas por el equipo médico.

Por medio de la presente, otorgo mi consentimiento libre, voluntario e informado para la realización del procedimiento quirúrgico.`;

interface PendingSurgery {
  id: string;
  tipo_cirugia: string;
  ojo_operar: string;
  patient_name: string;
  patient_id: string;
  appointment_time: string;
  encounter_id: string;
}

export default function ConsentSignatures() {
  const { currentBranch } = useBranch();
  const queryClient = useQueryClient();
  const [selectedSurgery, setSelectedSurgery] = useState<PendingSurgery | null>(null);
  const [patientName, setPatientName] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [patientHasSigned, setPatientHasSigned] = useState(false);
  const [witnessHasSigned, setWitnessHasSigned] = useState(false);
  const patientSigRef = useRef<SignaturePadRef>(null);
  const witnessSigRef = useRef<SignaturePadRef>(null);

  // Obtener cirugías de hoy sin firma
  const { data: pendingSurgeries = [], isLoading } = useQuery({
    queryKey: ['pending-signatures', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      // Obtener citas de cirugía de hoy
      const { data: appointments, error: aptError } = await supabase
        .from('appointments')
        .select(`
          id,
          starts_at,
          patient:patients(id, first_name, last_name)
        `)
        .eq('branch_id', currentBranch.id)
        .eq('type', 'cirugia')
        .gte('starts_at', startOfDay)
        .lte('starts_at', endOfDay)
        .is('deleted_at', null);

      if (aptError) throw aptError;
      if (!appointments || appointments.length === 0) return [];

      // Obtener encounters y surgeries de esas citas
      const appointmentIds = appointments.map(a => a.id);

      const { data: encounters, error: encError } = await supabase
        .from('encounters')
        .select(`
          id,
          appointment_id,
          surgeries(id, tipo_cirugia, ojo_operar, consent_signature_id)
        `)
        .in('appointment_id', appointmentIds)
        .is('deleted_at', null);

      if (encError) throw encError;

      // Filtrar cirugías sin firma
      const pending: PendingSurgery[] = [];

      for (const apt of appointments) {
        const encounter = encounters?.find(e => e.appointment_id === apt.id);
        if (!encounter) continue;

        const surgeries = encounter.surgeries || [];
        for (const surgery of surgeries) {
          // Solo incluir si no tiene firma
          if (!surgery.consent_signature_id) {
            const patient = apt.patient as any;
            pending.push({
              id: surgery.id,
              tipo_cirugia: surgery.tipo_cirugia,
              ojo_operar: surgery.ojo_operar,
              patient_name: `${patient.first_name} ${patient.last_name}`,
              patient_id: patient.id,
              appointment_time: format(new Date(apt.starts_at), 'h:mm a', { locale: es }),
              encounter_id: encounter.id,
            });
          }
        }
      }

      return pending;
    },
    enabled: !!currentBranch?.id,
    refetchInterval: 30000, // Refrescar cada 30 segundos
  });

  // Mutation para guardar firma
  const saveSignatureMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSurgery || !patientSigRef.current || !witnessSigRef.current) {
        throw new Error('Datos incompletos');
      }

      if (patientSigRef.current.isEmpty() || witnessSigRef.current.isEmpty()) {
        throw new Error('Ambas firmas son requeridas');
      }

      if (!patientName.trim() || !witnessName.trim()) {
        throw new Error('Los nombres son requeridos');
      }

      const patientSignature = patientSigRef.current.toDataURL();
      const witnessSignature = witnessSigRef.current.toDataURL();

      // Crear el registro de firma
      const { data: signature, error: sigError } = await supabase
        .from('consent_signatures')
        .insert({
          surgery_id: selectedSurgery.id,
          patient_id: selectedSurgery.patient_id,
          patient_signature: patientSignature,
          patient_name: patientName.trim(),
          witness_signature: witnessSignature,
          witness_name: witnessName.trim(),
          consent_text: CONSENT_TEXT,
          branch_id: currentBranch?.id,
        })
        .select()
        .single();

      if (sigError) throw sigError;

      // Actualizar la cirugía con la referencia a la firma
      const { error: updateError } = await supabase
        .from('surgeries')
        .update({ consent_signature_id: signature.id })
        .eq('id', selectedSurgery.id);

      if (updateError) throw updateError;

      return signature;
    },
    onSuccess: () => {
      toast.success('Consentimiento firmado correctamente');
      queryClient.invalidateQueries({ queryKey: ['pending-signatures'] });
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Error al guardar firma: ' + error.message);
    },
  });

  const resetForm = () => {
    setSelectedSurgery(null);
    setPatientName('');
    setWitnessName('');
    setPatientHasSigned(false);
    setWitnessHasSigned(false);
    patientSigRef.current?.clear();
    witnessSigRef.current?.clear();
  };

  const handleSelectSurgery = (surgery: PendingSurgery) => {
    setSelectedSurgery(surgery);
    setPatientName(surgery.patient_name);
  };

  const handleSubmit = () => {
    saveSignatureMutation.mutate();
  };

  const canSubmit = patientHasSigned && witnessHasSigned && patientName.trim() && witnessName.trim();

  // Vista de lista de pacientes pendientes
  if (!selectedSurgery) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-gray-800">Firma de Consentimientos</h1>
            </div>
            <p className="text-gray-600">
              {currentBranch?.name} - {format(new Date(), "d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>

          {/* Lista de cirugías pendientes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Seleccione su nombre para firmar</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : pendingSurgeries.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-lg font-medium">Todos los consentimientos han sido firmados</p>
                  <p className="text-sm">No hay cirugías pendientes de firma para hoy</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingSurgeries.map((surgery) => (
                    <button
                      key={surgery.id}
                      onClick={() => handleSelectSurgery(surgery)}
                      className="w-full p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserRound className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{surgery.patient_name}</p>
                          <p className="text-sm text-gray-600 flex items-center gap-2">
                            <Scissors className="h-4 w-4" />
                            {surgery.tipo_cirugia} ({surgery.ojo_operar}) - {surgery.appointment_time}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Vista de firma de consentimiento
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={resetForm}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Consentimiento Informado</h1>
            <p className="text-sm text-gray-600">
              {selectedSurgery.tipo_cirugia} - {selectedSurgery.patient_name}
            </p>
          </div>
        </div>

        {/* Contenido del consentimiento */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lea el siguiente documento</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48 rounded border p-4 bg-gray-50">
              <pre className="text-sm whitespace-pre-wrap font-sans">{CONSENT_TEXT}</pre>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Firma del Paciente */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Firma del Paciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="patient-name">Nombre completo</Label>
              <Input
                id="patient-name"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Nombre del paciente"
              />
            </div>
            <SignaturePad
              ref={patientSigRef}
              width={500}
              height={150}
              onSignatureChange={setPatientHasSigned}
            />
          </CardContent>
        </Card>

        {/* Firma del Testigo */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Firma del Testigo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="witness-name">Nombre completo del testigo</Label>
              <Input
                id="witness-name"
                value={witnessName}
                onChange={(e) => setWitnessName(e.target.value)}
                placeholder="Nombre del testigo"
              />
            </div>
            <SignaturePad
              ref={witnessSigRef}
              width={500}
              height={150}
              onSignatureChange={setWitnessHasSigned}
            />
          </CardContent>
        </Card>

        {/* Botones de acción */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={resetForm}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!canSubmit || saveSignatureMutation.isPending}
          >
            {saveSignatureMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Firmar y Guardar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
