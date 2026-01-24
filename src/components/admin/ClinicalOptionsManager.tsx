import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Check, X, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

// Helper to check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface SurgeryType {
  id: string;
  name: string;
  category: string;
  display_order: number;
  active: boolean;
}

interface StudyType {
  id: string;
  name: string;
  display_order: number;
  active: boolean;
}

interface ProcedureType {
  id: string;
  name: string;
  display_order: number;
  active: boolean;
}

const SURGERY_CATEGORIES = ['Segmento Anterior', 'Retina', 'Glaucoma', 'Oculoplastica', 'Otras'];

export default function ClinicalOptionsManager() {
  const queryClient = useQueryClient();
  const { connectionMode } = useNetworkStatus();
  const isLocalMode = (connectionMode === 'local' || connectionMode === 'offline') && isTauri();

  // Estados para agregar nuevos
  const [newSurgeryName, setNewSurgeryName] = useState('');
  const [newSurgeryCategory, setNewSurgeryCategory] = useState('Segmento Anterior');
  const [newStudyName, setNewStudyName] = useState('');
  const [newProcedureName, setNewProcedureName] = useState('');
  
  // Estados para editar
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Query para cirugías (incluye inactivas para admin)
  const { data: surgeryTypes = [] } = useQuery({
    queryKey: ['surgery-types-admin', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        const data = await invoke<SurgeryType[]>('get_surgery_types');
        // Sort by category then display_order
        return data.sort((a, b) => {
          if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
          return a.display_order - b.display_order;
        });
      }
      const { data, error } = await supabase
        .from('surgery_types')
        .select('*')
        .order('category')
        .order('display_order');
      if (error) throw error;
      return data as SurgeryType[];
    },
  });

  // Query para estudios
  const { data: studyTypes = [] } = useQuery({
    queryKey: ['study-types-admin', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        const data = await invoke<StudyType[]>('get_study_types');
        return data.sort((a, b) => a.display_order - b.display_order);
      }
      const { data, error } = await supabase
        .from('study_types')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data as StudyType[];
    },
  });

  // Query para procedimientos
  const { data: procedureTypes = [] } = useQuery({
    queryKey: ['procedure-types-admin', isLocalMode],
    queryFn: async () => {
      if (isLocalMode) {
        const data = await invoke<ProcedureType[]>('get_procedure_types');
        return data.sort((a, b) => a.display_order - b.display_order);
      }
      const { data, error } = await supabase
        .from('procedure_types')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data as ProcedureType[];
    },
  });

  // Invalidar queries
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['surgery-types-admin'] });
    queryClient.invalidateQueries({ queryKey: ['study-types-admin'] });
    queryClient.invalidateQueries({ queryKey: ['procedure-types-admin'] });
    queryClient.invalidateQueries({ queryKey: ['surgery-types'] });
    queryClient.invalidateQueries({ queryKey: ['study-types'] });
    queryClient.invalidateQueries({ queryKey: ['procedure-types'] });
  };

  // Agregar cirugía
  const handleAddSurgery = async () => {
    if (!newSurgeryName.trim()) return;

    const maxOrder = surgeryTypes
      .filter(s => s.category === newSurgeryCategory)
      .reduce((max, s) => Math.max(max, s.display_order), 0);

    try {
      if (isLocalMode) {
        await invoke('create_surgery_type', {
          input: {
            name: newSurgeryName.trim(),
            category: newSurgeryCategory,
            display_order: maxOrder + 1,
          }
        });
      } else {
        const { error } = await supabase.from('surgery_types').insert({
          name: newSurgeryName.trim(),
          category: newSurgeryCategory,
          display_order: maxOrder + 1,
        });
        if (error) throw error;
      }
      toast({ title: 'Cirugía agregada' });
      setNewSurgeryName('');
      invalidateAll();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo agregar la cirugía', variant: 'destructive' });
    }
  };

  // Agregar estudio
  const handleAddStudy = async () => {
    if (!newStudyName.trim()) return;

    const maxOrder = studyTypes.reduce((max, s) => Math.max(max, s.display_order), 0);

    try {
      if (isLocalMode) {
        await invoke('create_study_type', {
          input: {
            name: newStudyName.trim(),
            display_order: maxOrder + 1,
          }
        });
      } else {
        const { error } = await supabase.from('study_types').insert({
          name: newStudyName.trim(),
          display_order: maxOrder + 1,
        });
        if (error) throw error;
      }
      toast({ title: 'Estudio agregado' });
      setNewStudyName('');
      invalidateAll();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo agregar el estudio', variant: 'destructive' });
    }
  };

  // Agregar procedimiento
  const handleAddProcedure = async () => {
    if (!newProcedureName.trim()) return;

    const maxOrder = procedureTypes.reduce((max, p) => Math.max(max, p.display_order), 0);

    try {
      if (isLocalMode) {
        await invoke('create_procedure_type', {
          input: {
            name: newProcedureName.trim(),
            display_order: maxOrder + 1,
          }
        });
      } else {
        const { error } = await supabase.from('procedure_types').insert({
          name: newProcedureName.trim(),
          display_order: maxOrder + 1,
        });
        if (error) throw error;
      }
      toast({ title: 'Procedimiento agregado' });
      setNewProcedureName('');
      invalidateAll();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo agregar el procedimiento', variant: 'destructive' });
    }
  };

  // Actualizar nombre
  const handleUpdateName = async (table: 'surgery_types' | 'study_types' | 'procedure_types', id: string) => {
    if (!editingName.trim()) return;

    try {
      if (isLocalMode) {
        const commandMap = {
          'surgery_types': 'update_surgery_type',
          'study_types': 'update_study_type',
          'procedure_types': 'update_procedure_type',
        };
        await invoke(commandMap[table], {
          id,
          update: { name: editingName.trim() }
        });
      } else {
        const { error } = await supabase
          .from(table)
          .update({ name: editingName.trim() } as any)
          .eq('id', id);
        if (error) throw error;
      }
      toast({ title: 'Actualizado' });
      setEditingId(null);
      setEditingName('');
      invalidateAll();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    }
  };

  // Alternar activo/inactivo
  const handleToggleActive = async (table: 'surgery_types' | 'study_types' | 'procedure_types', id: string, currentActive: boolean) => {
    try {
      if (isLocalMode) {
        const commandMap = {
          'surgery_types': 'update_surgery_type',
          'study_types': 'update_study_type',
          'procedure_types': 'update_procedure_type',
        };
        await invoke(commandMap[table], {
          id,
          update: { active: !currentActive }
        });
      } else {
        const { error } = await supabase
          .from(table)
          .update({ active: !currentActive } as any)
          .eq('id', id);
        if (error) throw error;
      }
      toast({ title: currentActive ? 'Desactivado' : 'Activado' });
      invalidateAll();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    }
  };

  // Eliminar
  const handleDelete = async (table: 'surgery_types' | 'study_types' | 'procedure_types', id: string) => {
    try {
      if (isLocalMode) {
        const commandMap = {
          'surgery_types': 'delete_surgery_type',
          'study_types': 'delete_study_type',
          'procedure_types': 'delete_procedure_type',
        };
        await invoke(commandMap[table], { id });
      } else {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
      }
      toast({ title: 'Eliminado' });
      invalidateAll();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  // Agrupar cirugías por categoría
  const surgeryByCategory = SURGERY_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = surgeryTypes.filter(s => s.category === cat);
    return acc;
  }, {} as Record<string, SurgeryType[]>);

  const renderItem = (
    item: { id: string; name: string; active: boolean },
    table: 'surgery_types' | 'study_types' | 'procedure_types'
  ) => {
    const isEditing = editingId === item.id;
    
    return (
      <div
        key={item.id}
        className={`flex items-center justify-between p-2 rounded-md border ${
          item.active ? 'bg-background' : 'bg-muted/50 opacity-60'
        }`}
      >
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              className="h-8"
              autoFocus
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleUpdateName(table, item.id)}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingId(null); setEditingName(''); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <span className="text-sm">{item.name}</span>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => { setEditingId(item.id); setEditingName(item.name); }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => handleToggleActive(table, item.id, item.active)}
              >
                {item.active ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleDelete(table, item.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Tabs defaultValue="cirugias" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="cirugias">Cirugías</TabsTrigger>
        <TabsTrigger value="estudios">Estudios</TabsTrigger>
        <TabsTrigger value="procedimientos">Procedimientos</TabsTrigger>
      </TabsList>

      <TabsContent value="cirugias" className="space-y-4">
        {/* Agregar nueva cirugía */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              placeholder="Nueva cirugía..."
              value={newSurgeryName}
              onChange={e => setNewSurgeryName(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-44 space-y-1">
            <Label className="text-xs">Categoría</Label>
            <Select value={newSurgeryCategory} onValueChange={setNewSurgeryCategory}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SURGERY_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAddSurgery} size="sm" className="h-9">
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>

        {/* Lista por categoría */}
        <ScrollArea className="h-[400px] pr-4">
          {SURGERY_CATEGORIES.map(category => (
            <div key={category} className="mb-4">
              <h4 className="font-medium text-sm mb-2 text-muted-foreground">{category}</h4>
              <div className="space-y-1">
                {surgeryByCategory[category]?.length > 0 ? (
                  surgeryByCategory[category].map(s => renderItem(s, 'surgery_types'))
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sin cirugías</p>
                )}
              </div>
            </div>
          ))}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="estudios" className="space-y-4">
        {/* Agregar nuevo estudio */}
        <div className="flex gap-2">
          <Input
            placeholder="Nuevo estudio..."
            value={newStudyName}
            onChange={e => setNewStudyName(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAddStudy} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-1">
            {studyTypes.map(s => renderItem(s, 'study_types'))}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="procedimientos" className="space-y-4">
        {/* Agregar nuevo procedimiento */}
        <div className="flex gap-2">
          <Input
            placeholder="Nuevo procedimiento..."
            value={newProcedureName}
            onChange={e => setNewProcedureName(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAddProcedure} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-1">
            {procedureTypes.map(p => renderItem(p, 'procedure_types'))}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
