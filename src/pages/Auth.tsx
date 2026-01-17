import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Eye, Settings, Loader2, Shield } from 'lucide-react';
import { AppRole } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AppRole>('reception');
  const [specialty, setSpecialty] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Bootstrap states
  const [bootstrapName, setBootstrapName] = useState('');
  const [bootstrapEmail, setBootstrapEmail] = useState('');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  
  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Check if any admin exists using RPC function (works for anon users)
  const { data: hasAdmins, isLoading: checkingAdmins } = useQuery({
    queryKey: ['check-admins-exist'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_exists');
      
      if (error) {
        console.error('Error checking admins:', error);
        return true; // Assume admins exist on error to prevent accidental bootstrap
      }
      
      return data === true;
    },
  });

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBootstrapping(true);

    try {
      // 1. Create user with signUp
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: bootstrapEmail,
        password: bootstrapPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: bootstrapName,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (!signUpData.user) {
        throw new Error('No se pudo crear el usuario');
      }

      // 2. Insert admin role (RLS policy allows this only if no admins exist)
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: signUpData.user.id,
          role: 'admin',
        });

      if (roleError) {
        throw roleError;
      }

      // 3. Sign in automatically
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: bootstrapEmail,
        password: bootstrapPassword,
      });

      if (signInError) {
        throw signInError;
      }

      toast({
        title: 'Administrador creado exitosamente',
        description: 'Bienvenido al sistema. Ahora puedes crear más usuarios desde el panel de administración.',
      });

      navigate('/');
    } catch (error: any) {
      console.error('Error en bootstrap:', error);
      toast({
        title: 'Error al crear administrador',
        description: error.message || 'No se pudo completar la configuración inicial',
        variant: 'destructive',
      });
    } finally {
      setIsBootstrapping(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({
        title: 'Error al iniciar sesión',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Sesión iniciada',
        description: 'Bienvenido al sistema',
      });
    }

    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Call the submit-registration edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role,
          specialty: role === 'doctor' ? specialty : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al enviar solicitud');
      }

      toast({
        title: 'Solicitud enviada',
        description: 'Tu solicitud ha sido enviada. Espera la aprobación del administrador para acceder al sistema.',
      });

      // Clear form
      setEmail('');
      setPassword('');
      setFullName('');
      setRole('reception');
      setSpecialty('');
    } catch (error: any) {
      console.error('Error submitting registration:', error);
      toast({
        title: 'Error al registrarse',
        description: error.message || 'No se pudo enviar la solicitud',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while checking for admins
  if (checkingAdmins) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Verificando configuración del sistema...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Bootstrap form - shown only when no admins exist
  if (hasAdmins === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-primary p-3 rounded-full">
                <Settings className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Configuración Inicial</CardTitle>
            <CardDescription>Centrovisión EHR - Primera vez</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
              <Shield className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                Esta es la primera vez que se inicia el sistema. Crea el primer administrador para comenzar.
              </AlertDescription>
            </Alert>
            
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bootstrap-name">Nombre Completo</Label>
                <Input
                  id="bootstrap-name"
                  type="text"
                  placeholder=""
                  value={bootstrapName}
                  onChange={(e) => setBootstrapName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bootstrap-email">Email</Label>
                <Input
                  id="bootstrap-email"
                  type="email"
                  placeholder=""
                  value={bootstrapEmail}
                  onChange={(e) => setBootstrapEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bootstrap-password">Contraseña</Label>
                <Input
                  id="bootstrap-password"
                  type="password"
                  value={bootstrapPassword}
                  onChange={(e) => setBootstrapPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              
              <Button type="submit" className="w-full" disabled={isBootstrapping}>
                {isBootstrapping ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando administrador...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Crear Administrador Inicial
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal login/signup form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary p-3 rounded-full">
              <Eye className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Centrovisión EHR</CardTitle>
          <CardDescription>Sistema de Historia Clínica Electrónica</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="signup">Registrarse</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullname">Nombre Completo</Label>
                  <Input
                    id="fullname"
                    type="text"
                    placeholder="Juan Pérez"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Contraseña</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rol</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as AppRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="doctor">Médico</SelectItem>
                      <SelectItem value="nurse">Enfermería</SelectItem>
                      <SelectItem value="reception">Recepción</SelectItem>
                      <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                      <SelectItem value="caja">Caja</SelectItem>
                      <SelectItem value="contabilidad">Contabilidad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {role === 'doctor' && (
                  <div className="space-y-2">
                    <Label htmlFor="specialty">Sub-especialidad</Label>
                    <Input
                      id="specialty"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      placeholder="Ej: Oftalmología, Retina, Glaucoma"
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Enviando solicitud...' : 'Enviar Solicitud'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
