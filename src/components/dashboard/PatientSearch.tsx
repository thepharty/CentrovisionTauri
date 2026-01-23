import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { isTauri, getPatients as getPatientsTauri } from '@/lib/dataSource';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  code?: string;
  dob?: string;
  phone?: string;
  email?: string;
  address?: string;
  occupation?: string;
}

interface PatientSearchProps {
  selectedPatientId?: string;
  onSelectPatient: (patient: Patient | null) => void;
  onClearSelection: () => void;
}

export function PatientSearch({ selectedPatientId, onSelectPatient, onClearSelection }: PatientSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { connectionMode } = useNetworkStatus();

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients-search', searchTerm, connectionMode],
    queryFn: async () => {
      // En modo local (PostgreSQL), usar Tauri commands
      if (connectionMode === 'local' && isTauri()) {
        console.log('[PatientSearch] Loading from PostgreSQL local');
        const results = await getPatientsTauri(searchTerm || undefined, 50);
        return results as Patient[];
      }

      // En modo offline (sin conexión), usar SQLite cache
      if (connectionMode === 'offline' && isTauri()) {
        console.log('[PatientSearch] Offline - loading from SQLite');
        const results = await getPatientsTauri(searchTerm || undefined, 50);
        return results as Patient[];
      }

      // En modo supabase (cloud), usar Supabase
      let query = supabase
        .from('patients')
        .select('*');

      if (searchTerm) {
        query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      query = query.order('last_name', { ascending: true });

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as Patient[];
    },
    enabled: open || !!searchTerm,
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedPatient ? (
              <span>
                {selectedPatient.first_name} {selectedPatient.last_name}
                {selectedPatient.code && ` - ${selectedPatient.code}`}
              </span>
            ) : (
              <span className="text-muted-foreground">Buscar paciente...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por nombre, apellido o ID..."
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty>
                {isLoading ? 'Buscando...' : 'No se encontraron pacientes'}
              </CommandEmpty>
              <CommandGroup>
                {patients.map((patient) => (
                  <CommandItem
                    key={patient.id}
                    value={patient.id}
                    onSelect={() => {
                      onSelectPatient(patient);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedPatientId === patient.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span>
                        {patient.first_name} {patient.last_name}
                      </span>
                      {patient.code && (
                        <span className="text-xs text-muted-foreground">
                          ID: {patient.code}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedPatient && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClearSelection}
          className="text-xs w-full"
        >
          Limpiar selección
        </Button>
      )}
    </div>
  );
}
