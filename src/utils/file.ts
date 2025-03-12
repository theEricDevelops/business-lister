import fs from 'fs';
import path from 'path';
import { createLogger } from './logger';

const logger = createLogger('FileUtils');

/**
 * File utilities for common operations
 */
export function readJsonFile<T>(filePath: string): T {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    logger.debug(`Reading JSON file: ${absolutePath}`);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    logger.error(`Failed to read JSON file: ${filePath}`, error as Error);
    throw error;
  }
}

export function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    logger.debug(`Writing JSON file: ${absolutePath}`);
    
    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    logger.error(`Failed to write JSON file: ${filePath}`, error as Error);
    throw error;
  }
}

export function ensureDirectoryExists(dirPath: string): void {
  const absolutePath = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
    logger.debug(`Created directory: ${absolutePath}`);
  }
}
