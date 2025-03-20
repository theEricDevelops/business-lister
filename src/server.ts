import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import businessRouter from './api/businesses';
import syncRouter from './api/sync';
import { getDatabase } from './services/database';
import Logger from './utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const logger = new Logger('server.log');
const db = getDatabase();

async function initializeDatabase() {
  try {
    logger.info(`Checking database tables...`);

    const businessesTableExists = await db.checkForTable('businesses');

    if (!businessesTableExists) {
      logger.warning(`Creating businesses table...`);
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS businesses (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          address VARCHAR(255) NOT NULL,
          city VARCHAR(255) NOT NULL,
          state VARCHAR(2) NOT NULL,
          zip VARCHAR(10) NOT NULL,
          phone VARCHAR(20) NOT NULL,
          website VARCHAR(255),
          email VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(name, address, city, state, zip, phone, website, email)
        )
      `);

      await db.query(`CREATE INDEX IF NOT EXISTS idx_businesses_zip ON businesses(zip)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses(name)`);

      logger.info(`Businesses table created.`);
    } else {
      logger.info(`Businesses table exists.`);
    }

    logger.info(`Database tables checked.`);
    return true;
  } catch (error) {
    logger.error(`Error initializing database: ${error.message}`);
    return false;
  }
}

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

initializeDatabase().then(success => {
  if (success) {
    app.listen(PORT, () => {
      logger.info(`API Server started on port ${PORT}`);
    });
  } else {
    logger.error('Database initialization failed.');
    process.exit(1);
  }
})