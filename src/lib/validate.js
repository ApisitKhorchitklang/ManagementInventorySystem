import { ApiError } from './errors.js';
import { config } from '../config.js';

function fail(message, field) {
  throw ApiError.validation(message, { field });
}

const isEmpty = (value) => value === undefined || value === null || value === '';

export function requireString(source, field, { max = 255, min = 1, required = true } = {}) {
  const value = source?.[field];
  if (isEmpty(value)) {
    if (!required) return null;
    return fail(`ต้องระบุ ${field}`, field);
  }
  if (typeof value !== 'string') return fail(`${field} ต้องเป็นข้อความ`, field);

  const trimmed = value.trim();
  if (trimmed.length < min) return fail(`${field} ต้องมีอย่างน้อย ${min} ตัวอักษร`, field);
  if (trimmed.length > max) return fail(`${field} ยาวเกิน ${max} ตัวอักษร`, field);
  return trimmed;
}

export function requireInt(source, field, { min, max, required = true } = {}) {
  const value = source?.[field];
  if (isEmpty(value)) {
    if (!required) return null;
    return fail(`ต้องระบุ ${field}`, field);
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num)) return fail(`${field} ต้องเป็นจำนวนเต็ม`, field);
  if (min !== undefined && num < min) return fail(`${field} ต้องไม่น้อยกว่า ${min}`, field);
  if (max !== undefined && num > max) return fail(`${field} ต้องไม่มากกว่า ${max}`, field);
  return num;
}

export function requireDecimal(source, field, { min, max, required = true } = {}) {
  const value = source?.[field];
  if (isEmpty(value)) {
    if (!required) return null;
    return fail(`ต้องระบุ ${field}`, field);
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fail(`${field} ต้องเป็นตัวเลข`, field);
  if (min !== undefined && num < min) return fail(`${field} ต้องไม่น้อยกว่า ${min}`, field);
  if (max !== undefined && num > max) return fail(`${field} ต้องไม่มากกว่า ${max}`, field);
  return Math.round(num * 100) / 100; // ตัดให้เหลือ 2 ตำแหน่งตาม NUMERIC(12,2)
}

export function requireBoolean(source, field, { required = true } = {}) {
  const value = source?.[field];
  if (isEmpty(value)) {
    if (!required) return null;
    return fail(`ต้องระบุ ${field}`, field);
  }
  if (typeof value === 'boolean') return value;
  if (['true', '1'].includes(String(value).toLowerCase())) return true;
  if (['false', '0'].includes(String(value).toLowerCase())) return false;
  return fail(`${field} ต้องเป็น true หรือ false`, field);
}

/** id ที่มาจาก path parameter เช่น /api/products/:id */
export function requireIdParam(req, field = 'id') {
  return requireInt(req.params, field, { min: 1 });
}

/** อ่าน page/limit จาก query string แล้วคำนวณ offset ให้พร้อมใช้ */
export function parsePagination(query) {
  const page = requireInt(query, 'page', { min: 1, required: false }) ?? 1;
  const limit =
    requireInt(query, 'limit', { min: 1, max: config.pagination.maxLimit, required: false }) ??
    config.pagination.defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
}

/** ยอมรับเฉพาะค่าที่อยู่ในรายการที่กำหนด ป้องกัน SQL injection ตอนใส่ ORDER BY */
export function requireEnum(source, field, allowed, { required = true, fallback = null } = {}) {
  const value = source?.[field];
  if (isEmpty(value)) {
    if (!required) return fallback;
    return fail(`ต้องระบุ ${field}`, field);
  }
  const normalized = String(value).toLowerCase();
  const match = allowed.find((item) => item.toLowerCase() === normalized);
  if (!match) return fail(`${field} ต้องเป็นค่าใดค่าหนึ่งใน: ${allowed.join(', ')}`, field);
  return match;
}
