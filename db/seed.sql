
-- ===========================================================================
-- Sample data for testing
-- psql -d inventory -f db/seed.sql
-- ===========================================================================

INSERT INTO categories (name, description) VALUES
    ('IT',            'Computer and IT equipment'),
    ('Office Supply', 'Stationery and office supplies'),
    ('Furniture',     'Office furniture')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (category_id, sku, name, description, unit, cost_price, stock_quantity, low_stock_threshold)

SELECT c.id, v.sku, v.name, v.description, v.unit, v.cost_price, v.stock_quantity, v.threshold
  FROM (VALUES
        ('IT',            'IT-NB-001', 'Dell Latitude 5450 Laptop',       'Core i5 / RAM 16GB / SSD 512GB', 'unit',  24500.00, 12, 3),
        ('IT',            'IT-MS-002', 'Logitech M331 Wireless Mouse',    'Quiet click',                    'unit',    420.00,  3, 5),
        ('IT',            'IT-KB-003', 'USB Thai Keyboard',               NULL,                             'unit',    350.00, 25, 5),
        ('IT',            'IT-HD-004', '2TB External Hard Drive',          'USB 3.2',                        'unit',   2150.00,  1, 2),
        ('Office Supply',  'OS-PN-001', 'Blue Ballpoint Pens (Box of 50)', NULL,                            'box',     275.00, 40, 5),
        ('Office Supply',  'OS-PP-002', 'A4 Paper 80gsm',                  '500 sheets per pack',            'pack',    115.00,  4, 10),
        ('Office Supply',  'OS-ST-003', 'No. 10 Staples',                  NULL,                             'box',      18.00,  0, 5),
        ('Furniture',      'FN-CH-001', 'Office Chair with Backrest',      'Adjustable height',              'unit',   3200.00,  8, 3),
        ('Furniture',      'FN-DK-002', '120cm Office Desk',               'Particle board',                'unit',   4500.00,  2, 3)
       ) AS v(category, sku, name, description, unit, cost_price, stock_quantity, threshold)

 JOIN categories c ON c.name = v.category

ON CONFLICT (sku) DO NOTHING;

-- Create opening stock transactions matching the current stock quantity
-- of newly created products.

INSERT INTO stock_transactions
    (product_id, type, quantity, balance_before, balance_after, reason, created_by)

SELECT
    p.id,
    'IN',
    p.stock_quantity,
    0,
    p.stock_quantity,
    'Opening stock',
    'seed'

  FROM products p

 WHERE p.stock_quantity > 0
   AND NOT EXISTS (
       SELECT 1
       FROM stock_transactions t
       WHERE t.product_id = p.id
   );

