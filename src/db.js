import pg from 'pg';
import { config } from './config.js';

const { Pool, types } = pg;

// NUMERIC ของ pg คืนค่าเป็น string โดยค่าเริ่มต้น แปลงเป็น number ให้ JSON อ่านง่าย
types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));
// BIGINT (int8) ก็เช่นกัน จำนวนแถวในระบบนี้ไม่เกินช่วงที่ Number รองรับ
types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

export const pool = new Pool(
  config.db.connectionString
    ? {
        connectionString: config.db.connectionString,
        ssl: config.db.ssl,
        max: config.db.max,
      }
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
        ssl: config.db.ssl,
        max: config.db.max,
      }
);

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/**
 * รัน callback ภายใน transaction เดียว COMMIT เมื่อสำเร็จ ROLLBACK เมื่อมี error
 * ใช้กับทุกงานที่แตะสต็อก เพื่อให้ยอดคงเหลือกับ ledger ตรงกันเสมอ
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // อย่าให้ error ตอน rollback บัง error ตัวจริง
      console.error('[db] rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
