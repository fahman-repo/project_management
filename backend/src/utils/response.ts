import { Response } from 'express';

/**
 * Standard success envelope.
 */
export function sendSuccess(res: Response, data: any = null, message = 'Berhasil', meta: any = undefined): Response {
  const body: { success: boolean; message: string; data: any; meta?: any } = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.json(body);
}

export function sendPaginated(res: Response, rows: any[], meta: any, message = 'Berhasil'): Response {
  return res.json({ success: true, message, data: rows, meta });
}

export function sendError(res: Response, statusCode: number, message: string, errors: any = undefined): Response {
  const body: { success: boolean; message: string; errors?: any } = { success: false, message };
  if (errors !== undefined) body.errors = errors;
  return res.status(statusCode).json(body);
}

export default { sendSuccess, sendPaginated, sendError };

