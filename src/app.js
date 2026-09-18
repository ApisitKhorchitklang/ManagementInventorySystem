import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { cors, requestLogger } from './middleware/index.js';
import productsRouter from './routes/products.routes.js';
import stockRouter from './routes/stock.routes.js';
import categoriesRouter from './routes/categories.routes.js';
import summaryRouter from './routes/summary.routes.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(cors);
  app.use(express.json({ limit: '1mb' }));

  // หน้าเว็บสำหรับใช้งานจริง เปิดที่ http://localhost:<PORT>/
  app.use(express.static(path.join(rootDir, 'public')));
  app.use('/docs', express.static(path.join(rootDir, 'docs')));

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({
        status: 'error',
        database: 'disconnected',
        message: err.message,
      });
    }
  });

  app.get('/api', (req, res) => {
    res.json({
      name: 'Inventory Management API',
      version: '2.0.0',
      low_stock_threshold: config.lowStockThreshold,
      endpoints: [
        'GET    /health',
        'GET    /api/summary',
        'GET    /api/categories',
        'POST   /api/categories',
        'PATCH  /api/categories/:id',
        'DELETE /api/categories/:id',
        'GET    /api/products',
        'POST   /api/products',
        'GET    /api/products/low-stock',
        'GET    /api/products/:id',
        'PATCH  /api/products/:id',
        'DELETE /api/products/:id',
        'GET    /api/products/:id/transactions',
        'PATCH  /api/stock/adjust',
        'PATCH  /api/stock/bulk-adjust',
        'GET    /api/stock/transactions',
      ],
    });
  });

  app.use('/api/products', productsRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/summary', summaryRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
