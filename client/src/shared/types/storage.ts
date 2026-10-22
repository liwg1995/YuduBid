export type StorageUsageGroupId = 'protected' | 'legacy' | 'temporary';
export type StorageCleanGroupId = Exclude<StorageUsageGroupId, 'protected'>;

export interface StorageUsageItem {
  id: string;
  label: string;
  description: string;
  bytes: number;
}

export interface StorageUsageGroup {
  id: StorageUsageGroupId;
  label: string;
  description: string;
  bytes: number;
  items: StorageUsageItem[];
}

export interface StorageUsage {
  groups: StorageUsageGroup[];
  totalBytes: number;
  scannedAt: string;
}

export interface StorageCleanResult {
  freedBytes: number;
  /** 被占用或无权限而未删除的条目数。 */
  failedCount: number;
  /** 因相关任务运行中而整体跳过的清理项。 */
  skipped: Array<{ label: string; reason: string }>;
  usage: StorageUsage;
}
