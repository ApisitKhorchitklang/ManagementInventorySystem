-- ===========================================================================
-- Inventory Management System - Schema (PostgreSQL 13+)
-- รันไฟล์นี้จะลบตารางเดิมทั้งหมดแล้วสร้างใหม่
--   psql -d inventory -f db/schema.sql
-- ===========================================================================

DROP VIEW  IF EXISTS v_products_full;
DROP TABLE IF EXISTS stock_transactions;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TYPE  IF EXISTS stock_direction;
DROP FUNCTION IF EXISTS set_updated_at();

-- ประเภทการเคลื่อนไหวสต็อก: IN = รับเข้า, OUT = ตัดออก
CREATE TYPE stock_direction AS ENUM ('IN', 'OUT');

-- อัปเดตคอลัมน์ updated_at อัตโนมัติทุกครั้งที่มีการแก้ไขแถว
CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- categories : กลุ่มสินค้า (IT, Office Supply, Furniture, ...)
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- products : สินค้า 1 รายการ = 1 SKU
--   stock_quantity      คือยอดคงเหลือปัจจุบัน (ห้ามติดลบ - บังคับที่ระดับ DB)
--   low_stock_threshold คือจุดเตือนเติมสต็อกเฉพาะของสินค้าชิ้นนั้น
-- ---------------------------------------------------------------------------
CREATE TABLE products (
    id                  BIGSERIAL     PRIMARY KEY,
    category_id         BIGINT        NOT NULL
                                      REFERENCES categories(id) ON DELETE RESTRICT,
    sku                 VARCHAR(50)   NOT NULL UNIQUE,
    name                VARCHAR(255)  NOT NULL,
    description         VARCHAR(500),
    unit                VARCHAR(20)   NOT NULL DEFAULT 'ชิ้น',
    cost_price          NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
    stock_quantity      INTEGER       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER       NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_products_category  ON products (category_id);
CREATE INDEX idx_products_name      ON products (lower(name));
CREATE INDEX idx_products_low_stock ON products (stock_quantity) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- stock_transactions : ประวัติการเคลื่อนไหวสต็อกทุกครั้ง (append-only ledger)
--   quantity      เก็บเป็นจำนวนบวกเสมอ ทิศทางดูจากคอลัมน์ type
--   balance_after เก็บยอดคงเหลือหลังทำรายการ เพื่อตรวจสอบย้อนหลังได้
-- ---------------------------------------------------------------------------
CREATE TABLE stock_transactions (
    id             BIGSERIAL       PRIMARY KEY,
    product_id     BIGINT          NOT NULL
                                   REFERENCES products(id) ON DELETE RESTRICT,
    type           stock_direction NOT NULL,
    quantity       INTEGER         NOT NULL CHECK (quantity > 0),
    balance_before INTEGER         NOT NULL CHECK (balance_before >= 0),
    balance_after  INTEGER         NOT NULL CHECK (balance_after  >= 0),
    reason         VARCHAR(255),
    created_by     VARCHAR(100),
    transacted_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_product_time ON stock_transactions (product_id, transacted_at DESC);
CREATE INDEX idx_tx_time         ON stock_transactions (transacted_at DESC);

-- ---------------------------------------------------------------------------
-- มุมมองรวมสินค้า + ชื่อกลุ่ม + สถานะสต็อก ใช้ซ้ำในหลาย endpoint
-- ---------------------------------------------------------------------------
CREATE VIEW v_products_full AS
SELECT p.*,
       c.name AS category_name,
       (p.stock_quantity < p.low_stock_threshold) AS is_low_stock,
       (p.stock_quantity * p.cost_price)          AS stock_value
  FROM products p
  JOIN categories c ON c.id = p.category_id;
