import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, UserPlus, LogOut, Users, ClipboardCheck, CheckCircle, XCircle, Pencil, ArrowLeft, Settings, Plus, HardDrive, Building, Database, Zap, Shield, ShieldOff, ChevronDown, ChevronRight, Eye, EyeOff, Camera } from 'lucide-react';
import StorageMonitor from '@/components/admin/StorageMonitor';
import ClinicalOptionsManager from '@/components/admin/ClinicalOptionsManager';
import DataExporter from '@/components/admin/DataExporter';
import BranchesManager from '@/components/admin/BranchesManager';
import BackupManager from '@/components/admin/BackupManager';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppRole } from '@/types/database';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { useAppSettings } from '@/hooks/useAppSettings';

interface UserWithProfile {
  user_id: string;
  email: string;
  full_name: string;
  roles: AppRole[];
  specialty?: string;
  created_at: string;
  is_visible_in_dashboard?: boolean;
}

interface PendingRegistration {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  specialty?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

type AdminSection = 
  | 'crear-usuario' 
  | 'usuarios-sistema' 
  | 'pendientes' 
  | 'opciones-clinicas' 
  | 'sucursales' 
  | 'almacenamiento' 
  | 'migracion' 
  | 'backups'
  | 'edge-functions'
  | 'configuracion-general';

export default function Admin() {
  const { role, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<AdminSection>('crear-usuario');
  const [usuariosOpen, setUsuariosOpen] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('reception');
  const [specialty, setSpecialty] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [showFirstWarning, setShowFirstWarning] = useState(false);
  const [showSecondWarning, setShowSecondWarning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [processingRegistrationId, setProcessingRegistrationId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserWithProfile | null>(null);
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editGender, setEditGender] = useState<'M' | 'F'>('M');
  const [newPassword, setNewPassword] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  // Estados para añadir roles
  const [addingRoleUserId, setAddingRoleUserId] = useState<string | null>(null);
  const [roleToAdd, setRoleToAdd] = useState<AppRole | null>(null);
  const [isAddingRole, setIsAddingRole] = useState(false);
  
  // App settings
  const { isCRMVisibleForAll, updateSetting, isUpdating } = useAppSettings();

  // Verificar que el usuario es admin
  const isAdmin = roles.includes('admin');
  if (roles.length > 0 && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      // Get all user roles with profiles including email
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          role,
          created_at
        `);

      if (rolesError) throw rolesError;
      if (!userRoles || userRoles.length === 0) return [];

      // Get profiles for all users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, specialty, is_visible_in_dashboard')
        .in('user_id', userRoles.map(r => r.user_id));

      if (profilesError) throw profilesError;

      // Group all roles by user_id
      const userMap = new Map<string, UserWithProfile>();
      
      userRoles.forEach(ur => {
        const profile = profiles?.find(p => p.user_id === ur.user_id);
        const existing = userMap.get(ur.user_id);
        
        if (existing) {
          // Agregar rol al array si no existe
          if (!existing.roles.includes(ur.role)) {
            existing.roles.push(ur.role);
          }
        } else {
          userMap.set(ur.user_id, {
            user_id: ur.user_id,
            email: profile?.email || 'N/A',
            full_name: profile?.full_name || 'N/A',
            roles: [ur.role],
            specialty: profile?.specialty,
            created_at: ur.created_at,
            is_visible_in_dashboard: profile?.is_visible_in_dashboard ?? true,
          });
        }
      });

      return Array.from(userMap.values());
    },
    enabled: isAdmin,
  });

  const { data: pendingRegistrations = [], isLoading: isLoadingPending } = useQuery({
    queryKey: ['pending-registrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_registrations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PendingRegistration[];
    },
    enabled: isAdmin,
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      // Call edge function to create user
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role: selectedRole,
          specialty: selectedRole === 'doctor' ? specialty : undefined,
          gender: selectedRole === 'doctor' ? gender : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear usuario');
      }

      toast({
        title: 'Usuario creado',
        description: `Usuario ${email} creado exitosamente.`,
      });

      // Reset form
      setEmail('');
      setPassword('');
      setFullName('');
      setSelectedRole('reception');
      setSpecialty('');
      setGender('M');

      // Refresh users list
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el usuario.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClick = (userId: string) => {
    setDeleteUserId(userId);
    setShowFirstWarning(true);
  };

  const handleFirstWarningConfirm = () => {
    setShowFirstWarning(false);
    setShowSecondWarning(true);
  };

  const handleFinalDelete = async () => {
    if (!deleteUserId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      // Call edge function to delete user
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: deleteUserId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al eliminar usuario');
      }

      toast({
        title: 'Usuario eliminado',
        description: 'El usuario ha sido eliminado exitosamente.',
      });

      // Refresh users list
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar el usuario.',
        variant: 'destructive',
      });
    } finally {
      setShowSecondWarning(false);
      setDeleteUserId(null);
    }
  };

  const handleApproveRegistration = async (registrationId: string) => {
    setProcessingRegistrationId(registrationId);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-registration`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId,
          approve: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al aprobar solicitud');
      }

      toast({
        title: 'Solicitud aprobada',
        description: 'El usuario ha sido creado y puede acceder al sistema.',
      });

      // Refresh lists
      queryClient.invalidateQueries({ queryKey: ['pending-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (error: any) {
      console.error('Error approving registration:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar la solicitud.',
        variant: 'destructive',
      });
    } finally {
      setProcessingRegistrationId(null);
    }
  };

  const handleRejectRegistration = async (registrationId: string) => {
    setProcessingRegistrationId(registrationId);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-registration`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId,
          approve: false,
          rejectionReason: 'Rechazado por el administrador',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al rechazar solicitud');
      }

      toast({
        title: 'Solicitud rechazada',
        description: 'La solicitud ha sido rechazada.',
      });

      // Refresh list
      queryClient.invalidateQueries({ queryKey: ['pending-registrations'] });
    } catch (error: any) {
      console.error('Error rejecting registration:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo rechazar la solicitud.',
        variant: 'destructive',
      });
    } finally {
      setProcessingRegistrationId(null);
    }
  };

  const handleEditUser = (user: UserWithProfile) => {
    setEditingUser(user);
    setEditSpecialty(user.specialty || '');
    setEditGender(((user as any).gender || 'M') as 'M' | 'F');
    setNewPassword('');
  };

  const handleAddRole = async () => {
    if (!addingRoleUserId || !roleToAdd) return;

    setIsAddingRole(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: addingRoleUserId, role: roleToAdd });

      if (error) {
        if (error.code === '23505') {
          throw new Error('El usuario ya tiene este rol');
        }
        throw error;
      }

      toast({
        title: 'Rol añadido',
        description: `Rol "${roleLabels[roleToAdd]}" agregado exitosamente.`,
      });

      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (error: any) {
      console.error('Error adding role:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo añadir el rol.',
        variant: 'destructive',
      });
    } finally {
      setIsAddingRole(false);
      setAddingRoleUserId(null);
      setRoleToAdd(null);
    }
  };

  const getCurrentUserRoles = (): AppRole[] => {
    if (!addingRoleUserId) return [];
    const user = users.find(u => u.user_id === addingRoleUserId);
    return user?.roles || [];
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    setIsSavingEdit(true);
    try {
      // Si hay nueva contraseña, actualizarla via edge function
      if (newPassword.trim()) {
        if (newPassword.length < 6) {
          toast({
            title: 'Error',
            description: 'La contraseña debe tener al menos 6 caracteres',
            variant: 'destructive',
          });
          setIsSavingEdit(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('No hay sesión activa');
        }

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-password`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: editingUser.user_id,
            newPassword: newPassword.trim(),
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Error al cambiar contraseña');
        }
      }

      // Actualizar specialty/gender en profiles
      const isDoctor = editingUser.roles.includes('doctor');
      const { error } = await supabase
        .from('profiles')
        .update({ 
          specialty: isDoctor ? editSpecialty : null,
          gender: isDoctor ? editGender : null
        })
        .eq('user_id', editingUser.user_id);

      if (error) throw error;

      toast({
        title: 'Usuario actualizado',
        description: newPassword.trim() 
          ? 'Contraseña y datos actualizados exitosamente.'
          : 'La información del usuario ha sido actualizada exitosamente.',
      });

      // Refresh users list
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingUser(null);
      setEditSpecialty('');
      setEditGender('M');
      setNewPassword('');
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar el usuario.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const roleLabels: Record<AppRole, string> = {
    admin: 'Administrador',
    doctor: 'Médico',
    nurse: 'Enfermería',
    reception: 'Recepción',
    diagnostico: 'Diagnóstico',
    caja: 'Caja',
    contabilidad: 'Contabilidad',
    estudios: 'Estudios',
  };

  const roleColors: Record<AppRole, string> = {
    admin: 'bg-red-500',
    doctor: 'bg-blue-500',
    nurse: 'bg-green-500',
    reception: 'bg-yellow-500',
    diagnostico: 'bg-purple-500',
    caja: 'bg-orange-500',
    contabilidad: 'bg-cyan-500',
    estudios: 'bg-pink-500',
  };

  const sidebarItems = [
    { id: 'configuracion-general' as AdminSection, label: 'Configuración General', icon: Settings },
    { id: 'opciones-clinicas' as AdminSection, label: 'Opciones Clínicas', icon: Settings },
    { id: 'sucursales' as AdminSection, label: 'Sucursales', icon: Building },
    { id: 'almacenamiento' as AdminSection, label: 'Almacenamiento', icon: HardDrive },
    { id: 'backups' as AdminSection, label: 'Backups', icon: Camera },
    { id: 'migracion' as AdminSection, label: 'Migración', icon: Database },
    { id: 'edge-functions' as AdminSection, label: 'Edge Functions', icon: Zap },
  ];

  const usuariosSubItems = [
    { id: 'crear-usuario' as AdminSection, label: 'Crear Usuario', icon: UserPlus },
    { id: 'usuarios-sistema' as AdminSection, label: 'Usuarios del Sistema', icon: Users },
    { id: 'pendientes' as AdminSection, label: 'Pendientes', icon: ClipboardCheck, badge: pendingRegistrations.length },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Panel de Administración</h1>
              <p className="text-sm text-muted-foreground">Gestión de usuarios del sistema</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Dashboard
            </Button>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-muted/30 p-4 flex-shrink-0">
          <nav className="space-y-2">
            {/* Usuarios - Collapsible */}
            <Collapsible open={usuariosOpen} onOpenChange={setUsuariosOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    "hover:bg-muted",
                    (activeSection === 'crear-usuario' || activeSection === 'usuarios-sistema' || activeSection === 'pendientes')
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Usuarios</span>
                    {pendingRegistrations.length > 0 && (
                      <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                        {pendingRegistrations.length}
                      </Badge>
                    )}
                  </div>
                  {usuariosOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 mt-1 space-y-1">
                {usuariosSubItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                      activeSection === item.id
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && item.badge > 0 && (
                      <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>

            {/* Other items */}
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeSection === item.id
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          {/* Configuración General */}
          {activeSection === 'configuracion-general' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuración General
                </CardTitle>
                <CardDescription>Ajustes globales del sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* CRM Visibility Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">CRM visible para todos los roles</Label>
                    <p className="text-sm text-muted-foreground">
                      Si está desactivado, solo los administradores verán el botón de CRM en el Dashboard
                    </p>
                  </div>
                  <Switch
                    checked={isCRMVisibleForAll}
                    onCheckedChange={(checked) => 
                      updateSetting({ 
                        key: 'crm_visibility', 
                        value: { enabled_for_all: checked } 
                      })
                    }
                    disabled={isUpdating}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Crear Usuario */}
          {activeSection === 'crear-usuario' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Crear Usuario
                </CardTitle>
                <CardDescription>Agrega un nuevo usuario al sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nombre Completo</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Juan Pérez"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="usuario@ejemplo.com"
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
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rol</Label>
                    <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as AppRole)}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="doctor">Médico</SelectItem>
                        <SelectItem value="nurse">Enfermería</SelectItem>
                        <SelectItem value="reception">Recepción</SelectItem>
                        <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                        <SelectItem value="caja">Caja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedRole === 'doctor' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="specialty">Sub-especialidad</Label>
                        <Input
                          id="specialty"
                          value={specialty}
                          onChange={(e) => setSpecialty(e.target.value)}
                          placeholder="Ej: Oftalmología, Retina, Glaucoma"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gender">Género</Label>
                        <Select value={gender} onValueChange={(value) => setGender(value as 'M' | 'F')}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar género" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="M">Masculino (Dr.)</SelectItem>
                            <SelectItem value="F">Femenino (Dra.)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <Button type="submit" className="w-full" disabled={isCreating}>
                    {isCreating ? 'Creando...' : 'Crear Usuario'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Usuarios del Sistema */}
          {activeSection === 'usuarios-sistema' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  Usuarios del Sistema
                </h2>
                <p className="text-muted-foreground">
                  {users.length} {users.length === 1 ? 'usuario registrado' : 'usuarios registrados'} - Agrupados por rol
                </p>
              </div>
              
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay usuarios registrados</div>
              ) : (
                <div className="space-y-3">
                  {(Object.keys(roleLabels) as AppRole[]).map((roleKey) => {
                    const usersWithRole = users.filter(u => u.roles.includes(roleKey));
                    if (usersWithRole.length === 0) return null;
                    
                    return (
                      <Collapsible key={roleKey} defaultOpen={roleKey === 'admin' || roleKey === 'doctor'}>
                        <CollapsibleTrigger asChild>
                          <button
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                              "hover:bg-muted/50 border bg-card"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Badge className={`${roleColors[roleKey]} text-white`}>
                                {roleLabels[roleKey]}
                              </Badge>
                              <span className="text-muted-foreground">
                                {usersWithRole.length} {usersWithRole.length === 1 ? 'usuario' : 'usuarios'}
                              </span>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="ml-10 mt-2 space-y-2">
                          {usersWithRole.map((user) => {
                            const isDoctor = user.roles.includes('doctor');
                            const isVisible = user.is_visible_in_dashboard ?? true;
                            
                            const handleToggleVisibility = async () => {
                              if (!isDoctor) return;
                              try {
                                const { error } = await supabase
                                  .from('profiles')
                                  .update({ is_visible_in_dashboard: !isVisible })
                                  .eq('user_id', user.user_id);
                                
                                if (error) throw error;
                                queryClient.invalidateQueries({ queryKey: ['admin-users'] });
                                queryClient.invalidateQueries({ queryKey: ['sidebar-doctors'] });
                                toast({ title: isVisible ? 'Doctor oculto del dashboard' : 'Doctor visible en dashboard' });
                              } catch (error) {
                                toast({ title: 'Error al cambiar visibilidad', variant: 'destructive' });
                              }
                            };

                            return (
                            <div 
                              key={`${roleKey}-${user.user_id}`} 
                              className="flex items-start justify-between gap-4 p-3 rounded-lg bg-card border"
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {isDoctor && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleToggleVisibility}
                                    className="h-7 w-7 flex-shrink-0"
                                    title={isVisible ? 'Ocultar del dashboard' : 'Mostrar en dashboard'}
                                  >
                                    {isVisible ? (
                                      <Eye className="h-4 w-4 text-primary" />
                                    ) : (
                                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <p className="font-medium">{user.full_name}</p>
                                  {user.roles.length > 1 && (
                                    <div className="flex gap-1 flex-wrap">
                                      {user.roles.filter(r => r !== roleKey).map((r) => (
                                        <Badge key={r} variant="outline" className="text-xs">
                                          +{roleLabels[r]}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                                {user.roles.includes('doctor') && user.specialty && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {user.specialty}
                                  </p>
                                )}
                                </div>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 hover:text-green-600 hover:bg-green-100"
                                  onClick={() => setAddingRoleUserId(user.user_id)}
                                  title="Añadir rol adicional"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={() => handleEditUser(user)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteClick(user.user_id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pendientes */}
          {activeSection === 'pendientes' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Registros Pendientes de Aprobar
                </CardTitle>
                <CardDescription>
                  {pendingRegistrations.length} {pendingRegistrations.length === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-300px)] pr-4">
                  <div className="space-y-3">
                    {isLoadingPending ? (
                      <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                    ) : pendingRegistrations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No hay solicitudes pendientes
                      </div>
                    ) : (
                      pendingRegistrations.map((registration) => (
                        <Card key={registration.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-medium">{registration.full_name}</p>
                                  <Badge className={`${roleColors[registration.role]} text-white`}>
                                    {roleLabels[registration.role]}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{registration.email}</p>
                                {registration.specialty && (
                                  <p className="text-sm text-muted-foreground">
                                    Especialidad: {registration.specialty}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Solicitado: {new Date(registration.created_at).toLocaleDateString('es-ES', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleApproveRegistration(registration.id)}
                                  disabled={processingRegistrationId === registration.id}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Aprobar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRejectRegistration(registration.id)}
                                  disabled={processingRegistrationId === registration.id}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Rechazar
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Opciones Clínicas */}
          {activeSection === 'opciones-clinicas' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Opciones Clínicas
                </CardTitle>
                <CardDescription>Gestiona cirugías, estudios y procedimientos disponibles</CardDescription>
              </CardHeader>
              <CardContent>
                <ClinicalOptionsManager />
              </CardContent>
            </Card>
          )}

          {/* Sucursales */}
          {activeSection === 'sucursales' && (
            <BranchesManager />
          )}

          {/* Almacenamiento */}
          {activeSection === 'almacenamiento' && (
            <StorageMonitor />
          )}

          {/* Backups */}
          {activeSection === 'backups' && (
            <BackupManager />
          )}

          {/* Migración */}
          {activeSection === 'migracion' && (
            <DataExporter />
          )}

          {/* Edge Functions */}
          {activeSection === 'edge-functions' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Edge Functions
                </CardTitle>
                <CardDescription>Funciones del backend desplegadas en el sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: 'generate-prescription-pdf', verifyJwt: true, description: 'Genera PDFs de recetas médicas' },
                    { name: 'submit-registration', verifyJwt: false, description: 'Procesa solicitudes de registro de usuarios' },
                    { name: 'approve-registration', verifyJwt: true, description: 'Aprueba o rechaza registros pendientes' },
                    { name: 'create-user', verifyJwt: true, description: 'Crea nuevos usuarios en el sistema' },
                    { name: 'delete-user', verifyJwt: true, description: 'Elimina usuarios del sistema' },
                    { name: 'cleanup-old-photos', verifyJwt: false, description: 'Limpia fotos antiguas del almacenamiento' },
                    { name: 'update-user-password', verifyJwt: true, description: 'Actualiza contraseñas de usuarios' },
                    { name: 'export-migrations', verifyJwt: true, description: 'Exporta datos para migración' },
                  ].map((fn) => (
                    <div 
                      key={fn.name} 
                      className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-md">
                          <Zap className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-mono text-sm font-medium">{fn.name}</p>
                          <p className="text-xs text-muted-foreground">{fn.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {fn.verifyJwt ? (
                          <Badge variant="default" className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            JWT Requerido
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <ShieldOff className="h-3 w-3" />
                            Público
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* First Warning Dialog */}
      <AlertDialog open={showFirstWarning} onOpenChange={setShowFirstWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro que desea borrar este usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará toda la información del usuario incluyendo su perfil y rol en el sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFirstWarningConfirm} className="bg-destructive hover:bg-destructive/90">
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second Warning Dialog */}
      <AlertDialog open={showSecondWarning} onOpenChange={setShowSecondWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Esta acción no se puede deshacer</AlertDialogTitle>
            <AlertDialogDescription>
              Esta es su última oportunidad. Una vez eliminado, no podrá recuperar la información
              del usuario. ¿Está completamente seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalDelete} className="bg-destructive hover:bg-destructive/90">
              Sí, borrar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Actualiza la información del usuario
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={editingUser.full_name} disabled />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingUser.email} disabled />
              </div>
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="flex flex-wrap gap-1">
                  {editingUser.roles.map((r) => (
                    <Badge key={r} className={`${roleColors[r]} text-white`}>
                      {roleLabels[r]}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva Contraseña (opcional)</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Dejar vacío para no cambiar"
                />
                <p className="text-xs text-muted-foreground">
                  Solo llenar si desea cambiar la contraseña del usuario
                </p>
              </div>
              {editingUser.roles.includes('doctor') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-specialty">Sub-especialidad</Label>
                    <Input
                      id="edit-specialty"
                      value={editSpecialty}
                      onChange={(e) => setEditSpecialty(e.target.value)}
                      placeholder="Ej: Oftalmología, Retina, Glaucoma"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-gender">Género</Label>
                    <Select value={editGender} onValueChange={(value) => setEditGender(value as 'M' | 'F')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar género" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculino (Dr.)</SelectItem>
                        <SelectItem value="F">Femenino (Dra.)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)} disabled={isSavingEdit}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para añadir rol */}
      <Dialog open={!!addingRoleUserId} onOpenChange={(open) => !open && setAddingRoleUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir Rol Adicional</DialogTitle>
            <DialogDescription>
              Selecciona el rol que deseas agregar al usuario
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rol a añadir</Label>
              <Select onValueChange={(v) => setRoleToAdd(v as AppRole)} value={roleToAdd || undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels)
                    .filter(([key]) => !getCurrentUserRoles().includes(key as AppRole))
                    .map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingRoleUserId(null)} disabled={isAddingRole}>
              Cancelar
            </Button>
            <Button onClick={handleAddRole} disabled={isAddingRole || !roleToAdd}>
              {isAddingRole ? 'Añadiendo...' : 'Añadir Rol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
