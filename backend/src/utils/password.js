'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/** @param {string} plain */
async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * @param {string} plain
 * @param {string} hash
 */
async function comparePassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Password policy: at least 8 chars, must contain a letter and a number.
 * @param {string} password
 * @returns {{valid:boolean, message?:string}}
 */
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password minimal 8 karakter' };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung huruf' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password harus mengandung angka' };
  }
  return { valid: true };
}

module.exports = { hashPassword, comparePassword, validatePasswordStrength };
