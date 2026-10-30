import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so rejected promises reach the error middleware.
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any> | any): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;

