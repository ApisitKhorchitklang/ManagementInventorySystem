import { Router } from 'express';
import { pool } from '../db.js';
import { asyncHandler } from '../lib/errors.js';
import { toTransaction } from '../lib/serialize.js';

const router = Router();

/* GET /api/summary - ตัวเลขรวมสำหรับหน้าแรกของ UI */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [totals, byCategory, recent] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int                                                      AS total_products,
                COUNT(*) FILTER (WHERE is_active)::int                             AS active_products,
                COUNT(*) FILTER (WHERE is_active AND stock_quantity < low_stock_threshold)::int AS low_stock_count,
                COUNT(*) FILTER (WHERE is_active AND stock_quantity = 0)::int      AS out_of_stock_count,
                COALESCE(SUM(stock_quantity) FILTER (WHERE is_active), 0)::int     AS total_units,
                COALESCE(SUM(stock_quantity * cost_price) FILTER (WHERE is_active), 0) AS total_stock_value
           FROM products`
      ),
      pool.query(
        `SELECT c.id, c.name,
                COUNT(p.id) FILTER (WHERE p.is_active)::int AS product_count,
                COALESCE(SUM(p.stock_quantity) FILTER (WHERE p.is_active), 0)::int AS units
           FROM categories c
           LEFT JOIN products p ON p.category_id = c.id
          GROUP BY c.id
          ORDER BY c.name ASC`
      ),
      pool.query(
        `SELECT t.*, p.sku AS product_sku, p.name AS product_name
           FROM stock_transactions t
           JOIN products p ON p.id = t.product_id
          ORDER BY t.transacted_at DESC, t.id DESC
          LIMIT 8`
      ),
    ]);

    res.json({
      data: {
        totals: totals.rows[0],
        by_category: byCategory.rows,
        recent_transactions: recent.rows.map(toTransaction),
      },
    });
  })
);

export default router;
