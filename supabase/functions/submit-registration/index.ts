import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SubmitRegistrationRequest {
  email: string
  password: string
  fullName: string
  role: 'admin' | 'doctor' | 'nurse' | 'reception' | 'diagnostico'
  specialty?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[Submit Registration] Request received')
    
    // Create Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Parse request body
    const { email, password, fullName, role, specialty }: SubmitRegistrationRequest = await req.json()

    console.log('[Submit Registration] Processing for email:', email)

    // Validate email format
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Email inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate password length
    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if email already exists in auth.users
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const emailExists = existingUsers?.users.some(u => u.email === email)
    
    if (emailExists) {
      return new Response(
        JSON.stringify({ error: 'Este correo electrónico ya está registrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if email already has a registration
    const { data: existingRegistration } = await supabaseAdmin
      .from('pending_registrations')
      .select('id, status')
      .eq('email', email)
      .maybeSingle()

    if (existingRegistration) {
      if (existingRegistration.status === 'pending') {
        return new Response(
          JSON.stringify({ error: 'Ya existe una solicitud pendiente para este correo' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Si existe (aprobada o rechazada), reutilizamos el registro y lo reiniciamos a "pending"
      const passwordHash = password // Almacenamos temporalmente hasta la aprobación
      
      const { data: registration, error: updateError } = await supabaseAdmin
        .from('pending_registrations')
        .update({
          password_hash: passwordHash,
          full_name: fullName,
          role,
          specialty: role === 'doctor' ? specialty : null,
          status: 'pending',
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null
        })
        .eq('id', existingRegistration.id)
        .select()
        .single()

      if (updateError) {
        console.error('[Submit Registration] Update error:', updateError)
        return new Response(
          JSON.stringify({ error: 'Error al reenviar solicitud: ' + updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('[Submit Registration] Registration re/ submitted successfully:', registration.id)

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Solicitud enviada/actualizada. Espera la aprobación del administrador.',
          registrationId: registration.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store password temporarily - will be properly hashed by Supabase Auth when approved
    const passwordHash = password

    // Insert new registration request
    const { data: registration, error: insertError } = await supabaseAdmin
      .from('pending_registrations')
      .insert({
        email,
        password_hash: passwordHash,
        full_name: fullName,
        role,
        specialty: role === 'doctor' ? specialty : null,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Submit Registration] Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Error al enviar solicitud: ' + insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Submit Registration] Registration submitted successfully:', registration.id)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Solicitud enviada exitosamente. Espera la aprobación del administrador.',
        registrationId: registration.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Submit Registration] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})