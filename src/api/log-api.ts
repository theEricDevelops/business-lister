import express from 'express';
import Logger from '../utils/logger';

const router = express.Router();
const logger = new Logger('api-logs.log');

router.post('/log', (req, res) => {
  const { level, message, error } = req.body;
  
  switch(level) {
    case 'info':
      logger.info(message);
      break;
    case 'error':
      logger.error(message, error);
      break;
    case 'warning':
      logger.warning(message);
      break;
    case 'debug':
      logger.debug(message);
      break;
    default:
      logger.info(message);
  }
  
  res.status(200).json({ success: true });
});

export default router;