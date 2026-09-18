import { Router } from 'express';
import { pool } from '../db.js';
import { ApiError, asyncHandler, mapDatabaseError } from '../lib/errors.js';
import { requireIdParam, requireString } from '../lib/validate.js';
import { toCategory } from '../lib/serialize.js';

const router = Router();

/* GET /api/categories - รายการกลุ่มสินค้าพร้อมจำนวนสินค้าในกลุ่ม */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.created_at,
              COUNT(p.id) FILTER (WHERE p.is_active) AS product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id
        ORDER BY c.name ASC`
    );
    res.json({ data: rows.map(toCategory), count: rows.length });
  })
);

/* POST /api/categories - เพิ่มกลุ่มสินค้า */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = requireString(req.body, 'name', { max: 100 });
    const description = requireString(req.body, 'description', { max: 255, required: false });

    try {
      const { rows } = await pool.query(
        `INSERT INTO categories (name, description)
         VALUES ($1, $2)
         RETURNING id, name, description, created_at`,
        [name, description]
      );
      res.status(201).json({ data: toCategory(rows[0]) });
    } catch (err) {
      throw mapDatabaseError(err);
    }
  })
);

/* PATCH /api/categories/:id - แก้ไขชื่อหรือคำอธิบาย */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireIdParam(req);
    const name = requireString(req.body, 'name', { max: 100, required: false });
    const description = requireString(req.body, 'description', { max: 255, required: false });

    if (name === null && description === null) {
      throw ApiError.validation('ไม่มีข้อมูลที่ต้องแก้ไข ส่ง name หรือ description อย่างน้อย 1 ฟิลด์');
    }

    try {
      const { rows } = await pool.query(
        `UPDATE categories
            SET name        = COALESCE($1, name),
                description = COALESCE($2, description)
          WHERE id = $3
          RETURNING id, name, description, created_at`,
        [name, description, id]
      );
      if (!rows.length) throw ApiError.notFound(`ไม่พบกลุ่มสินค้า id = ${id}`);
      res.json({ data: toCategory(rows[0]) });
    } catch (err) {
      throw mapDatabaseError(err);
    }
  })
);

/* DELETE /api/categories/:id - ลบได้เมื่อไม่มีสินค้าอยู่ในกลุ่มแล้ว */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireIdParam(req);

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS product_count FROM products WHERE category_id = $1',
      [id]
    );
    if (rows[0].product_count > 0) {
      throw ApiError.conflict(
        'CATEGORY_IN_USE',
        `ยังมีสินค้า ${rows[0].product_count} รายการอยู่ในกลุ่มนี้ ย้ายสินค้าออกก่อนจึงจะลบได้`
      );
    }

    const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    if (!rowCount) throw ApiError.notFound(`ไม่พบกลุ่มสินค้า id = ${id}`);
    res.status(204).send();
  })
);

export default router;
