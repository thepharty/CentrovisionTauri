import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { 
  startOfDay as dateFnsStartOfDay, 
  endOfDay as dateFnsEndOfDay,
  startOfWeek as dateFnsStartOfWeek,
  endOfWeek as dateFnsEndOfWeek
} from 'date-fns';
import { es } from 'date-fns/locale';

// Zona horaria de la clínica
export const CLINIC_TZ = 'America/Guatemala';

/**
 * Obtiene la fecha/hora actual en la zona horaria de la clínica
 */
export function clinicNow(): Date {
  return toZonedTime(new Date(), CLINIC_TZ);
}

/**
 * Convierte una fecha al timezone de la clínica
 */
export function toClinicTime(date: Date): Date {
  return toZonedTime(date, CLINIC_TZ);
}

/**
 * Convierte una fecha del timezone de la clínica a UTC para guardar en DB
 */
export function fromClinicTime(date: Date): Date {
  return fromZonedTime(date, CLINIC_TZ);
}

/**
 * Obtiene el inicio del día en timezone de la clínica
 */
export function clinicStartOfDay(date: Date): Date {
  const zonedDate = toClinicTime(date);
  return dateFnsStartOfDay(zonedDate);
}

/**
 * Obtiene el fin del día en timezone de la clínica
 */
export function clinicEndOfDay(date: Date): Date {
  const zonedDate = toClinicTime(date);
  return dateFnsEndOfDay(zonedDate);
}

/**
 * Obtiene el inicio de la semana en timezone de la clínica
 */
export function clinicStartOfWeek(date: Date): Date {
  const zonedDate = toClinicTime(date);
  return dateFnsStartOfWeek(zonedDate, { locale: es });
}

/**
 * Obtiene el fin de la semana en timezone de la clínica
 */
export function clinicEndOfWeek(date: Date): Date {
  const zonedDate = toClinicTime(date);
  return dateFnsEndOfWeek(zonedDate, { locale: es });
}
