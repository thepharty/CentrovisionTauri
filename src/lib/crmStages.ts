// Stage configurations for different procedure types

export const REFRACTIVE_PROCEDURES = ['CLEAR', 'TransPRK', 'FemtoLasik', 'Catarata', 'Cross Linking', 'Estrabismo'];

// Flow categories for CRM selector
export type FlowCategory = 'surgeries' | 'supplies';

export const FLOW_CATEGORIES: Record<FlowCategory, {
  label: string;
  procedures: string[];
}> = {
  surgeries: {
    label: 'Cirugías',
    procedures: REFRACTIVE_PROCEDURES, // CLEAR, TransPRK, FemtoLasik, Catarata
  },
  supplies: {
    label: 'Cirugías con Anticipo',
    procedures: [], // All OTHER procedures (ICL, Anillos, Lente Tórico, etc.)
  },
};

// Check if a procedure belongs to surgeries category
export const isProcedureInSurgeries = (procedureName: string): boolean => {
  return REFRACTIVE_PROCEDURES.includes(procedureName);
};

// Stages for surgeries with supplies (ICL, Anillos, Lente Tórico, etc.)
export const STAGES_WITH_SUPPLIES = [
  { id: 'info', label: 'Información', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { id: 'anticipo', label: 'Anticipo', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'pedido', label: 'Pedido', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { id: 'ya_clinica', label: 'Ya en Clínica', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  { id: 'cirugia', label: 'Cirugía', color: 'bg-green-500/10 text-green-700 dark:text-green-300' },
];

// Stages for refractive surgeries (no supplies needed)
export const STAGES_REFRACTIVE = [
  { id: 'info', label: 'Información', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { id: 'examenes', label: 'Exámenes realizados', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'confirmada', label: 'Cirugía confirmada', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { id: 'cirugia', label: 'Cirugía', color: 'bg-green-500/10 text-green-700 dark:text-green-300' },
];

// All stages combined for mixed view (when filter is "all")
export const ALL_STAGES = [
  { id: 'info', label: 'Información', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { id: 'anticipo', label: 'Anticipo', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'examenes', label: 'Exámenes realizados', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'pedido', label: 'Pedido', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { id: 'confirmada', label: 'Cirugía confirmada', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { id: 'ya_clinica', label: 'Ya en Clínica', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  { id: 'cirugia', label: 'Cirugía', color: 'bg-green-500/10 text-green-700 dark:text-green-300' },
];

// Get stages based on procedure type name
export const getStagesForProcedure = (procedureName: string | undefined) => {
  if (!procedureName) return STAGES_WITH_SUPPLIES;
  return REFRACTIVE_PROCEDURES.includes(procedureName) ? STAGES_REFRACTIVE : STAGES_WITH_SUPPLIES;
};

// Get stage label by id
export const getStageLabel = (stageId: string): string => {
  const allStages = [...STAGES_WITH_SUPPLIES, ...STAGES_REFRACTIVE];
  const stage = allStages.find(s => s.id === stageId);
  return stage?.label || stageId;
};

// Check if a stage is valid for a procedure type
export const isValidStageForProcedure = (stageId: string, procedureName: string | undefined) => {
  const stages = getStagesForProcedure(procedureName);
  return stages.some(s => s.id === stageId);
};

// Get stage order IDs for a procedure type
export const getStageOrderForProcedure = (procedureName: string | undefined): string[] => {
  const stages = getStagesForProcedure(procedureName);
  return stages.map(s => s.id);
};

// Legacy mapping for display compatibility
export const STAGE_LABELS: Record<string, string> = {
  info: 'Información',
  anticipo: 'Anticipo',
  pedido: 'Pedido',
  en_camino: 'En Camino', // Legacy
  ya_clinica: 'Ya en Clínica',
  examenes: 'Exámenes realizados',
  confirmada: 'Cirugía confirmada',
  cirugia: 'Cirugía',
};
