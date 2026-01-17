import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { User, AlertTriangle } from 'lucide-react';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  code?: string;
  dob?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface DuplicatePatientDialogProps {
  open: boolean;
  onClose: () => void;
  duplicates: Patient[];
  newPatientData: {
    first_name: string;
    last_name: string;
    dob?: string;
    phone?: string;
  };
  onSelectExisting: (patient: Patient) => void;
  onCreateNew: () => void;
}

export function DuplicatePatientDialog({
  open,
  onClose,
  duplicates,
  newPatientData,
  onSelectExisting,
  onCreateNew
}: DuplicatePatientDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <DialogTitle>Posibles Pacientes Duplicados</DialogTitle>
          </div>
          <DialogDescription>
            Encontramos pacientes con nombres similares. ¿Es alguno de estos el mismo paciente?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm font-medium mb-1">Paciente que desea crear:</p>
            <p className="text-sm">
              {newPatientData.first_name} {newPatientData.last_name}
              {newPatientData.dob && ` - ${newPatientData.dob}`}
              {newPatientData.phone && ` - ${newPatientData.phone}`}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Pacientes existentes similares:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {duplicates.map((patient) => (
                <Card
                  key={patient.id}
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onSelectExisting(patient)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium">
                          {patient.first_name} {patient.last_name}
                        </p>
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          {patient.code && <p>ID: {patient.code}</p>}
                          {patient.dob && <p>Fecha de nacimiento: {patient.dob}</p>}
                          {patient.phone && <p>Teléfono: {patient.phone}</p>}
                          {patient.email && <p>Email: {patient.email}</p>}
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Seleccionar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onCreateNew} variant="default">
            Crear Nuevo de Todas Formas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
