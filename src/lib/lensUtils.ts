/**
 * Parses lens prescription values (sphere, cylinder) handling various input formats
 * Supports: "PL"/"PLANO"/"PLANA" as 0, decimal commas, different dash types
 * Returns null for invalid inputs to maintain data integrity
 */
export function parseLensNumber(value: string | number | null | undefined): number | null {
  // Handle null, undefined, or empty string
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // If already a number, return it
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  // Normalize string input
  const normalized = value
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ''); // Remove all spaces

  // Handle "PLANO" variations as 0
  if (normalized === 'PL' || normalized === 'PLANO' || normalized === 'PLANA') {
    return 0;
  }

  // Replace decimal comma with period
  let processed = normalized.replace(',', '.');

  // Normalize different dash types to standard minus sign
  processed = processed.replace(/[−–—]/g, '-');

  // Validate format: optional sign, digits, optional decimal point and more digits
  const validPattern = /^[+-]?\d+(\.\d+)?$/;
  
  if (!validPattern.test(processed)) {
    return null;
  }

  // Parse the number
  const parsed = parseFloat(processed);
  
  // Return null if parsing resulted in NaN, otherwise return the parsed number
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parses axis values for lens prescriptions
 * Validates that axis is between 0-180 degrees
 */
export function parseAxisNumber(value: string | number | null | undefined): number | null {
  const parsed = parseLensNumber(value);
  
  if (parsed === null) {
    return null;
  }

  // Validate axis range (0-180 degrees)
  if (parsed < 0 || parsed > 180) {
    return null;
  }

  return parsed;
}

/**
 * Formats a numeric lens value for display with ophthalmological conventions
 * - null/undefined → empty string
 * - 0 → "PLANO"  
 * - positive numbers → "+X.XX" (always 2 decimals)
 * - negative numbers → "-X.XX" (always 2 decimals)
 */
export function formatLensForDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (value === 0) {
    return 'PLANO';
  }
  
  // Format with 2 decimal places and add + sign for positive values
  const formatted = Math.abs(value).toFixed(2);
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}
