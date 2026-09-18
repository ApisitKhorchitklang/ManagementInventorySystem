import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import {
  parsePagination,
  requireEnum,
  requireInt,
  requireString,
} from '../lib/validate.js';
import { meta, toTransaction } from '../lib/serialize.js';

const router = Router();

/**
 * ปรับสต็อกสินค้า 1 ชิ้นภายใน transaction เดียว
 *  1) ล็อกแถวสินค้าด้วย SELECT ... FOR UPDATE กัน request พร้อมกันตัดสต็อกเกิน
 *  2) ตรวจว่ายอดใหม่ต้องไม่ติดลบ
 *  3) อัปเดตยอดคงเหลือ + เขียน ledger เสมอ ถ้าขั้นใดพลาด ยกเลิกทั้งชุด
 */
async function adjustStock(client, { productId, quantity, reason, createdBy }) {
  const { rows } = await client.query(
    `SELECT id, sku, name, unit, stock_quantity, low_stock_threshold, is_active
       FROM products
      WHERE id = $1
      FOR UPDATE`,
    [productId]
  );

  if (rows.length === 0) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', `ไม่พบสินค้า id = ${productId}`);
  }

  const product = rows[0];
  if (!product.is_active) {
    throw ApiError.conflict(
      'PRODUCT_INACTIVE',
      `สินค้า ${product.sku} ถูกปิดการใช้งานอยู่ ปรับสต็อกไม่ได้`
    );
  }

  const balanceBefore = product.stock_quantity;
  const balanceAfter = balanceBefore + quantity;

  if (balanceAfter < 0) {
    throw ApiError.conflict(
      'INSUFFICIENT_STOCK',
      `สต็อกไม่พอ: ${product.name} คงเหลือ ${balanceBefore} ${product.unit} แต่ขอตัด ${Math.abs(quantity)} ${product.unit}`,
      {
        product_id: product.id,
        sku: product.sku,
        stock_quantity: balanceBefore,
        requested: quantity,
        shortfall: Math.abs(balanceAfter),
      }
    );
  }

  await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [
    balanceAfter,
    productId,
  ]);

  const tx = await client.query(
    `INSERT INTO stock_transactions
       (product_id, type, quantity, balance_before, balance_after, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      productId,
      quantity > 0 ? 'IN' : 'OUT',
      Math.abs(quantity),
      balanceBefore,
      balanceAfter,
      reason,
      createdBy,
    ]
  );

  return { product, balanceBefore, balanceAfter, transaction: tx.rows[0] };
}

function adjustmentResponse(result, quantity) {
  return {
    product: {
      id: result.product.id,
      sku: result.product.sku,
      name: result.product.name,
      unit: result.product.unit,
      stock_quantity: result.balanceAfter,
      low_stock_threshold: result.product.low_stock_threshold,
      is_low_stock: result.balanceAfter < result.product.low_stock_threshold,
    },
    adjustment: {
      balance_before: result.balanceBefore,
      change: quantity,
      balance_after: result.balanceAfter,
    },
    transaction: toTransaction(result.transaction),
  };
}

/* ---------------------------------------------------------------------------
 * PATCH /api/stock/adjust - ปรับเพิ่ม/ลดสต็อก เช่น +10 หรือ -5
 * ------------------------------------------------------------------------- */
router.patch(
  '/adjust',
  asyncHandler(async (req, res) => {
    const productId = requireInt(req.body, 'product_id', { min: 1 });
    const quantity = requireInt(req.body, 'quantity', { min: -1000000, max: 1000000 });
    const reason = requireString(req.body, 'reason', { max: 255, required: false });
    const createdBy = requireString(req.body, 'created_by', { max: 100, required: false });

    if (quantity === 0) {
      throw ApiError.validation('quantity ต้องไม่เท่ากับ 0 ใช้ค่าบวกเพื่อรับเข้า ค่าลบเพื่อตัดออก', {
        field: 'quantity',
      });
    }

    const result = await withTransaction((client) =>
      adjustStock(client, { productId, quantity, reason, createdBy })
    );

    res.json({
      data: adjustmentResponse(result, quantity),
      message: `${quantity > 0 ? 'รับเข้า' : 'ตัดออก'} ${Math.abs(quantity)} ${result.product.unit} สำเร็จ คงเหลือ ${result.balanceAfter}`,
    });
  })
);

/* ---------------------------------------------------------------------------
 * PATCH /api/stock/bulk-adjust - ปรับหลายรายการในครั้งเดียว
 * ทั้งชุดต้องสำเร็จทั้งหมด ถ้ามีรายการใดสต็อกไม่พอ จะยกเลิกทุกรายการ
 * ------------------------------------------------------------------------- */
router.patch(
  '/bulk-adjust',
  asyncHandler(async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.validation('ต้องระบุ items เป็น array อย่างน้อย 1 รายการ', { field: 'items' });
    }
    if (items.length > 100) {
      throw ApiError.validation('ปรับได้สูงสุด 100 รายการต่อครั้ง', { field: 'items' });
    }

    const parsed = items.map((item, index) => {
      const quantity = requireInt(item, 'quantity', { min: -1000000, max: 1000000 });
      if (quantity === 0) {
        throw ApiError.validation(`items[${index}].quantity ต้องไม่เท่ากับ 0`, {
          field: `items[${index}].quantity`,
        });
      }
      return {
        productId: requireInt(item, 'product_id', { min: 1 }),
        quantity,
        reason: requireString(item, 'reason', { max: 255, required: false }),
        createdBy: requireString(item, 'created_by', { max: 100, required: false }),
      };
    });

    const results = await withTransaction(async (client) => {
      const out = [];
      for (const item of parsed) {
        out.push(adjustmentResponse(await adjustStock(client, item), item.quantity));
      }
      return out;
    });

    res.json({ data: results, count: results.length });
  })
);

/* ---------------------------------------------------------------------------
 * GET /api/stock/transactions - ประวัติการเคลื่อนไหวทั้งระบบ
 * ------------------------------------------------------------------------- */
router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const productId = requireInt(req.query, 'product_id', { min: 1, required: false });
    const type = requireEnum(req.query, 'type', ['IN', 'OUT'], {
      required: false,
      fallback: null,
    });
    const from = requireString(req.query, 'from', { max: 40, required: false });
    const to = requireString(req.query, 'to', { max: 40, required: false });

    const where = [];
    const params = [];

    if (productId) {
      params.push(productId);
      where.push(`t.product_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      where.push(`t.type = $${params.length}`);
    }
    if (from) {
      if (Number.isNaN(Date.parse(from))) {
        throw ApiError.validation('from ต้องเป็นวันที่รูปแบบ ISO เช่น 2026-01-31', { field: 'from' });
      }
      params.push(from);
      where.push(`t.transacted_at >= $${params.length}`);
    }
    if (to) {
      if (Number.isNaN(Date.parse(to))) {
        throw ApiError.validation('to ต้องเป็นวันที่รูปแบบ ISO เช่น 2026-01-31', { field: 'to' });
      }
      params.push(to);
      where.push(`t.transacted_at <= $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT t.*, p.sku AS product_sku, p.name AS product_name,
              COUNT(*) OVER() AS total_count
         FROM stock_transactions t
         JOIN products p ON p.id = t.product_id
         ${whereSql}
        ORDER BY t.transacted_at DESC, t.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({ data: rows.map(toTransaction), meta: meta({ page, limit, total }) });
  })
);

export default router;
