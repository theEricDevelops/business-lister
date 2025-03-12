// filepath: src/services/queue.ts
import PgBoss from 'pg-boss';
import config from '../config';

// Use your existing database connection string
const connectionString = `postgres://${config.db.user}:${config.db.password}@${config.db.host}:${config.db.port}/${config.db.database}`;

export class JobQueue {
  private boss: PgBoss;
  private static instance: JobQueue;
  
  private constructor() {
    this.boss = new PgBoss(connectionString);
  }
  
  static getInstance(): JobQueue {
    if (!JobQueue.instance) {
      JobQueue.instance = new JobQueue();
    }
    return JobQueue.instance;
  }
  
  async start(): Promise<void> {
    await this.boss.start();
    console.log('Job queue started');
  }
  
  async stop(): Promise<void> {
    await this.boss.stop();
    console.log('Job queue stopped');
  }
  
  async addJob<T>(queue: string, data: T, options?: any): Promise<string> {
    return this.boss.send(queue, data, options);
  }
  
  async processJobs<T, R>(queue: string, handler: (job: {data: T}) => Promise<R>): Promise<void> {
    this.boss.work(queue, handler);
  }
}