import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/hooks/useBranch';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, UserRound, Scissors, ArrowLeft, Check, FileText, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad, { SignaturePadRef } from '@/components/signature/SignaturePad';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Función para generar el texto del consentimiento con datos dinámicos
const generateConsentText = (data: {
  patientName: string;
  patientAge: number | string;
  patientCode: string;
  responsable: string;
  doctorName: string;
  surgeryDescription: string;
  day: number;
  month: string;
  year: number;
}) => `CONSENTIMIENTO INFORMADO DE OPERACIÓN QUIRÚRGICA

Paciente: ${data.patientName}
Edad: ${data.patientAge} años, Identificación: ${data.patientCode}
Responsable: ${data.responsable || 'N/A'}
Cirugía a realizar: ${data.surgeryDescription}

1. Yo, ${data.patientName}, de ${data.patientAge} años, solicito y autorizo al Dr. (a): ${data.doctorName} y a otros médicos asociados seleccionados por el (ellas), a realizarme cirugía, sedación local, procedimiento (s) tratamiento (s), el (los) cual (es) me han sido explicado (s) por el Médico en términos totalmente comprensibles por mi persona o responsable.

2. El Médico me ha informado de todos los tratamientos aceptables alternativos, en términos totalmente comprensibles por mi persona.

3. El Médico me ha informado en términos que comprendí, de los riesgos, beneficios, y expectativas del proceso de recuperación que están asociados con la cirugía, sedación, anestesia general, procedimiento (s) o tratamiento (s) descritos anteriormente.

4. Me han informado que existen otros riesgos incluyendo reacciones alérgicas, infección, problemas cardíacos o de otra índole que son resultados de la cirugía, sedación, anestesia general, procedimiento (s) o tratamiento (s).

5. He sido informado (a) que tengo la opción de no hacerme el tratamiento y comprendo los posibles resultados al negar a hacerme la cirugía, sedación, anestesia general, procedimiento (s) o tratamiento (s).

6. Doy mi consentimiento a la administración de medicamentos que me sean administrados por o con instrucciones de la persona que me haga el (los) procedimiento (s) o tratamiento (s) con el propósito (s) de reducir el dolor, incomodidad o estrés que pueda estar experimentando.

7. Si alguna condición imprevista sucediere durante la cirugía, anestesia general y procedimiento (s) o tratamiento (s) sugerido (s). Yo autorizo y solicito que el médico tome la decisión y haga cualquier procedimiento (s) sugerido (s), que podrá ser adicional o diferente o diferente al (a los) procedimiento (s) planificado (s).

8. Doy mi consentimiento para que se elimine en forma adecuada cualquier tejido o cualquier otro material corporal que deba ser removido durante el curso del (de los) procedimiento (s).

9. Estoy consciente y comprendo que la medicina y la cirugía no son ciencias exactas y que no me han dado ninguna garantía de los resultados.

10. Doy mi consentimiento a la observación de mi procedimiento por otros proveedores de salud para propósitos educacionales y doy consentimiento a mi Médico (o asignado) de tomar fotografía, video grabación del procedimiento (que deberá) quedarse bajo la custodia de mi médico para los propósitos que mi Médico crea convenientes y yo he aceptado.

11. Yo, ${data.patientName}, de manera voluntaria, renuncio de toda acción penal, civil y /o administrativa, y de cualquier índole que pudiera corresponderme por la cirugía, sedación, anestesia general, procedimiento (s) o tratamiento (s) que me someteré el día: ${data.day} del mes: ${data.month} del año ${data.year}. A favor del Doctor (a): ${data.doctorName} y de otros médicos asociados seleccionados por el (ella) y también de OFTALMOSERVICIOS DEL SUR OCCIDENTE, SOCIEDAD ANÓNIMA.

HE LEÍDO LOS PÁRRAFOS ANTERIORES Y ME HAN SIDO EXPLICADOS A MI ENTERA SATISFACCIÓN.`;

// Función para calcular edad desde fecha de nacimiento
const calculateAge = (dob: string | null): number | null => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Nombres de meses en español
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

