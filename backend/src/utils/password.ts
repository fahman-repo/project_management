import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Password policy: at least 8 chars, must contain a letter and a number.
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
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

export default { hashPassword, comparePassword, validatePasswordStrength };

