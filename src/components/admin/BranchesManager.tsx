import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Plus, Pencil, DoorOpen, MapPin, Phone, Shield, Trash2, Palette, Upload, X, ImageIcon } from 'lucide-react';
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
import { toast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

interface Branch {
  id: string;
  code: 'central' | 'santa_lucia' | null;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  theme_primary_hsl: string | null;
  pdf_header_url: string | null;
}

interface Room {
  id: string;
  name: string;
  kind: 'consultorio' | 'diagnostico' | 'quirofano';
  active: boolean;
  branch_id: string;
}

const roomKindLabels: Record<string, string> = {
  consultorio: 'Consultorio',
  diagnostico: 'Diagnóstico',
  quirofano: 'Quirófano',
};

export default function BranchesManager() {
  const queryClient = useQueryClient();
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [managingRooms, setManagingRooms] = useState<Branch | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  
  // Form states
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchActive, setBranchActive] = useState(true);
  const [branchThemeColor, setBranchThemeColor] = useState('221 74% 54%');
  const [branchPdfHeaderUrl, setBranchPdfHeaderUrl] = useState<string | null>(null);
  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [headerImagePreview, setHeaderImagePreview] = useState<string | null>(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomKind, setRoomKind] = useState<'consultorio' | 'diagnostico' | 'quirofano'>('consultorio');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);

  // Fetch branches with room count
  const { data: branches = [], isLoading: isLoadingBranches } = useQuery({
    queryKey: ['admin-branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Branch[];
    },
  });

  // Fetch rooms for the branch being managed
  const { data: rooms = [], isLoading: isLoadingRooms } = useQuery({
    queryKey: ['admin-branch-rooms', managingRooms?.id],
    queryFn: async () => {
      if (!managingRooms) return [];
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('branch_id', managingRooms.id)
        .order('name');
      if (error) throw error;
      return data as Room[];
    },
    enabled: !!managingRooms,
  });

  // Get room count per branch
  const { data: roomCounts = {} } = useQuery({
    queryKey: ['admin-branch-room-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('branch_id, active');
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(room => {
        if (room.active) {
          counts[room.branch_id] = (counts[room.branch_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  const isCentralBranch = (branch: Branch) => branch.code === 'central';

  const resetBranchForm = () => {
    setBranchName('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchActive(true);
    setBranchThemeColor('221 74% 54%');
    setBranchPdfHeaderUrl(null);
    setHeaderImageFile(null);
    setHeaderImagePreview(null);
  };

  // Convertir HSL string a hex para el color picker
  const hslToHex = (hsl: string): string => {
    const parts = hsl.split(' ').map(p => parseFloat(p));
    if (parts.length !== 3) return '#3b82f6';
    const [h, s, l] = parts;
    const sNorm = s / 100;
    const lNorm = l / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Convertir hex a HSL string
  const hexToHsl = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '221 74% 54%';
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const handleHeaderImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Error', description: 'Solo se permiten imágenes', variant: 'destructive' });
        return;
      }
      setHeaderImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setHeaderImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadHeaderImage = async (branchId: string): Promise<string | null> => {
    if (!headerImageFile) return branchPdfHeaderUrl;

    setUploadingHeader(true);
    try {
      const fileExt = headerImageFile.name.split('.').pop();
      const filePath = `${branchId}/header.${fileExt}`;

      // Eliminar imagen anterior si existe
      if (branchPdfHeaderUrl) {
        const oldPath = branchPdfHeaderUrl.split('/').slice(-2).join('/');
        await supabase.storage.from('branch-assets').remove([oldPath]);
      }

      const { error: uploadError } = await supabase.storage
        .from('branch-assets')
        .upload(filePath, headerImageFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('branch-assets').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error: any) {
      toast({ title: 'Error', description: 'Error al subir imagen: ' + error.message, variant: 'destructive' });
      return branchPdfHeaderUrl;
    } finally {
      setUploadingHeader(false);
    }
  };

  const handleAddBranch = async () => {
    if (!branchName.trim()) {
      toast({ title: 'Error', description: 'El nombre es requerido', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from('branches').insert({
        name: branchName.trim(),
        address: branchAddress.trim() || null,
        phone: branchPhone.trim() || null,
        active: true,
        code: null,
      });

      if (error) throw error;

      toast({ title: 'Sede creada', description: 'La sede ha sido creada exitosamente.' });
      queryClient.invalidateQueries({ queryKey: ['admin-branches'] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setShowAddBranch(false);
      resetBranchForm();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBranch = (branch: Branch) => {
    if (isCentralBranch(branch)) return;
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchAddress(branch.address || '');
    setBranchPhone(branch.phone || '');
    setBranchActive(branch.active);
    setBranchThemeColor(branch.theme_primary_hsl || '221 74% 54%');
    setBranchPdfHeaderUrl(branch.pdf_header_url);
    setHeaderImageFile(null);
    setHeaderImagePreview(branch.pdf_header_url);
  };

  const handleSaveEditBranch = async () => {
    if (!editingBranch || !branchName.trim()) return;

    setIsSaving(true);
    try {
      // Subir imagen de encabezado si hay una nueva
      const newPdfHeaderUrl = await uploadHeaderImage(editingBranch.id);

      const { error } = await supabase
        .from('branches')
        .update({
          name: branchName.trim(),
          address: branchAddress.trim() || null,
          phone: branchPhone.trim() || null,
          active: branchActive,
          theme_primary_hsl: branchThemeColor || null,
          pdf_header_url: newPdfHeaderUrl,
        })
        .eq('id', editingBranch.id);

      if (error) throw error;

      toast({ title: 'Sede actualizada', description: 'Los cambios han sido guardados.' });
      queryClient.invalidateQueries({ queryKey: ['admin-branches'] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setEditingBranch(null);
      resetBranchForm();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRoom = async () => {
    if (!managingRooms || !roomName.trim()) {
      toast({ title: 'Error', description: 'El nombre de la sala es requerido', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from('rooms').insert({
        name: roomName.trim(),
        kind: roomKind,
        branch_id: managingRooms.id,
        active: true,
      });

      if (error) throw error;

      toast({ title: 'Sala creada', description: 'La sala ha sido creada exitosamente.' });
      queryClient.invalidateQueries({ queryKey: ['admin-branch-rooms', managingRooms.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-branch-room-counts'] });
      setShowAddRoom(false);
      setRoomName('');
      setRoomKind('consultorio');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleRoomActive = async (room: Room) => {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ active: !room.active })
        .eq('id', room.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['admin-branch-rooms', managingRooms?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-branch-room-counts'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteBranch = async () => {
    if (!deletingBranch) return;

    setIsSaving(true);
    try {
      // First delete associated rooms
      const { error: roomsError } = await supabase
        .from('rooms')
        .delete()
        .eq('branch_id', deletingBranch.id);

      if (roomsError) throw roomsError;

      // Then delete the branch
      const { error: branchError } = await supabase
        .from('branches')
        .delete()
        .eq('id', deletingBranch.id);

      if (branchError) throw branchError;

      toast({ title: 'Sede eliminada', description: 'La sede y sus salas han sido eliminadas.' });
      queryClient.invalidateQueries({ queryKey: ['admin-branches'] });
      queryClient.invalidateQueries({ queryKey: ['admin-branch-room-counts'] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setDeletingBranch(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Gestión de Sedes
            </CardTitle>
            <CardDescription>Administra las sedes y sus salas</CardDescription>
          </div>
          <Button onClick={() => setShowAddBranch(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Sede
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingBranches ? (
          <p className="text-muted-foreground">Cargando sedes...</p>
        ) : branches.length === 0 ? (
          <p className="text-muted-foreground">No hay sedes configuradas.</p>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className={`flex items-center justify-between p-4 border rounded-lg ${
                  !branch.active ? 'opacity-60 bg-muted/50' : ''
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{branch.name}</span>
                    {isCentralBranch(branch) && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Sede Principal
                      </Badge>
                    )}
                    {!branch.active && (
                      <Badge variant="outline">Inactiva</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    {branch.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {branch.address}
                      </span>
                    )}
                    {branch.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {branch.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <DoorOpen className="h-3 w-3" />
                      {roomCounts[branch.id] || 0} salas
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManagingRooms(branch)}
                  >
                    <DoorOpen className="h-4 w-4 mr-1" />
                    Salas
                  </Button>
                  {!isCentralBranch(branch) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditBranch(branch)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingBranch(branch)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Dialog: Agregar Sede */}
      <Dialog open={showAddBranch} onOpenChange={setShowAddBranch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Sede</DialogTitle>
            <DialogDescription>Agrega una nueva sede al sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Nombre *</Label>
              <Input
                id="branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Ej: Sede Norte"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Dirección</Label>
              <Input
                id="branch-address"
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                placeholder="Ej: Av. Principal #123"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-phone">Teléfono</Label>
              <Input
                id="branch-phone"
                value={branchPhone}
                onChange={(e) => setBranchPhone(e.target.value)}
                placeholder="Ej: +502 1234-5678"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddBranch(false); resetBranchForm(); }} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleAddBranch} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Crear Sede'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Sede */}
      <Dialog open={!!editingBranch} onOpenChange={(open) => !open && setEditingBranch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Sede</DialogTitle>
            <DialogDescription>Modifica la información de la sede</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-branch-name">Nombre *</Label>
              <Input
                id="edit-branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch-address">Dirección</Label>
              <Input
                id="edit-branch-address"
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch-phone">Teléfono</Label>
              <Input
                id="edit-branch-phone"
                value={branchPhone}
                onChange={(e) => setBranchPhone(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-branch-active">Sede activa</Label>
              <Switch
                id="edit-branch-active"
                checked={branchActive}
                onCheckedChange={setBranchActive}
              />
            </div>

            <Separator className="my-4" />

            {/* Personalización */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Personalización
              </h4>

              {/* Color Principal */}
              <div className="space-y-2">
                <Label htmlFor="edit-branch-color">Color Principal</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="edit-branch-color"
                    value={hslToHex(branchThemeColor)}
                    onChange={(e) => setBranchThemeColor(hexToHsl(e.target.value))}
                    className="w-12 h-10 rounded border cursor-pointer"
                  />
                  <div
                    className="flex-1 h-10 rounded border flex items-center px-3 text-sm"
                    style={{ backgroundColor: `hsl(${branchThemeColor})` }}
                  >
                    <span className="text-white drop-shadow-md">Vista previa</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Este color se aplicará a botones y elementos principales cuando se seleccione esta sucursal
                </p>
              </div>

              {/* Encabezado PDF */}
              <div className="space-y-2">
                <Label>Encabezado para PDFs</Label>
                <div className="border rounded-lg p-3 space-y-3">
                  {(headerImagePreview || branchPdfHeaderUrl) ? (
                    <div className="relative">
                      <img
                        src={headerImagePreview || branchPdfHeaderUrl || ''}
                        alt="Encabezado PDF"
                        className="w-full h-20 object-contain bg-gray-50 rounded"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => {
                          setHeaderImagePreview(null);
                          setBranchPdfHeaderUrl(null);
                          setHeaderImageFile(null);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="h-20 bg-muted rounded flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-50" />
                        <p className="text-xs">Sin encabezado personalizado</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <input
                      ref={headerInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleHeaderImageSelect}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => headerInputRef.current?.click()}
                      disabled={uploadingHeader}
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingHeader ? 'Subiendo...' : 'Subir imagen'}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Esta imagen aparecerá en el encabezado de los PDFs generados (recetas, indicaciones, etc.)
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingBranch(null); resetBranchForm(); }} disabled={isSaving || uploadingHeader}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEditBranch} disabled={isSaving || uploadingHeader}>
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gestionar Salas */}
      <Dialog open={!!managingRooms} onOpenChange={(open) => !open && setManagingRooms(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Salas de {managingRooms?.name}</DialogTitle>
            <DialogDescription>Gestiona las salas de esta sede</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowAddRoom(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar Sala
              </Button>
            </div>
            <ScrollArea className="h-64">
              {isLoadingRooms ? (
                <p className="text-muted-foreground">Cargando salas...</p>
              ) : rooms.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay salas configuradas para esta sede.
                </p>
              ) : (
                <div className="space-y-2">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className={`flex items-center justify-between p-3 border rounded-lg ${
                        !room.active ? 'opacity-60 bg-muted/50' : ''
                      }`}
                    >
                      <div>
                        <span className="font-medium">{room.name}</span>
                        <Badge variant="outline" className="ml-2">
                          {roomKindLabels[room.kind]}
                        </Badge>
                      </div>
                      <Switch
                        checked={room.active}
                        onCheckedChange={() => handleToggleRoomActive(room)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingRooms(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Agregar Sala */}
      <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Sala</DialogTitle>
            <DialogDescription>Agrega una sala a {managingRooms?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room-name">Nombre *</Label>
              <Input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Ej: Consultorio 1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-kind">Tipo</Label>
              <Select value={roomKind} onValueChange={(v) => setRoomKind(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultorio">Consultorio</SelectItem>
                  <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                  <SelectItem value="quirofano">Quirófano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddRoom(false); setRoomName(''); }} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleAddRoom} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Crear Sala'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar eliminar sede */}
      <AlertDialog open={!!deletingBranch} onOpenChange={(open) => !open && setDeletingBranch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sede?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la sede "{deletingBranch?.name}" y todas sus salas asociadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteBranch} 
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
