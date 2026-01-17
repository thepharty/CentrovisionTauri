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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RoomInventoryCategory, RoomInventoryItem } from '@/pages/InventarioSala';

interface ItemFormProps {
  open: boolean;
  onClose: () => void;
  item: RoomInventoryItem | null;
  categories: RoomInventoryCategory[];
  selectedCategoryId?: string;
  onSubmit: (data: Partial<RoomInventoryItem>) => void;
  loading: boolean;
}

interface FormData {
  name: string;
  category_id: string;
  code: string;
  brand: string;
  specification: string;
  current_stock: number;
  min_stock: number;
  unit: string;
  notes: string;
}

export function ItemForm({
  open,
  onClose,
  item,
  categories,
  selectedCategoryId,
  onSubmit,
  loading,
}: ItemFormProps) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '',
      category_id: '',
      code: '',
      brand: '',
      specification: '',
      current_stock: 0,
      min_stock: 5,
      unit: 'unidad',
      notes: '',
    },
  });

  const categoryId = watch('category_id');
  const unit = watch('unit');

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        category_id: item.category_id,
        code: item.code || '',
        brand: item.brand || '',
        specification: item.specification || '',
        current_stock: item.current_stock,
        min_stock: item.min_stock,
        unit: item.unit,
        notes: item.notes || '',
      });
    } else {
      reset({
        name: '',
        category_id: selectedCategoryId || '',
        code: '',
        brand: '',
        specification: '',
        current_stock: 0,
        min_stock: 5,
        unit: 'unidad',
        notes: '',
      });
    }
  }, [item, selectedCategoryId, reset]);

  const handleFormSubmit = (data: FormData) => {
    onSubmit({
      name: data.name,
      category_id: data.category_id,
      code: data.code || null,
      brand: data.brand || null,
      specification: data.specification || null,
      current_stock: Number(data.current_stock),
      min_stock: Number(data.min_stock),
      unit: data.unit,
      notes: data.notes || null,
    });
  };

  const units = ['unidad', 'caja', 'par', 'paquete', 'ml', 'frasco', 'ampolla'];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Editar Item' : 'Nuevo Item'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                placeholder="Ej: Jeringa 1ml, Aguja 30G..."
                {...register('name', { required: 'El nombre es requerido' })}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id">Categoría *</Label>
              <Select
                value={categoryId}
                onValueChange={(value) => setValue('category_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!categoryId && (
                <p className="text-sm text-destructive">La categoría es requerida</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                placeholder="Código interno"
                {...register('code')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Marca</Label>
              <Input
                id="brand"
                placeholder="Ej: Alcon, J&J..."
                {...register('brand')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="specification">Especificación</Label>
              <Input
                id="specification"
                placeholder="Ej: +21.0 D, 30G..."
                {...register('specification')}
              />
            </div>

            {!item && (
              <div className="space-y-2">
                <Label htmlFor="current_stock">Stock inicial</Label>
                <Input
                  id="current_stock"
                  type="number"
                  min="0"
                  {...register('current_stock', { valueAsNumber: true })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="min_stock">Stock mínimo</Label>
              <Input
                id="min_stock"
                type="number"
                min="0"
                {...register('min_stock', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Alerta cuando el stock sea igual o menor
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unidad</Label>
              <Select
                value={unit}
                onValueChange={(value) => setValue('unit', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                placeholder="Notas adicionales..."
                rows={2}
                {...register('notes')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !categoryId}>
              {loading ? 'Guardando...' : item ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
