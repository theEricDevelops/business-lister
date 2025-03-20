import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import businessRouter from './api/businesses';
import syncRouter from './api/sync';
import Logger from './utils/logger';
import { initDB } from './utils/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const logger = new Logger('server.log');

app.use(express.json());

app.use('/api/businesses', businessRouter);
app.use('/api/sync', syncRouter);

app.post('/api/log', (req, res) => {
  const { level, message, context } = req.body;
  logger.info(`[${level}] [${context}] ${message}`);
  res.status(200).json({success: true});
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*',(req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  });
}

(async function startServer() {
  try {
    const success = await initDB();
    if (success) {
      app.listen(PORT, () => {
        logger.info(`Server is running on http://localhost:${PORT}`);
      });
    } else {
      logger.error('Failed to initialize database');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
})();