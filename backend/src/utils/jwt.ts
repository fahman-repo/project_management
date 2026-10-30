import jwt from 'jsonwebtoken';
import env from '../config/env';
import { JwtUserPayload } from '../types';

export function signToken(user: { id: number; role: string; email?: string }): string {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

export function verifyToken(token: string): JwtUserPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtUserPayload;
}

/**
 * Decode without verifying - used only for logging.
 */
export function decodeToken(token: string): any {
  return jwt.decode(token);
}

export default { signToken, verifyToken, decodeToken };

