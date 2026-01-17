import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import type { RoomInventoryItem } from '@/pages/InventarioSala';

interface StockMovementFormProps {
  item: RoomInventoryItem;
  onSubmit: (data: { item_id: string; quantity: number; movement_type: string; notes?: string }) => void;
  loading: boolean;
}

interface FormData {
  quantity: number;
  movement_type: 'entrada' | 'uso' | 'ajuste';
  notes: string;
}

export function StockMovementForm({ item, onSubmit, loading }: StockMovementFormProps) {
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      quantity: 1,
      movement_type: 'uso',
      notes: '',
    },
  });

  const movementType = watch('movement_type');
  const quantity = watch('quantity');
  const isLowStock = item.current_stock <= item.min_stock;

  // Calculate preview of new stock
  const getNewStock = () => {
    const qty = Number(quantity) || 0;
    if (movementType === 'entrada') return item.current_stock + qty;
    if (movementType === 'uso') return Math.max(0, item.current_stock - qty);
    if (movementType === 'ajuste') return qty;
    return item.current_stock;
  };

  const handleFormSubmit = (data: FormData) => {
    onSubmit({
      item_id: item.id,
      quantity: Number(data.quantity),
      movement_type: data.movement_type,
      notes: data.notes || undefined,
    });
    reset();
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Current Stock Display */}
      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Stock actual</span>
          <Badge variant={isLowStock ? 'destructive' : 'secondary'} className="font-mono text-lg">
            {item.current_stock} {item.unit}
          </Badge>
        </div>
        {isLowStock && (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Stock bajo (mínimo: {item.min_stock})</span>
          </div>
        )}
      </div>

      {/* Movement Type */}
      <div className="space-y-3">
        <Label>Tipo de movimiento</Label>
        <RadioGroup
          value={movementType}
          onValueChange={(value) => setValue('movement_type', value as FormData['movement_type'])}
          className="grid grid-cols-3 gap-2"
        >
          <Label
            htmlFor="entrada"
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors ${
              movementType === 'entrada' ? 'bg-green-500/10 border-green-500' : ''
            }`}
          >
            <RadioGroupItem value="entrada" id="entrada" className="sr-only" />
            <ArrowDownCircle className={`h-6 w-6 ${movementType === 'entrada' ? 'text-green-500' : 'text-muted-foreground'}`} />
            <span className="text-sm font-medium">Entrada</span>
          </Label>

          <Label
            htmlFor="uso"
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors ${
              movementType === 'uso' ? 'bg-red-500/10 border-red-500' : ''
            }`}
          >
            <RadioGroupItem value="uso" id="uso" className="sr-only" />
            <ArrowUpCircle className={`h-6 w-6 ${movementType === 'uso' ? 'text-red-500' : 'text-muted-foreground'}`} />
            <span className="text-sm font-medium">Uso</span>
          </Label>

          <Label
            htmlFor="ajuste"
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors ${
              movementType === 'ajuste' ? 'bg-blue-500/10 border-blue-500' : ''
            }`}
          >
            <RadioGroupItem value="ajuste" id="ajuste" className="sr-only" />
            <RefreshCw className={`h-6 w-6 ${movementType === 'ajuste' ? 'text-blue-500' : 'text-muted-foreground'}`} />
            <span className="text-sm font-medium">Ajuste</span>
          </Label>
        </RadioGroup>
      </div>

      {/* Quantity */}
      <div className="space-y-2">
        <Label htmlFor="quantity">
          {movementType === 'ajuste' ? 'Nuevo stock' : 'Cantidad'}
        </Label>
        <Input
          id="quantity"
          type="number"
          min="1"
          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          {...register('quantity', { 
            required: 'La cantidad es requerida',
            min: { value: 1, message: 'Mínimo 1' },
          })}
        />
        {errors.quantity && (
          <p className="text-sm text-destructive">{errors.quantity.message}</p>
        )}
      </div>

      {/* Preview */}
      <div className="p-3 rounded-lg bg-muted/30 flex items-center justify-between">
        <span className="text-sm">Stock resultante:</span>
        <span className="font-mono font-bold text-lg">
          {getNewStock()} {item.unit}
        </span>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          placeholder="Ej: Cirugía de catarata paciente X..."
          rows={2}
          {...register('notes')}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Registrando...' : 'Registrar Movimiento'}
      </Button>
    </form>
  );
}
