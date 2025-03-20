import fs from 'fs';

/**
 * Centralized logging utility
 */
// Set up logging
const logLevels: { [key: string]: number } = {
    INFO: 10,
    WARNING: 20,
    ERROR: 30,
    DEBUG: 0
};

export default class Logger {
    private logFilePath: string;
    private consoleOutput: number;

    constructor(logFilePath: string = 'app.log', consoleOutput: string | number = 'INFO') {
        this.logFilePath = 'logs/' + logFilePath;
        typeof(consoleOutput) === 'string' ? 
            this.consoleOutput = logLevels[consoleOutput] : 
            this.consoleOutput = consoleOutput;

        // Initialize log file with a header
        fs.writeFileSync(this.logFilePath, `--- Log started at ${new Date().toISOString()} ---\n`);
    }

    private getLevelName(level: number): string {
        for (const [name, value] of Object.entries(logLevels)) {
            if (value === level) return name;
        }
        return 'UNKNOWN';
    }

    private formatMessage(level: number, message: string): string {
        const timestamp = new Date().toISOString();
        const levelName = this.getLevelName(level);
        return `[${timestamp}] [${levelName}] ${message}`;
    }

    info(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.INFO, message);
        this.log(formattedMessage);
    }

    error(message: string, error?: Error): Error {
        let formattedMessage = this.formatMessage(logLevels.ERROR, message);
        if (error) {
            formattedMessage += `\n${error.stack || error.message}`;
        }
        this.log(formattedMessage);
        return Error(formattedMessage);
    }

    warning(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.WARNING, message);
        this.log(formattedMessage);
    }

    debug(message: string): void {
        const formattedMessage = this.formatMessage(logLevels.DEBUG, message);
        fs.appendFileSync(this.logFilePath, formattedMessage + '\n');
    }

    pageError(message: string, error?: Error): void {
        let formattedMessage = this.formatMessage(logLevels.ERROR, `PAGE ERROR: ${message}`);
        if (error) {
            formattedMessage += `\n${error.stack || error.message}`;
        }
        // Write directly to file without console output
        fs.appendFileSync(this.logFilePath, formattedMessage + '\n');
    }

    private log(message: string): void {
        const logLevel = typeof this.consoleOutput === 'string' ? 
            logLevels[this.consoleOutput] : this.consoleOutput;
            
        // Extract the level from the message for comparison
        // Format is [timestamp] [LEVEL] message...
        const levelMatch = message.match(/\[\d{4}-\d{2}-\d{2}.*?\] \[([A-Z]+)\]/);
        const messageLevel = levelMatch ? logLevels[levelMatch[1]] : logLevels.INFO;
        
        // Log to console if message level is >= configured console level
        if (messageLevel >= logLevel) {
            console.log(message);
        }
        fs.appendFileSync(this.logFilePath, message + '\n');
    }
}