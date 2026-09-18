export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, message, details) {
    return new ApiError(400, code, message, details);
  }

  static notFound(message, details) {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }

  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }

  static validation(message, details) {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** แปลง error ของ PostgreSQL ให้เป็นข้อความที่ผู้ใช้เข้าใจได้ */
export function mapDatabaseError(err) {
  if (err?.code === '23505') {
    if (err.constraint?.includes('sku')) {
      return ApiError.conflict('SKU_ALREADY_EXISTS', 'SKU นี้ถูกใช้กับสินค้าอื่นแล้ว');
    }
    if (err.constraint?.includes('categories_name')) {
      return ApiError.conflict('CATEGORY_ALREADY_EXISTS', 'มีกลุ่มสินค้าชื่อนี้อยู่แล้ว');
    }
    return ApiError.conflict('DUPLICATE_VALUE', 'ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว');
  }

  if (err?.code === '23503') {
    if (err.constraint?.includes('category')) {
      return ApiError.validation('ไม่พบกลุ่มสินค้าที่ระบุ', { field: 'category_id' });
    }
    return ApiError.conflict('REFERENCE_CONSTRAINT', 'ข้อมูลนี้ถูกอ้างอิงอยู่ ไม่สามารถดำเนินการได้');
  }

  if (err?.code === '23514' && err.constraint?.includes('stock_quantity')) {
    return ApiError.conflict('INSUFFICIENT_STOCK', 'สต็อกคงเหลือติดลบไม่ได้');
  }

  if (['ECONNREFUSED', '57P03', '3D000', '28P01'].includes(err?.code)) {
    return new ApiError(503, 'DATABASE_UNAVAILABLE', 'เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจสอบค่าใน .env');
  }

  return err;
}

export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`ไม่พบ endpoint ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const mapped = err instanceof ApiError ? err : mapDatabaseError(err);

  if (mapped instanceof ApiError) {
    return res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, details: mapped.details },
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ใน request body ไม่ถูกต้อง' },
    });
  }

  console.error('[UNHANDLED]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
  });
}
