import { toast } from 'sonner';

/**
 * Validates axis input for ophthalmology fields.
 * Axis values must be integers between 0 and 180 degrees.
 * 
 * @param value - The input value to validate
 * @param fieldName - Name of the field for error messages (e.g., "Autorefractómetro OD")
 * @param onValid - Callback to execute if value is valid
 */
export const validateAxisInput = (
  value: string,
  fieldName: string,
  onValid: (val: string) => void
): void => {
  // Allow empty field
  if (value === '') {
    onValid(value);
    return;
  }
  
  // Check that input contains only digits (no decimals, no letters)
  if (!/^\d+$/.test(value)) {
    toast.error(`${fieldName} - Eje inválido`, {
      description: 'El eje debe ser un número entero (sin decimales ni letras). Ejemplo: 90, 180, 45'
    });
    return; // Do not update state
  }
  
  const numValue = parseInt(value, 10);
  
  // Check range 0-180
  if (numValue < 0 || numValue > 180) {
    toast.error(`${fieldName} - Eje fuera de rango`, {
      description: 'El eje debe estar entre 0 y 180 grados'
    });
    return; // Do not update state
  }
  
  // Valid value, update state
  onValid(value);
};
