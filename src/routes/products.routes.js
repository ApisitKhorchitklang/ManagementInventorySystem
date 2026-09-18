import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { config } from '../config.js';
import { ApiError, asyncHandler, mapDatabaseError } from '../lib/errors.js';
import {
  parsePagination,
  requireBoolean,
  requireDecimal,
  requireEnum,
  requireIdParam,
  requireInt,
  requireString,
} from '../lib/validate.js';
import { meta, toProduct, toTransaction } from '../lib/serialize.js';

const router = Router();

const SORTABLE = {
  name: 'p.name',
  sku: 'p.sku',
  stock_quantity: 'p.stock_quantity',
  cost_price: 'p.cost_price',
  created_at: 'p.created_at',
};

const PRODUCT_COLUMNS = `p.id, p.sku, p.name, p.description, p.unit, p.cost_price,
       p.stock_quantity, p.low_stock_threshold, p.is_active, p.created_at, p.updated_at,
       p.category_id, c.name AS category_name,
       (p.stock_quantity < p.low_stock_threshold) AS is_low_stock,
       (p.stock_quantity * p.cost_price) AS stock_value`;

async function findProductById(id, client = pool) {
  const { rows } = await client.query(
    `SELECT ${PRODUCT_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/* ---------------------------------------------------------------------------
 * GET /api/products
 * ค้นหา + กรอง + แบ่งหน้า
 * ------------------------------------------------------------------------- */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const search = requireString(req.query, 'search', { max: 100, required: false });
    const categoryId = requireInt(req.query, 'category_id', { min: 1, required: false });
    const isActive = requireBoolean(req.query, 'is_active', { required: false });
    const lowStockOnly = requireBoolean(req.query, 'low_stock', { required: false });
    const sort = requireEnum(req.query, 'sort', Object.keys(SORTABLE), {
      required: false,
      fallback: 'created_at',
    });
    const order = requireEnum(req.query, 'order', ['asc', 'desc'], {
      required: false,
      fallback: 'desc',
    });

    const where = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }
    if (categoryId) {
      params.push(categoryId);
      where.push(`p.category_id = $${params.length}`);
    }
    if (isActive !== null) {
      params.push(isActive);
      where.push(`p.is_active = $${params.length}`);
    }
    if (lowStockOnly === true) {
      where.push('p.stock_quantity < p.low_stock_threshold');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS}, COUNT(*) OVER() AS total_count
         FROM products p
         JOIN categories c ON c.id = p.category_id
         ${whereSql}
        ORDER BY ${SORTABLE[sort]} ${order.toUpperCase()}, p.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({ data: rows.map(toProduct), meta: meta({ page, limit, total }) });
  })
);

/* ---------------------------------------------------------------------------
 * GET /api/products/low-stock
 * สินค้าที่คงเหลือน้อยกว่าจุดเตือน (ค่าเริ่มต้น 5 ชิ้น)
 * ประกาศก่อน /:id เสมอ ไม่งั้น Express จะมอง "low-stock" เป็น id
 * ------------------------------------------------------------------------- */
router.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const threshold = requireInt(req.query, 'threshold', { min: 0, required: false });

    // ไม่ส่ง threshold มา = ใช้จุดเตือนเฉพาะของสินค้าแต่ละตัว (default 5)
    const condition = threshold === null
      ? 'p.stock_quantity < p.low_stock_threshold'
      : 'p.stock_quantity < $1';
    const params = threshold === null ? [] : [threshold];

    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p
         JOIN categories c ON c.id = p.category_id
        WHERE ${condition}
          AND p.is_active = TRUE
        ORDER BY p.stock_quantity ASC, p.name ASC`,
      params
    );

    res.json({
      threshold: threshold ?? config.lowStockThreshold,
      threshold_mode: threshold === null ? 'per_product' : 'fixed',
      count: rows.length,
      data: rows.map(toProduct),
    });
  })
);

