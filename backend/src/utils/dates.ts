import dayjs from 'dayjs';

/**
 * Normalise a value into a `YYYY-MM-DD` string or null.
 */
export function toDateString(value: any): string | null {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : null;
}

/**
 * @returns `YYYY-MM-DD HH:mm:ss` or null
 */
export function toDateTimeString(value: any): string | null {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : null;
}

/**
 * @returns ISO string or null
 */
export function toIsoString(value: any): string | null {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d.toISOString() : null;
}

export default { toDateString, toDateTimeString, toIsoString };

