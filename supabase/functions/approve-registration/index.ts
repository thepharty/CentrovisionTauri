import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ApproveRegistrationRequest {
  registrationId: string
  approve: boolean
  rejectionReason?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[Approve Registration] Request received')
    
    // Create Supabase client with service role
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

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has admin role (using RPC function)
    const { data: isAdmin, error: roleError } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'admin' })

    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only admins can approve registrations' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { registrationId, approve, rejectionReason }: ApproveRegistrationRequest = await req.json()

    console.log('[Approve Registration] Processing registration:', registrationId, 'Action:', approve ? 'approve' : 'reject')

    // Get the registration
    const { data: registration, error: fetchError } = await supabaseAdmin
      .from('pending_registrations')
      .select('*')
      .eq('id', registrationId)
      .single()

    if (fetchError || !registration) {
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (registration.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'This registration has already been processed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!approve) {
      // Reject the registration
      const { error: updateError } = await supabaseAdmin
        .from('pending_registrations')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          rejection_reason: rejectionReason || 'No reason provided'
        })
        .eq('id', registrationId)

      if (updateError) {
        console.error('[Approve Registration] Update error:', updateError)
        return new Response(
          JSON.stringify({ error: 'Error rejecting registration' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('[Approve Registration] Registration rejected')
      return new Response(
        JSON.stringify({ success: true, message: 'Registration rejected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Approve: Create the user with their original password
    const userPassword = registration.password_hash
    
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: registration.email,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        full_name: registration.full_name,
      }
    })

    if (createError) {
      console.error('[Approve Registration] Create user error:', createError)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Approve Registration] User created:', newUser.user.id)

    // Wait for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Update the profile
    const profileUpdate: { email: string; specialty?: string } = { email: registration.email }
    if (registration.role === 'doctor' && registration.specialty) {
      profileUpdate.specialty = registration.specialty
    }
    
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('user_id', newUser.user.id)

    if (profileError) {
      console.error('[Approve Registration] Profile update error:', profileError)
    }

    // Create user role
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: newUser.user.id,
        role: registration.role,
      })

    if (roleInsertError) {
      console.error('[Approve Registration] Role insert error:', roleInsertError)
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return new Response(
        JSON.stringify({ error: 'Failed to create user role: ' + roleInsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update registration status
    const { error: updateError } = await supabaseAdmin
      .from('pending_registrations')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .eq('id', registrationId)

    if (updateError) {
      console.error('[Approve Registration] Status update error:', updateError)
    }

    console.log('[Approve Registration] Registration approved successfully')

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'User approved and created successfully',
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Approve Registration] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})