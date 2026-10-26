import { REPORT_VERSION } from '../config.js';
import { elapsedMs, utcNow } from '../utils/helpers.js';
import { sanitizeNumericValues } from '../utils/safe-json.js';
import { parseTable } from './parsers.js';
import { calculateGrade, evaluateColumnQuality, generateRemediations } from './quality.js';
import { computeNumericStats, computeStringStats, computeTopValues } from './stats.js';
import { inferColumnType } from './type-inference.js';
import {
  ColumnProfile,
  DataType,
  DatasetSummary,
  PreflightReport,
  ProfileReport,
  QualityAlert,
} from './types.js';

export interface ProfileOptions {
  datasetName?: string;
  format?: 'csv' | 'json';
  topNValues?: number;
}

/**
 * Preflight validation check on raw tabular dataset content.
 * Fast, lightweight verification before any payment or heavy processing.
 */
export function preflightDataset(
  content: string,
  format?: 'csv' | 'json',
): PreflightReport {
  const issues: string[] = [];

  try {
    const parsed = parseTable(content, format);

    if (parsed.rowCount === 0) {
      issues.push('Dataset contains zero data rows.');
    }

    if (parsed.columnCount === 0) {
      issues.push('Dataset contains zero columns.');
    }

    return {
      valid: issues.length === 0,
      format: parsed.detectedFormat,
      estimatedRows: parsed.rowCount,
      estimatedColumns: parsed.columnCount,
      sizeBytes: parsed.byteSize,
      columnNames: parsed.headers,
      issues,
      readyForProfiling: issues.length === 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push(msg);
    return {
      valid: false,
      format: format || 'csv',
      estimatedRows: 0,
      estimatedColumns: 0,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      columnNames: [],
      issues,
      readyForProfiling: false,
    };
  }
}

/**
 * Full profiling of tabular dataset content.
 */
export function profileDataset(
  content: string,
  options: ProfileOptions = {},
): ProfileReport {
  const startTime = process.hrtime();
  const datasetName = options.datasetName || 'dataset';
  const topN = options.topNValues || 10;

  // 1. Parse table
  const parsed = parseTable(content, options.format);
  const { headers, rows, rowCount, columnCount, byteSize } = parsed;

  // 2. Row-level checks: empty rows and duplicates
  let emptyRowCount = 0;
  const rowSignatures = new Map<string, number>();
  let duplicateRowCount = 0;

  for (const row of rows) {
    const isAllNull = row.every((c) => c === null || c === '');
    if (isAllNull) {
      emptyRowCount++;
    }

    const sig = row.map((c) => (c === null ? '\0' : c)).join('\x1f');
    const prev = rowSignatures.get(sig) || 0;
    if (prev > 0) {
      duplicateRowCount++;
    }
    rowSignatures.set(sig, prev + 1);
  }

  const duplicateRowPercentage =
    rowCount > 0 ? Math.round((duplicateRowCount / rowCount) * 10000) / 100 : 0;

  // 3. Column-by-column profiling
  const columns: ColumnProfile[] = [];
  const allAlerts: QualityAlert[] = [];
  const typeCounts: Record<DataType, number> = {
    integer: 0,
    float: 0,
    boolean: 0,
    date: 0,
    datetime: 0,
    email: 0,
    url: 0,
    string: 0,
    empty: 0,
  };

  let totalColumnScore = 0;

  for (let c = 0; c < columnCount; c++) {
    const colName = headers[c];
    const colValues = rows.map((r) => r[c]);
    const totalCount = colValues.length;

    // Null and distinct counts
    let nullCount = 0;
    const nonNullValues: string[] = [];
    const distinctSet = new Set<string>();

    for (const val of colValues) {
      if (val === null || val === '') {
        nullCount++;
      } else {
        nonNullValues.push(val);
        distinctSet.add(val);
      }
    }

    const distinctCount = distinctSet.size;
    const nullPercentage =
      totalCount > 0 ? Math.round((nullCount / totalCount) * 10000) / 100 : 0;
    const nonNullCount = nonNullValues.length;
    const uniquenessRatio =
      nonNullCount > 0 ? Math.round((distinctCount / nonNullCount) * 10000) / 10000 : 0;
    const isUnique = distinctCount === nonNullCount && nonNullCount > 0;
    const isConstant = distinctCount === 1 && nonNullCount > 1;

    // Type inference
    const inferredType = inferColumnType(colValues);
    typeCounts[inferredType] = (typeCounts[inferredType] || 0) + 1;

    // Numerical stats
    let numericStats: ColumnProfile['numericStats'] = null;
    if (inferredType === 'integer' || inferredType === 'float') {
      const numbers = nonNullValues
        .map((v) => Number(v))
        .filter((n) => !isNaN(n) && isFinite(n));
      numericStats = computeNumericStats(numbers);
    }

    // String stats
    let stringStats: ColumnProfile['stringStats'] = null;
    if (
      inferredType === 'string' ||
      inferredType === 'email' ||
      inferredType === 'url' ||
      inferredType === 'date' ||
      inferredType === 'datetime'
    ) {
      stringStats = computeStringStats(nonNullValues);
    }

    // Frequent values
    const topValues = computeTopValues(colValues, topN);

    // Quality alerts and column score
    const { alerts: colAlerts, qualityScore: colQualityScore } = evaluateColumnQuality(
      colName,
      inferredType,
      totalCount,
      nullCount,
      distinctCount,
      numericStats,
      stringStats,
    );

    totalColumnScore += colQualityScore;
    allAlerts.push(...colAlerts);

    columns.push({
      name: colName,
      index: c,
      inferredType,
      totalCount,
      nullCount,
      nullPercentage,
      distinctCount,
      uniquenessRatio,
      isUnique,
      isConstant,
      numericStats,
      stringStats,
      topValues,
      qualityScore: colQualityScore,
      alerts: colAlerts,
    });
  }

  // 4. Dataset-level quality evaluation
  const avgColScore = columnCount > 0 ? totalColumnScore / columnCount : 100;
  let datasetQualityScore = avgColScore;

  // Penalty for duplicate rows
  if (duplicateRowPercentage > 10) {
    datasetQualityScore -= 20;
    allAlerts.unshift({
      id: `ALT-ROW-DUP`,
      severity: 'critical',
      rule: 'HIGH_DUPLICATE_ROWS',
      message: `Dataset contains ${duplicateRowCount} duplicate rows (${duplicateRowPercentage}%).`,
      recommendation: `Run a deduplication pass before staging or querying.`,
      metricValue: duplicateRowPercentage,
    });
  } else if (duplicateRowCount > 0) {
    datasetQualityScore -= 8;
    allAlerts.unshift({
      id: `ALT-ROW-DUP`,
      severity: 'warning',
      rule: 'DUPLICATE_ROWS_PRESENT',
      message: `Dataset contains ${duplicateRowCount} duplicate rows.`,
      recommendation: `Verify whether repeated entries are intentional.`,
      metricValue: duplicateRowCount,
    });
  }

  // Penalty for empty rows
  if (emptyRowCount > 0) {
    datasetQualityScore -= 5;
    allAlerts.unshift({
      id: `ALT-ROW-EMPTY`,
      severity: 'info',
      rule: 'EMPTY_ROWS_FOUND',
      message: `Dataset contains ${emptyRowCount} completely empty rows.`,
      recommendation: `Strip trailing or accidental blank rows.`,
      metricValue: emptyRowCount,
    });
  }

  const finalQualityScore = Math.max(0, Math.min(100, Math.round(datasetQualityScore)));
  const qualityGrade = calculateGrade(finalQualityScore);

  // Group alerts count
  const totalAlerts = {
    critical: allAlerts.filter((a) => a.severity === 'critical').length,
    warning: allAlerts.filter((a) => a.severity === 'warning').length,
    info: allAlerts.filter((a) => a.severity === 'info').length,
  };

  const remediations = generateRemediations(datasetName, allAlerts, duplicateRowCount);

  const summary: DatasetSummary = {
    name: datasetName,
    format: parsed.detectedFormat,
    rowCount,
    columnCount,
    emptyRowCount,
    duplicateRowCount,
    duplicateRowPercentage,
    memoryBytes: byteSize,
    qualityScore: finalQualityScore,
    qualityGrade,
    typeCounts,
    totalAlerts,
  };

  const durationMs = elapsedMs(startTime);

  const rawReport: ProfileReport = {
    version: REPORT_VERSION,
    timestamp: utcNow(),
    durationMs,
    summary,
    columns,
    alerts: allAlerts,
    remediations,
  };

  return sanitizeNumericValues(rawReport);
}
