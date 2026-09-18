/**
 * สร้างตารางทั้งหมดจาก db/schema.sql
 *   node scripts/setup-db.js              → สร้างตารางเปล่า
 *   node scripts/setup-db.js --with-seed  → สร้างตาราง + ใส่ข้อมูลตัวอย่าง
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from '../src/db.js';
import { config } from '../src/config.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withSeed = process.argv.includes('--with-seed');

async function run(file) {
  const sql = await fs.readFile(path.join(rootDir, 'db', file), 'utf8');
  await pool.query(sql);
  console.log(`✓ รัน ${file} สำเร็จ`);
}

try {
  console.log(`เชื่อมต่อฐานข้อมูล ${config.db.database} ที่ ${config.db.host}:${config.db.port}`);
  await run('schema.sql');
  if (withSeed) await run('seed.sql');
  console.log('เสร็จเรียบร้อย เริ่มใช้งานด้วย npm run dev');
} catch (err) {
  console.error('ล้มเหลว:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
