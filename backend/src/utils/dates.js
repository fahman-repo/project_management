'use strict';

const dayjs = require('dayjs');

/**
 * Normalise a value into a `YYYY-MM-DD` string or null.
 * @param {any} value
 * @returns {string|null}
 */
function toDateString(value) {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : null;
}

/**
 * @param {any} value
 * @returns {string|null} `YYYY-MM-DD HH:mm:ss` or null
 */
function toDateTimeString(value) {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : null;
}

/**
 * @param {any} value
 * @returns {string|null} ISO string or null
 */
function toIsoString(value) {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d.toISOString() : null;
}

module.exports = { toDateString, toDateTimeString, toIsoString };
