import {LogLevel} from '../types/logs';

const API_URL = '/api/log';

export class Logger {
  private category: string;
  private logEndpoint: string;

  constructor(category: string = 'App') {
    this.category = category;
    console.log(`Logger initialized for ${category}`);
    
    // Fix the URL issue by using an absolute URL when on server side
    this.logEndpoint = typeof window !== 'undefined' 
      ? '/api/log'  // Browser environment (relative URL is fine)
      : 'http://localhost:3000/api/log';  // Node.js environment needs absolute URL
  }

  private async sendToServer(level: LogLevel, message: string, data?: any) {
    try {
      // Skip sending to server in Node.js environment to avoid circular requests
      if (typeof window === 'undefined') {
        // Server-side: just console log
        const consoleMethod = level === 'error' ? console.error : 
                            level === 'warning' ? console.warn : console.log;
        consoleMethod(`[${level.toUpperCase()}] [${this.category}] ${message}`);
        return;
      }
      
      // Client-side: send to API
      await fetch(this.logEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level,
          category: this.category,
          message,
          data,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to send log to server:', error);
    }
  }

  info(message: string): void {
    console.info(`[INFO] [${this.category}] ${message}`);
    this.sendToServer('info', message);
  }

  error(message: string, error?: Error): void {
    console.error(`[ERROR] [${this.category}] ${message}`);
    if (error) {
      console.error(error);
    }
    this.sendToServer('error', error ? `${message}: ${error.message}` : message);
  }

  warning(message: string): void {
    console.warn(`[WARNING] [${this.category}] ${message}`);
    this.sendToServer('warning', message);
  }

  debug(message: string): void {
    console.debug(`[DEBUG] [${this.category}] ${message}`);
    this.sendToServer('debug', message);
  }
}

// Factory function to create logger instances
export const createLogger = (category: string) => new Logger(category);