interface PendingSurgery {
  id: string;
  tipo_cirugia: string;
  ojo_operar: string;
  patient_name: string;
  patient_id: string;
  patient_dob: string | null;
  patient_code: string | null;
  doctor_name: string;
  appointment_time: string;
  encounter_id: string;
}

export default function ConsentSignatures() {
  const { currentBranch } = useBranch();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();
  const queryClient = useQueryClient();
  const [selectedSurgery, setSelectedSurgery] = useState<PendingSurgery | null>(null);
  const [patientName, setPatientName] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [patientHasSigned, setPatientHasSigned] = useState(false);
  const [witnessHasSigned, setWitnessHasSigned] = useState(false);
  const patientSigRef = useRef<SignaturePadRef>(null);
  const witnessSigRef = useRef<SignaturePadRef>(null);

  // Campos editables del consentimiento
  const [patientAge, setPatientAge] = useState<string>('');
  const [patientCode, setPatientCode] = useState('');
  const [responsableName, setResponsableName] = useState('');
  const [surgeryDescription, setSurgeryDescription] = useState('');

  // Obtener citas de cirugía de hoy sin firma
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
          doctor_id,
          post_op_type,
          reason,
          patient:patients(id, first_name, last_name, dob, code)
        `)
        .eq('branch_id', currentBranch.id)
        .eq('type', 'cirugia')
        .gte('starts_at', startOfDay)
        .lte('starts_at', endOfDay)
        .is('deleted_at', null);

      if (aptError) throw aptError;
      console.log('[ConsentSignatures] Citas de cirugía encontradas:', appointments?.length, appointments);
      if (!appointments || appointments.length === 0) return [];

      // Obtener pacientes que ya firmaron hoy
      const patientIds = appointments.map(a => (a.patient as any)?.id).filter(Boolean);

      const { data: existingSignatures } = await (supabase as any)
        .from('consent_signatures')
        .select('patient_id, signed_at')
        .in('patient_id', patientIds)
        .gte('signed_at', startOfDay)
        .lte('signed_at', endOfDay);

      const signedPatientIds = new Set(existingSignatures?.map(s => s.patient_id) || []);

      // Obtener los nombres de los doctores
      const doctorIds = appointments.map(a => a.doctor_id).filter(Boolean) as string[];
      let doctorMap: Record<string, string> = {};

      if (doctorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', doctorIds);

        if (profiles) {
          doctorMap = profiles.reduce((acc, p) => {
            acc[p.user_id] = p.full_name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Filtrar citas cuyos pacientes aún no han firmado hoy
      const pending: PendingSurgery[] = [];

      for (const apt of appointments) {
        const patient = apt.patient as any;
        if (!patient) continue;

        // Solo incluir si el paciente NO ha firmado hoy
        if (!signedPatientIds.has(patient.id)) {
          const doctorName = apt.doctor_id ? (doctorMap[apt.doctor_id] || 'Doctor no asignado') : 'Doctor no asignado';
          const surgeryType = apt.post_op_type || apt.reason || 'Cirugía';

          pending.push({
            id: apt.id, // Usar appointment_id como id
            tipo_cirugia: surgeryType,
            ojo_operar: '', // Se llenará en el formulario
            patient_name: `${patient.first_name} ${patient.last_name}`,
            patient_id: patient.id,
            patient_dob: patient.dob,
            patient_code: patient.code,
            doctor_name: doctorName,
            appointment_time: format(new Date(apt.starts_at), 'h:mm a', { locale: es }),
            encounter_id: '', // Ya no se usa, pero mantenemos por compatibilidad
          });
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

      // Generar el texto del consentimiento con los datos actuales
      const today = new Date();
      const finalConsentText = generateConsentText({
        patientName: patientName.trim(),
        patientAge: patientAge || 'N/A',
        patientCode: patientCode || 'N/A',
        responsable: responsableName,
        doctorName: selectedSurgery.doctor_name,
        surgeryDescription: surgeryDescription,
        day: today.getDate(),
        month: MONTH_NAMES[today.getMonth()],
        year: today.getFullYear(),
      });

      // Crear el registro de firma (sin surgery_id ya que aún no existe la cirugía)
      const { data: signature, error: sigError } = await (supabase as any)
        .from('consent_signatures')
        .insert({
          patient_id: selectedSurgery.patient_id,
          patient_signature: patientSignature,
          patient_name: patientName.trim(),
          witness_signature: witnessSignature,
          witness_name: witnessName.trim(),
          consent_text: finalConsentText,
          branch_id: currentBranch?.id,
        })
        .select()
        .single();

      if (sigError) throw sigError;

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
    setPatientAge('');
    setPatientCode('');
    setResponsableName('');
    setSurgeryDescription('');
    patientSigRef.current?.clear();
    witnessSigRef.current?.clear();
  };

  const handleSelectSurgery = (surgery: PendingSurgery) => {
    setSelectedSurgery(surgery);
    setPatientName(surgery.patient_name);
    // Inicializar campos editables
    const age = calculateAge(surgery.patient_dob);
    setPatientAge(age !== null ? String(age) : '');
    setPatientCode(surgery.patient_code || '');
    setResponsableName('');
    setSurgeryDescription(`${surgery.tipo_cirugia} - Ojo ${surgery.ojo_operar}`);
  };

  const handleSubmit = () => {
    saveSignatureMutation.mutate();
  };

  const canSubmit = patientHasSigned && witnessHasSigned && patientName.trim() && witnessName.trim();

  // Show offline message when in local mode
  if (isLocalMode) {
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

          {/* Offline message */}
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500">
                <WifiOff className="h-16 w-16 mx-auto mb-4 text-orange-500" />
                <p className="text-xl font-semibold text-gray-700 mb-2">
                  Modo Sin Conexión
                </p>
                <p className="text-gray-600 max-w-md mx-auto">
                  La firma de consentimientos informados requiere conexión a internet
                  para garantizar el registro seguro de las firmas digitales.
                </p>
                <p className="text-sm text-gray-500 mt-4">
                  Por favor, reconéctese a internet para acceder a esta funcionalidad.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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

  // Generar texto del consentimiento con datos actuales
  const today = new Date();
  const consentText = generateConsentText({
    patientName: patientName,
    patientAge: patientAge || 'N/A',
    patientCode: patientCode || 'N/A',
    responsable: responsableName,
    doctorName: selectedSurgery?.doctor_name || 'Doctor no asignado',
    surgeryDescription: surgeryDescription,
    day: today.getDate(),
    month: MONTH_NAMES[today.getMonth()],
    year: today.getFullYear(),
  });

  // Vista de firma de consentimiento
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-8 py-12">
      <div className="max-w-4xl mx-auto">
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

        {/* Datos editables del paciente */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Datos del Paciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="patient-age">Edad (años)</Label>
                <Input
                  id="patient-age"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value.replace(/\D/g, ''))}
                  placeholder="Edad"
                />
              </div>
              <div>
                <Label htmlFor="patient-code">Identificación (DPI/CUI)</Label>
                <Input
                  id="patient-code"
                  value={patientCode}
                  onChange={(e) => setPatientCode(e.target.value)}
                  placeholder="Número de identificación"
                />
              </div>
              <div>
                <Label htmlFor="responsable">Responsable (si aplica)</Label>
                <Input
                  id="responsable"
                  value={responsableName}
                  onChange={(e) => setResponsableName(e.target.value)}
                  placeholder="Nombre del responsable"
                />
              </div>
              <div>
                <Label htmlFor="surgery-desc">Cirugía a realizar</Label>
                <Input
                  id="surgery-desc"
                  value={surgeryDescription}
                  onChange={(e) => setSurgeryDescription(e.target.value)}
                  placeholder="Descripción de la cirugía"
                />
              </div>
            </div>
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p><strong>Doctor:</strong> {selectedSurgery.doctor_name}</p>
              <p><strong>Fecha:</strong> {today.getDate()} de {MONTH_NAMES[today.getMonth()]} de {today.getFullYear()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Contenido del consentimiento */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Lea el siguiente documento</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[450px] rounded-xl border-2 p-8 bg-white">
              <pre className="text-xl leading-loose whitespace-pre-wrap font-sans text-gray-800">{consentText}</pre>
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
