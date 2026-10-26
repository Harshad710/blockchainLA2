export type DataType =
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'url'
  | 'string'
  | 'empty';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface QualityAlert {
  id: string;
  column?: string;
  severity: AlertSeverity;
  rule: string;
  message: string;
  recommendation: string;
  metricValue?: number | string;
}

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  sum: number;
  variance: number;
  stdDev: number;
  median: number;
  q25: number;
  q75: number;
  iqr: number;
  skewness: number | null;
  kurtosis: number | null;
  zerosCount: number;
  zerosPercentage: number;
  negativesCount: number;
  negativesPercentage: number;
  outliersCount: number;
  outliersPercentage: number;
  histogram: {
    bucketMin: number;
    bucketMax: number;
    count: number;
  }[];
}

export interface StringStats {
  minLength: number;
  maxLength: number;
  avgLength: number;
  emptyStringsCount: number;
  whitespaceOnlyCount: number;
}

export interface FrequentValue {
  value: string;
  count: number;
  percentage: number;
}

export interface ColumnProfile {
  name: string;
  index: number;
  inferredType: DataType;
  totalCount: number;
  nullCount: number;
  nullPercentage: number;
  distinctCount: number;
  uniquenessRatio: number;
  isUnique: boolean;
  isConstant: boolean;
  numericStats?: NumericStats | null;
  stringStats?: StringStats | null;
  topValues: FrequentValue[];
  qualityScore: number;
  alerts: QualityAlert[];
}

export interface DatasetSummary {
  name: string;
  format: 'csv' | 'json';
  rowCount: number;
  columnCount: number;
  emptyRowCount: number;
  duplicateRowCount: number;
  duplicateRowPercentage: number;
  memoryBytes: number;
  qualityScore: number; // 0 to 100
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  typeCounts: Record<DataType, number>;
  totalAlerts: {
    critical: number;
    warning: number;
    info: number;
  };
}

export interface ProfileReport {
  version: string;
  timestamp: string;
  durationMs: number;
  summary: DatasetSummary;
  columns: ColumnProfile[];
  alerts: QualityAlert[];
  remediations: {
    title: string;
    description: string;
    suggestedAction: string;
    sqlSnippet?: string;
    pythonSnippet?: string;
  }[];
}

export interface PreflightReport {
  valid: boolean;
  format: 'csv' | 'json';
  estimatedRows: number;
  estimatedColumns: number;
  sizeBytes: number;
  columnNames: string[];
  issues: string[];
  readyForProfiling: boolean;
}

export interface BatchProfileResult {
  batchId: string;
  timestamp: string;
  totalDatasets: number;
  successfulCount: number;
  failedCount: number;
  durationMs: number;
  reports: Array<{
    datasetName: string;
    success: boolean;
    report?: ProfileReport;
    error?: string;
  }>;
}
