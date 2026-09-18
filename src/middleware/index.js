import { config } from '../config.js';

/** CORS แบบเบา ๆ ไม่ต้องพึ่ง dependency เพิ่ม */
export function cors(req, res, next) {
  const allowed = config.corsOrigin;
  const origin = req.headers.origin;

  if (allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowed.split(',').map((s) => s.trim()).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

/** log หนึ่งบรรทัดต่อหนึ่ง request พร้อมเวลาที่ใช้ */
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`
    );
  });
  next();
}
