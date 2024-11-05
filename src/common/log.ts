import './env';
import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = pino({
  level: LOG_LEVEL,   // Set the log level, e.g., 'info', 'error', 'debug'
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss o'
    }
  }
});

export default logger;
