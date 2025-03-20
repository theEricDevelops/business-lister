const API_URL = '/api/log';

export default class Logger {
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
    console.log(`Logger initialized for ${context}`);
  }

  private async sendToServer(level: string, message: string) {
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ level, message, context: this.context }),
      });
    } catch (err) {
      // Fallback to console if API call fails
      console.error('Failed to send log to server:', err);
    }
  }

  info(message: string): void {
    console.info(`[INFO] [${this.context}] ${message}`);
    this.sendToServer('INFO', message);
  }

  error(message: string, error?: Error): void {
    console.error(`[ERROR] [${this.context}] ${message}`);
    if (error) {
      console.error(error);
    }
    this.sendToServer('ERROR', error ? `${message}: ${error.message}` : message);
  }

  warning(message: string): void {
    console.warn(`[WARNING] [${this.context}] ${message}`);
    this.sendToServer('WARNING', message);
  }

  debug(message: string): void {
    console.debug(`[DEBUG] [${this.context}] ${message}`);
    this.sendToServer('DEBUG', message);
  }
}

// Factory function to create logger instances
export const createLogger = (context: string) => new Logger(context);