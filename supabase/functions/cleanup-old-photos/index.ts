import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log('🧹 Iniciando limpieza de fotos antiguas...');

    // Fecha límite: hace 15 días
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const cutoffDate = fifteenDaysAgo.toISOString();

    console.log(`📅 Buscando citas anteriores a: ${cutoffDate}`);

    // Buscar citas con fotos que tengan más de 15 días
    const { data: oldAppointments, error: fetchError } = await supabase
      .from('appointments')
      .select('id, photo_od, photo_oi, starts_at')
      .lt('starts_at', cutoffDate)
      .or('photo_od.not.is.null,photo_oi.not.is.null');

    if (fetchError) {
      console.error('❌ Error al buscar citas:', fetchError);
      throw fetchError;
    }

    console.log(`📊 Citas encontradas con fotos: ${oldAppointments?.length || 0}`);

    if (!oldAppointments || oldAppointments.length === 0) {
      console.log('✅ No hay fotos antiguas para eliminar');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No hay fotos antiguas para eliminar',
          deleted: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let deletedPhotos = 0;
    const errors = [];

    // Procesar cada cita
    for (const appointment of oldAppointments) {
      const photosToDelete = [];
      
      if (appointment.photo_od) {
        photosToDelete.push(appointment.photo_od);
      }
      if (appointment.photo_oi) {
        photosToDelete.push(appointment.photo_oi);
      }

      // Eliminar fotos del storage
      if (photosToDelete.length > 0) {
        console.log(`🗑️ Eliminando ${photosToDelete.length} fotos de cita ${appointment.id}`);
        
        const { error: deleteError } = await supabase.storage
          .from('results')
          .remove(photosToDelete);

        if (deleteError) {
          console.error(`❌ Error al eliminar fotos de ${appointment.id}:`, deleteError);
          errors.push({ appointmentId: appointment.id, error: deleteError.message });
        } else {
          deletedPhotos += photosToDelete.length;
          
          // Actualizar la cita para quitar las referencias
          const updateData: { photo_od?: null; photo_oi?: null } = {};
          if (appointment.photo_od) updateData.photo_od = null;
          if (appointment.photo_oi) updateData.photo_oi = null;

          const { error: updateError } = await supabase
            .from('appointments')
            .update(updateData)
            .eq('id', appointment.id);

          if (updateError) {
            console.error(`❌ Error al actualizar cita ${appointment.id}:`, updateError);
            errors.push({ appointmentId: appointment.id, error: updateError.message });
          } else {
            console.log(`✅ Fotos eliminadas y referencias actualizadas para cita ${appointment.id}`);
          }
        }
      }
    }

    const result = {
      success: true,
      message: `Limpieza completada: ${deletedPhotos} fotos eliminadas`,
      deleted: deletedPhotos,
      appointmentsProcessed: oldAppointments.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log('✅ Limpieza completada:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error en limpieza de fotos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