/* ---------------------------------------------------------------------------
 * POST /api/products - สร้างสินค้าใหม่
 * ------------------------------------------------------------------------- */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const sku = requireString(req.body, 'sku', { max: 50 });
    const name = requireString(req.body, 'name', { max: 255 });
    const description = requireString(req.body, 'description', { max: 500, required: false });
    const unit = requireString(req.body, 'unit', { max: 20, required: false }) ?? 'ชิ้น';
    const categoryId = requireInt(req.body, 'category_id', { min: 1 });
    const costPrice = requireDecimal(req.body, 'cost_price', { min: 0, max: 9999999999 });
    const initialStock = requireInt(req.body, 'stock_quantity', { min: 0, required: false }) ?? 0;
    const threshold =
      requireInt(req.body, 'low_stock_threshold', { min: 0, required: false }) ??
      config.lowStockThreshold;

    const created = await withTransaction(async (client) => {
      let inserted;
      try {
        inserted = await client.query(
          `INSERT INTO products
             (category_id, sku, name, description, unit, cost_price, stock_quantity, low_stock_threshold)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [categoryId, sku, name, description, unit, costPrice, initialStock, threshold]
        );
      } catch (err) {
        throw mapDatabaseError(err);
      }

      const productId = inserted.rows[0].id;

      // ยอดตั้งต้นก็ถือเป็นการเคลื่อนไหวสต็อก ต้องมีใน ledger ด้วย
      if (initialStock > 0) {
        await client.query(
          `INSERT INTO stock_transactions
             (product_id, type, quantity, balance_before, balance_after, reason, created_by)
           VALUES ($1, 'IN', $2, 0, $2, $3, $4)`,
          [productId, initialStock, 'ยอดยกมาตอนสร้างสินค้า', req.body?.created_by ?? null]
        );
      }

      return findProductById(productId, client);
    });

    res.status(201).json({ data: toProduct(created) });
  })
);

/* ---------------------------------------------------------------------------
 * GET /api/products/:id
 * ------------------------------------------------------------------------- */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireIdParam(req);
    const product = await findProductById(id);
    if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', `ไม่พบสินค้า id = ${id}`);
    res.json({ data: toProduct(product) });
  })
);

/* ---------------------------------------------------------------------------
 * PATCH /api/products/:id - แก้ไขข้อมูลสินค้า (ยกเว้นจำนวนสต็อก)
 * จำนวนสต็อกต้องปรับผ่าน /api/stock/adjust เท่านั้น เพื่อให้มีประวัติเสมอ
 * ------------------------------------------------------------------------- */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireIdParam(req);

    if ('stock_quantity' in (req.body ?? {})) {
      throw ApiError.validation(
        'แก้ไขจำนวนสต็อกที่นี่ไม่ได้ ให้ใช้ PATCH /api/stock/adjust เพื่อให้มีการบันทึกประวัติ',
        { field: 'stock_quantity' }
      );
    }

    const fields = {
      sku: requireString(req.body, 'sku', { max: 50, required: false }),
      name: requireString(req.body, 'name', { max: 255, required: false }),
      description: requireString(req.body, 'description', { max: 500, required: false }),
      unit: requireString(req.body, 'unit', { max: 20, required: false }),
      category_id: requireInt(req.body, 'category_id', { min: 1, required: false }),
      cost_price: requireDecimal(req.body, 'cost_price', { min: 0, required: false }),
      low_stock_threshold: requireInt(req.body, 'low_stock_threshold', {
        min: 0,
        required: false,
      }),
      is_active: requireBoolean(req.body, 'is_active', { required: false }),
    };

    const sets = [];
    const params = [];
    for (const [column, value] of Object.entries(fields)) {
      if (value === null) continue;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }

    if (!sets.length) {
      throw ApiError.validation('ไม่มีข้อมูลที่ต้องแก้ไข ส่งอย่างน้อย 1 ฟิลด์');
    }

    params.push(id);

    let result;
    try {
      result = await pool.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
        params
      );
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!result.rowCount) {
      throw new ApiError(404, 'PRODUCT_NOT_FOUND', `ไม่พบสินค้า id = ${id}`);
    }

    res.json({ data: toProduct(await findProductById(id)) });
  })
);

/* ---------------------------------------------------------------------------
 * DELETE /api/products/:id
 * ปิดการใช้งาน (soft delete) เพื่อรักษาประวัติการเคลื่อนไหว
 * ใส่ ?force=true เพื่อลบถาวร ทำได้เฉพาะสินค้าที่ยังไม่เคยมีรายการสต็อก
 * ------------------------------------------------------------------------- */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireIdParam(req);
    const force = requireBoolean(req.query, 'force', { required: false }) === true;

    if (!force) {
      const { rowCount } = await pool.query(
        'UPDATE products SET is_active = FALSE WHERE id = $1 RETURNING id',
        [id]
      );
      if (!rowCount) throw new ApiError(404, 'PRODUCT_NOT_FOUND', `ไม่พบสินค้า id = ${id}`);
      return res.json({
        data: { id, is_active: false },
        message: 'ปิดการใช้งานสินค้าแล้ว ประวัติการเคลื่อนไหวยังอยู่ครบ',
      });
    }

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS tx_count FROM stock_transactions WHERE product_id = $1',
      [id]
    );
    if (rows[0].tx_count > 0) {
      throw ApiError.conflict(
        'PRODUCT_HAS_TRANSACTIONS',
        `สินค้านี้มีประวัติการเคลื่อนไหว ${rows[0].tx_count} รายการ ลบถาวรไม่ได้ ให้ปิดการใช้งานแทน`
      );
    }

    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    if (!rowCount) throw new ApiError(404, 'PRODUCT_NOT_FOUND', `ไม่พบสินค้า id = ${id}`);
    res.status(204).send();
  })
);

/* ---------------------------------------------------------------------------
 * GET /api/products/:id/transactions - ประวัติการเคลื่อนไหวของสินค้าชิ้นเดียว
 * ------------------------------------------------------------------------- */
router.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const id = requireIdParam(req);
    const { page, limit, offset } = parsePagination(req.query);

    const product = await findProductById(id);
    if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', `ไม่พบสินค้า id = ${id}`);

    const { rows } = await pool.query(
      `SELECT t.*, COUNT(*) OVER() AS total_count
         FROM stock_transactions t
        WHERE t.product_id = $1
        ORDER BY t.transacted_at DESC, t.id DESC
        LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      data: rows.map(toTransaction),
      meta: meta({ page, limit, total }),
      product: { id: product.id, sku: product.sku, name: product.name },
    });
  })
);

export default router;
