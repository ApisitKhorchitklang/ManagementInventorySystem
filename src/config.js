import 'dotenv/config';

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback, min = 1) {
  const num = Number(value);
  return value !== undefined && value !== '' && Number.isInteger(num) && num >= min
    ? num
    : fallback;
}

export const config = {
  port: int(process.env.PORT, 3000),
  env: process.env.NODE_ENV ?? 'development',

  // ใช้ DATABASE_URL ก่อนถ้ามี ไม่งั้นค่อยประกอบจากตัวแปร PG* ทีละตัว
  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST ?? 'localhost',
    port: int(process.env.PGPORT, 5432),
    database: process.env.PGDATABASE ?? 'inventory',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? '',
    ssl: bool(process.env.DATABASE_SSL) ? { rejectUnauthorized: false } : false,
    max: int(process.env.DB_POOL_MAX, 10),
  },

  lowStockThreshold: int(process.env.LOW_STOCK_THRESHOLD, 5, 0),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  pagination: { defaultLimit: 20, maxLimit: 100 },
};
