import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// Orden específico de categorías de cirugía
const CATEGORY_ORDER = [
  'Segmento Anterior',
  'Glaucoma',
  'Retina',
  'Oculoplastica',
  'Otras'
];

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

// Valores hardcodeados como fallback (en orden correcto)
const FALLBACK_CIRUGIAS: Record<string, string[]> = {
  'Segmento Anterior': ['Catarata', 'Catarata con laser Femtosegundo', 'Anillos Corneales', 'KPP', 'Transplante endotelial', 'DALK', 'TransPRK', 'FemtoLASIK', 'CLEAR', 'ICL', 'Artisan', 'Pterigion'],
  'Glaucoma': ['Trabeculectomia', 'FacoTrabeculectomia', 'Valvula', 'Laser SLT', 'Laser Termociclo', 'Laser Subciclo', 'Crio'],
  'Retina': ['Vitrectomia', 'Retinopexia', 'Cirugia macular', 'Endolaser'],
  'Oculoplastica': ['Blefaroplastia superior', 'Blefaroplastia Inferior', 'Dacrio', 'Ptosis', 'Entropion', 'Ectropion'],
  'Otras': ['Estrabismo']
};

const FALLBACK_ESTUDIOS = [
  'Pentacam', 'Biometria Optica', 'Biometria de contacto', 'Recuento endotelial',
  'Topografia Corneal', 'OPD Aberrometria', 'Perimetria 30', 'Perimetria 60',
  'OCT nervio Optico', 'OCT Macula', 'AGF', 'Fotos Campo Amplio',
  'Ultrasonido Ocular A-B', 'Anterion', 'Sirius +', 'Mapa Epitelial',
  'Paquete Glaucoma', 'Paquete de retina'
];

const FALLBACK_PROCEDIMIENTOS = [
  'Panfotocoagulacion', 'Laser Arcadas', 'Laser Focal', 'Iridectomia Periferica',
  'Capsulotomia Yag Laser', 'Cross Linking Corneal', 'Avastin', 'Laser SLT'
];

export function useClinicalOptions() {
  // Query para cirugías
  const { data: surgeryTypes, isLoading: isLoadingSurgeries } = useQuery({
    queryKey: ['surgery-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surgery_types')
        .select('*')
        .eq('active', true)
        .order('category')
        .order('display_order');
      
      if (error) throw error;
      return data as SurgeryType[];
    },
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
  });

  // Query para estudios
  const { data: studyTypes, isLoading: isLoadingStudies } = useQuery({
    queryKey: ['study-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_types')
        .select('*')
        .eq('active', true)
        .order('display_order');
      
      if (error) throw error;
      return data as StudyType[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Query para procedimientos
  const { data: procedureTypes, isLoading: isLoadingProcedures } = useQuery({
    queryKey: ['procedure-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('procedure_types')
        .select('*')
        .eq('active', true)
        .order('display_order');
      
      if (error) throw error;
      return data as ProcedureType[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Transformar cirugías a estructura agrupada por categoría (en orden específico)
  const cirugiasDisponibles = React.useMemo(() => {
    if (!surgeryTypes || surgeryTypes.length === 0) {
      return FALLBACK_CIRUGIAS;
    }
    
    // Primero agrupar por categoría
    const tempGrouped: Record<string, string[]> = {};
    surgeryTypes.forEach(s => {
      if (!tempGrouped[s.category]) tempGrouped[s.category] = [];
      tempGrouped[s.category].push(s.name);
    });
    
    // Construir el objeto final en el orden específico
    const ordered: Record<string, string[]> = {};
    CATEGORY_ORDER.forEach(category => {
      if (tempGrouped[category] && tempGrouped[category].length > 0) {
        ordered[category] = tempGrouped[category];
      }
    });
    
    // Agregar categorías nuevas que no estén en CATEGORY_ORDER
    Object.keys(tempGrouped).forEach(cat => {
      if (!ordered[cat]) {
        ordered[cat] = tempGrouped[cat];
      }
    });
    
    return ordered;
  }, [surgeryTypes]);

  // Transformar estudios a array simple
  const estudiosDisponibles = React.useMemo(() => {
    if (!studyTypes || studyTypes.length === 0) {
      return FALLBACK_ESTUDIOS;
    }
    return studyTypes.map(s => s.name);
  }, [studyTypes]);

  // Transformar procedimientos a array simple
  const procedimientosDisponibles = React.useMemo(() => {
    if (!procedureTypes || procedureTypes.length === 0) {
      return FALLBACK_PROCEDIMIENTOS;
    }
    return procedureTypes.map(p => p.name);
  }, [procedureTypes]);

  return {
    cirugiasDisponibles,
    estudiosDisponibles,
    procedimientosDisponibles,
    isLoading: isLoadingSurgeries || isLoadingStudies || isLoadingProcedures,
  };
}
