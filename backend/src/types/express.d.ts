import { AuthenticatedUser } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      token?: string;
      validatedQuery?: Record<string, any>;
    }
  }
}

export {};

