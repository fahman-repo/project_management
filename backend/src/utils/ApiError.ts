export class ApiError extends Error {
  public statusCode: number;
  public details: any;
  public isOperational: boolean;

  /**
   * @param statusCode
   * @param message
   * @param details field-level error details
   */
  constructor(statusCode: number, message: string, details: any = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Permintaan tidak valid', details: any = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Autentikasi diperlukan') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Anda tidak memiliki akses ke sumber daya ini') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Data tidak ditemukan') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Data sudah ada') {
    return new ApiError(409, message);
  }

  static unprocessable(message = 'Data gagal diproses', details: any = null) {
    return new ApiError(422, message, details);
  }

  static internal(message = 'Terjadi kesalahan pada server') {
    return new ApiError(500, message);
  }
}

export default ApiError;

