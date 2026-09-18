import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, pool } from './db.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  console.log(`Inventory API  → http://localhost:${config.port}/api`);
  console.log(`หน้าเว็บใช้งาน   → http://localhost:${config.port}/`);

  try {
    await pool.query('SELECT 1');
    console.log(`ฐานข้อมูล       → เชื่อมต่อสำเร็จ (${config.db.database})`);
  } catch (err) {
    console.error(`ฐานข้อมูล       → เชื่อมต่อไม่ได้: ${err.message}`);
    console.error('ตรวจสอบค่าใน .env แล้วรัน npm run db:reset เพื่อสร้างตาราง');
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} received, ปิดระบบอย่างปลอดภัย...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
