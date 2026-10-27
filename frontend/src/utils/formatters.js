import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

/**
 * Parse a date value that may be a string, a Date, or null.
 * @param {any} value
 * @returns {Date|null}
 */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const parsed = parseISO(String(value));
  return isValid(parsed) ? parsed : null;
}

/**
 * @param {any} value
 * @param {string} [pattern]
 */
export function formatDate(value, pattern = 'dd MMM yyyy') {
  const date = toDate(value);
  return date ? format(date, pattern, { locale: id }) : '-';
}

/**
 * @param {any} value
 */
export function formatDateTime(value) {
  return formatDate(value, "dd MMM yyyy 'pukul' HH:mm");
}

/**
 * Relative time, e.g. "3 jam lalu".
 * @param {any} value
 */
export function formatRelative(value) {
  const date = toDate(value);
  if (!date) return '-';
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: id });
}

/**
 * @param {number} amount
 */
export function formatNumber(amount) {
  return new Intl.NumberFormat('id-ID').format(amount || 0);
}

/**
 * @param {number} amount
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === '') return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * @param {number} hours
 */
export function formatHours(hours) {
  if (hours === null || hours === undefined) return '-';
  return `${Number(hours).toFixed(hours % 1 === 0 ? 0 : 1)} jam`;
}

/**
 * Initials for an avatar, e.g. "Budi Santoso" -> "BS".
 * @param {string} name
 */
export function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * Is the task overdue? (due date in the past and not finished)
 * @param {any} task
 */
export function isOverdue(task) {
  if (!task || !task.due_date) return false;
  if (task.status === 'done') return false;
  const due = toDate(task.due_date);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * Days until the due date (negative when overdue).
 * @param {any} value
 */
export function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/**
 * Clamp a percentage into the 0-100 range.
 * @param {number} value
 */
export function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

/**
 * Build a query string, skipping empty values.
 * @param {object} params
 */
export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' ) continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
