/**
 * เทสต์ตัวตรวจสอบข้อมูลเข้า รันได้โดยไม่ต้องต่อฐานข้อมูล
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePagination,
  requireBoolean,
  requireDecimal,
  requireEnum,
  requireInt,
  requireString,
} from '../src/lib/validate.js';

test('requireString ตัดช่องว่างหัวท้าย', () => {
  assert.equal(requireString({ sku: '  IT-001  ' }, 'sku'), 'IT-001');
});

test('requireString ปฏิเสธค่าว่างเมื่อบังคับกรอก', () => {
  assert.throws(() => requireString({}, 'sku'), { status: 422, code: 'VALIDATION_ERROR' });
});

test('requireString คืน null เมื่อไม่บังคับกรอก', () => {
  assert.equal(requireString({}, 'reason', { required: false }), null);
});

test('requireInt รับตัวเลขที่มาเป็น string จาก query', () => {
  assert.equal(requireInt({ page: '3' }, 'page', { min: 1 }), 3);
});

test('requireInt ปฏิเสธทศนิยม', () => {
  assert.throws(() => requireInt({ quantity: 1.5 }, 'quantity'), { status: 422 });
});

test('requireInt บังคับค่าต่ำสุด', () => {
  assert.throws(() => requireInt({ threshold: -1 }, 'threshold', { min: 0 }), { status: 422 });
});

test('requireDecimal ปัดเหลือ 2 ตำแหน่ง', () => {
  assert.equal(requireDecimal({ cost_price: 12.3456 }, 'cost_price', { min: 0 }), 12.35);
});

test('requireBoolean อ่านค่าจาก query string', () => {
  assert.equal(requireBoolean({ is_active: 'true' }, 'is_active'), true);
  assert.equal(requireBoolean({ is_active: '0' }, 'is_active'), false);
});

test('requireEnum กันค่าที่ไม่อยู่ในรายการ (กัน SQL injection ตอน ORDER BY)', () => {
  assert.equal(requireEnum({ sort: 'NAME' }, 'sort', ['name', 'sku']), 'name');
  assert.throws(() => requireEnum({ sort: 'id; DROP TABLE products' }, 'sort', ['name']), {
    status: 422,
  });
});

test('parsePagination ใช้ค่าเริ่มต้นและคำนวณ offset', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, offset: 0 });
  assert.deepEqual(parsePagination({ page: '3', limit: '10' }), { page: 3, limit: 10, offset: 20 });
});

test('parsePagination ไม่ยอมให้ limit เกินเพดาน', () => {
  assert.throws(() => parsePagination({ limit: '5000' }), { status: 422 });
});
