import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface ConsultationViewProps {
  encounterId: string;
  additionalSectionsAfterDiagnosis?: React.ReactNode;
  hideDiagnosisPrevio?: boolean;
}

export function ConsultationView({ encounterId, additionalSectionsAfterDiagnosis, hideDiagnosisPrevio }: ConsultationViewProps) {
  // Fetch encounter data
  const { data: encounter, isLoading: encounterLoading } = useQuery({
    queryKey: ['consultation-encounter', encounterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('encounters')
        .select('*')
        .eq('id', encounterId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch previous encounter diagnosis
  const { data: previousEncounter } = useQuery({
    queryKey: ['previous-encounter', encounter?.patient_id],
    queryFn: async () => {
      if (!encounter?.patient_id) return null;
      
      const { data, error } = await supabase
        .from('encounters')
        .select('summary, date')
        .eq('patient_id', encounter.patient_id)
        .lt('date', encounter.date || new Date().toISOString())
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!encounter?.patient_id,
  });

  // Fetch patient data
  const { data: patient } = useQuery({
    queryKey: ['consultation-patient', encounter?.patient_id],
    queryFn: async () => {
      if (!encounter?.patient_id) return null;
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', encounter.patient_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!encounter?.patient_id,
  });

  // Fetch exam_eye data for both eyes
  const { data: examEyes } = useQuery({
    queryKey: ['consultation-exam-eyes', encounterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_eye')
        .select('*')
        .eq('encounter_id', encounterId)
        .in('side', ['OD', 'OI']);
      if (error) throw error;
      const od = data?.find(e => e.side === 'OD');
      const os = data?.find(e => e.side === 'OI');
      return { od, os };
    },
  });

  // Fetch appointment data
  const { data: appointment } = useQuery({
    queryKey: ['consultation-appointment', encounter?.appointment_id],
    queryFn: async () => {
      if (!encounter?.appointment_id) return null;
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', encounter.appointment_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!encounter?.appointment_id,
  });

  if (encounterLoading) {
    return (
      <div className="space-y-6 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No se encontraron datos de la consulta.
      </div>
    );
  }

  const parsePlan = (planStr: string | null) => {
    if (!planStr) return null;
    try {
      return typeof planStr === 'string' ? JSON.parse(planStr) : planStr;
    } catch {
      return null;
    }
  };

  // Helper function to format autorefractor/lensometry text
  const formatRefractionText = (text: string | null): string => {
    if (!text) return '';
    
    // Format: "OD: 3 4 x 25 | OS: 3 2 x 25" -> "OD: Esf +3.00 Cil -4.00 Eje 25° | OS: Esf +3.00 Cil -2.00 Eje 25°"
    const parts = text.split('|').map(part => part.trim());
    
    return parts.map(part => {
      const match = part.match(/(OD|OS):\s*([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)\s+x\s+(\d+)/i);
      if (match) {
        const [, eye, sphere, cyl, axis] = match;
        const sphereNum = parseFloat(sphere);
        const cylNum = parseFloat(cyl);
        const sphereSign = sphereNum >= 0 ? '+' : '';
        const cylSign = cylNum >= 0 ? '+' : '';
        return `${eye}: Esf ${sphereSign}${sphereNum.toFixed(2)} Cil ${cylSign}${cylNum.toFixed(2)} Eje ${axis}°`;
      }
      return part;
    }).join(' | ');
  };

  // Helper function to convert plan object properties to readable text
  const formatPlanValue = (value: any): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'object' && value !== null) {
      // If it's an object with boolean values, return the keys that are true
      const trueKeys = Object.keys(value).filter(key => value[key] === true);
      return trueKeys.join(', ');
    }
    return '';
  };

  const planOD = parsePlan(examEyes?.od?.plan as string | null);

  return (
    <div className="space-y-6">
      {/* Diagnóstico Previo - from previous encounter */}
      {!hideDiagnosisPrevio && previousEncounter?.summary && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-3">Diagnóstico Previo</h2>
          <p className="text-sm whitespace-pre-wrap">{previousEncounter.summary}</p>
        </div>
      )}

      {/* Additional sections after diagnosis (for ReconsultaView) */}
      {additionalSectionsAfterDiagnosis}

      {/* Motivo de consulta */}
      {encounter.motivo_consulta && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Motivo de consulta</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {encounter.motivo_consulta}
          </div>
        </div>
      )}

      {/* Antecedentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-semibold">Antecedentes personales</h2>
            {patient?.diabetes && <Badge variant="default">Diabetes</Badge>}
            {patient?.hta && <Badge variant="default">HTA</Badge>}
            {patient?.allergies && <Badge variant="default">Alergia: {patient.allergies}</Badge>}
          </div>
          {patient?.notes && (
            <p className="text-sm whitespace-pre-wrap">{patient.notes}</p>
          )}
        </div>

        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-3">Antecedentes oftalmológicos</h2>
          {patient?.ophthalmic_history && (
            <p className="text-sm whitespace-pre-wrap">{patient.ophthalmic_history}</p>
          )}
        </div>
      </div>

      {/* Preconsulta */}
      {appointment && (appointment.autorefractor || appointment.lensometry || appointment.keratometry_od_k1 || appointment.pio_od) && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-6">Preconsulta</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              {appointment.autorefractor && (
                <div>
                  <h3 className="text-base font-semibold mb-4">Autorrefractómetro</h3>
                  <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
                    {formatRefractionText(appointment.autorefractor)}
                  </div>
                </div>
              )}
              {appointment.lensometry && (
                <div>
                  <h3 className="text-base font-semibold mb-4">Lensometría</h3>
                  <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
                    {formatRefractionText(appointment.lensometry)}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-6">
              {(appointment.keratometry_od_k1 || appointment.keratometry_os_k1) && (
                  <div>
                    <h3 className="text-base font-semibold mb-4">Queratometrías</h3>
                    <div className="space-y-2">
                      {(appointment as any).keratometry_od_k1 && (
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                          <span className="font-medium">OD:</span> K1: {(appointment as any).keratometry_od_k1}, K2: {(appointment as any).keratometry_od_k2}
                          {(appointment as any).keratometry_od_axis && `, Eje: ${(appointment as any).keratometry_od_axis}`}
                        </div>
                      )}
                      {(appointment as any).keratometry_os_k1 && (
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                          <span className="font-medium">OS:</span> K1: {(appointment as any).keratometry_os_k1}, K2: {(appointment as any).keratometry_os_k2}
                          {(appointment as any).keratometry_os_axis && `, Eje: ${(appointment as any).keratometry_os_axis}`}
                        </div>
                      )}
                    </div>
                  </div>
              )}
              {(appointment.pio_od || appointment.pio_os) && (
                <div>
                  <h3 className="text-base font-semibold mb-4">PIO</h3>
                  <div className="space-y-2">
                    {appointment.pio_od && (
                      <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                        <span className="font-medium">OD:</span> {appointment.pio_od} mmHg
                      </div>
                    )}
                    {appointment.pio_os && (
                      <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                        <span className="font-medium">OS:</span> {appointment.pio_os} mmHg
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agudeza Visual y Refracción */}
      {examEyes && (examEyes.od || examEyes.os) && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-6">Agudeza Visual y Refracción</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold mb-3">Agudeza Visual</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-2 block">Sin corrección</Label>
                  <div className="space-y-2">
                    {examEyes.od?.av_sc && (
                      <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                        <span className="font-medium">OD:</span> {examEyes.od.av_sc}
                      </div>
                    )}
                    {examEyes.os?.av_sc && (
                      <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                        <span className="font-medium">OS:</span> {examEyes.os.av_sc}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-sm mb-2 block">Con corrección</Label>
                  <div className="space-y-2">
                    {examEyes.od?.av_cc && (
                      <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                        <span className="font-medium">OD:</span> {examEyes.od.av_cc}
                      </div>
                    )}
                    {examEyes.os?.av_cc && (
                      <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                        <span className="font-medium">OS:</span> {examEyes.os.av_cc}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {((examEyes.od?.ref_subj_sphere || examEyes.os?.ref_subj_sphere)) && (
              <div>
                <h3 className="text-base font-semibold mb-3">Refracción Subjetiva</h3>
                <div className="space-y-2">
                  {examEyes.od?.ref_subj_sphere !== null && (
                    <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                      <span className="font-medium">OD:</span> Esf: {examEyes.od.ref_subj_sphere}, Cil: {examEyes.od.ref_subj_cyl}, Eje: {examEyes.od.ref_subj_axis}, AV: {examEyes.od.ref_subj_av}
                    </div>
                  )}
                  {examEyes.os?.ref_subj_sphere !== null && (
                    <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                      <span className="font-medium">OS:</span> Esf: {examEyes.os.ref_subj_sphere}, Cil: {examEyes.os.ref_subj_cyl}, Eje: {examEyes.os.ref_subj_axis}, AV: {examEyes.os.ref_subj_av}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receta */}
      {examEyes && (examEyes.od?.rx_sphere !== null || examEyes.os?.rx_sphere !== null) && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Receta</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              {examEyes.od?.rx_sphere !== null && (
                <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                  <span className="font-medium">OD:</span> Esf: {examEyes.od.rx_sphere}, Cil: {examEyes.od.rx_cyl}, Eje: {examEyes.od.rx_axis}, Add: {examEyes.od.rx_add}
                </div>
              )}
              {examEyes.os?.rx_sphere !== null && (
                <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                  <span className="font-medium">OS:</span> Esf: {examEyes.os.rx_sphere}, Cil: {examEyes.os.rx_cyl}, Eje: {examEyes.os.rx_axis}, Add: {examEyes.os.rx_add}
                </div>
              )}
            </div>

            {planOD && (
              <div className="space-y-2">
                {planOD.material && (
                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                    <span className="font-medium">Material:</span> {formatPlanValue(planOD.material)}
                  </div>
                )}
                {planOD.color && (
                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                    <span className="font-medium">Color:</span> {formatPlanValue(planOD.color)}
                  </div>
                )}
                {planOD.tipo && (
                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                    <span className="font-medium">Tipo:</span> {formatPlanValue(planOD.tipo)}
                  </div>
                )}
                {planOD.dp && (
                  <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                    <span className="font-medium">DP:</span> {formatPlanValue(planOD.dp)}
                  </div>
                )}
              </div>
            )}

            {examEyes.od?.prescription_notes && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">Notas</Label>
                <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
                  {examEyes.od.prescription_notes}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lámpara de Hendidura */}
      {(examEyes?.od?.slit_lamp || examEyes?.os?.slit_lamp) && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Lámpara de Hendidura</h2>
          <div className="space-y-2">
            {examEyes.od?.slit_lamp && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">OD</Label>
                <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
                  {examEyes.od.slit_lamp}
                </div>
              </div>
            )}
            {examEyes.os?.slit_lamp && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">OS</Label>
                <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
                  {examEyes.os.slit_lamp}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PIO del examen */}
      {(examEyes?.od?.iop || examEyes?.os?.iop) && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">PIO</h2>
          <div className="grid grid-cols-2 gap-4">
            {examEyes.od?.iop && (
              <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                <span className="font-medium">OD:</span> {examEyes.od.iop} mmHg
              </div>
            )}
            {examEyes.os?.iop && (
              <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                <span className="font-medium">OS:</span> {examEyes.os.iop} mmHg
              </div>
            )}
          </div>
        </div>
      )}

      {/* Excursiones */}
      {(encounter.excursiones_od || encounter.excursiones_os) && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Excursiones</h2>
          <div className="grid grid-cols-2 gap-4">
            {encounter.excursiones_od && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">OD</Label>
                <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                  {encounter.excursiones_od}
                </div>
              </div>
            )}
            {encounter.excursiones_os && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">OS</Label>
                <div className="px-3 py-2 rounded-md border bg-muted text-sm">
                  {encounter.excursiones_os}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diagnóstico */}
      {encounter.summary && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Diagnóstico</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {encounter.summary}
          </div>
        </div>
      )}

      {/* Plan de Tratamiento */}
      {encounter.plan_tratamiento && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Plan de Tratamiento</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {encounter.plan_tratamiento}
          </div>
        </div>
      )}

      {/* Cirugías Recomendadas */}
      {encounter.cirugias && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Cirugías Recomendadas</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {encounter.cirugias}
          </div>
        </div>
      )}

      {/* Estudios Recomendados */}
      {encounter.estudios && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Estudios Recomendados</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm whitespace-pre-wrap">
            {encounter.estudios}
          </div>
        </div>
      )}

      {/* Próxima Cita */}
      {encounter.proxima_cita && (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">Próxima Cita</h2>
          <div className="px-3 py-2 rounded-md border bg-muted text-sm">
            {encounter.proxima_cita}
          </div>
        </div>
      )}
    </div>
  );
}
