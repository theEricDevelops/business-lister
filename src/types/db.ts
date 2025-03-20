export interface SyncProgress {
    processed: number;
    total: number;
    currentZipCode: string;
    completedZipCodes: number;
    totalZipCodes: number;
    inProgress: boolean;
}