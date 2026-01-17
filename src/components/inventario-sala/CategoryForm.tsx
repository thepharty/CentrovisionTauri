import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RoomInventoryCategory } from '@/pages/InventarioSala';

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  category: RoomInventoryCategory | null;
  categories: RoomInventoryCategory[];
  onSubmit: (data: Partial<RoomInventoryCategory>) => void;
  loading: boolean;
}

interface FormData {
  name: string;
  parent_id: string;
}

export function CategoryForm({
  open,
  onClose,
  category,
  categories,
  onSubmit,
  loading,
}: CategoryFormProps) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '',
      parent_id: 'none',
    },
  });

  const parentId = watch('parent_id');

  useEffect(() => {
    if (category) {
      reset({
        name: category.name,
        parent_id: category.parent_id || 'none',
      });
    } else {
      reset({
        name: '',
        parent_id: 'none',
      });
    }
  }, [category, reset]);

  const handleFormSubmit = (data: FormData) => {
    onSubmit({
      name: data.name,
      parent_id: data.parent_id === 'none' ? null : data.parent_id,
    });
  };

  // Filter out current category and its children from parent options
  const availableParents = categories.filter(c => {
    if (!category) return true;
    if (c.id === category.id) return false;
    // Also exclude children of current category
    let current = c;
    while (current.parent_id) {
      if (current.parent_id === category.id) return false;
      current = categories.find(cat => cat.id === current.parent_id) || current;
      if (current.id === c.id) break; // Prevent infinite loop
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? 'Editar Categoría' : 'Nueva Categoría'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              placeholder="Ej: Jeringas, Agujas, Viscoelásticos..."
              {...register('name', { required: 'El nombre es requerido' })}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent_id">Categoría padre (opcional)</Label>
            <Select
              value={parentId}
              onValueChange={(value) => setValue('parent_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin categoría padre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría padre</SelectItem>
                {availableParents.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Selecciona una categoría padre para crear subcategorías
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : category ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
