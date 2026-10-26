import { AlertSeverity, ColumnProfile, DataType, ProfileReport, QualityAlert } from './types.js';

let alertIdCounter = 1;
function nextAlertId(): string {
  return `ALT-${(alertIdCounter++).toString().padStart(4, '0')}`;
}

export function resetAlertIdCounter(): void {
  alertIdCounter = 1;
}

/**
 * Generate quality alerts for a single column.
 */
export function evaluateColumnQuality(
  colName: string,
  type: DataType,
  totalCount: number,
  nullCount: number,
  distinctCount: number,
  numericStats?: ColumnProfile['numericStats'],
  stringStats?: ColumnProfile['stringStats'],
): { alerts: QualityAlert[]; qualityScore: number } {
  const alerts: QualityAlert[] = [];
  let score = 100;

  const nullPct = totalCount > 0 ? (nullCount / totalCount) * 100 : 0;
  const nonNullCount = totalCount - nullCount;
  const uniquenessRatio = nonNullCount > 0 ? distinctCount / nonNullCount : 0;

  // 1. Null checks
  if (nullCount === totalCount) {
    alerts.push({
      id: nextAlertId(),
      column: colName,
      severity: 'critical',
      rule: 'EMPTY_COLUMN',
      message: `Column "${colName}" is 100% empty (contains no non-null values).`,
      recommendation: `Drop this unused column before storing or ingestion.`,
      metricValue: 100,
    });
    score -= 40;
  } else if (nullPct > 50) {
    alerts.push({
      id: nextAlertId(),
      column: colName,
      severity: 'critical',
      rule: 'HIGH_NULL_RATE',
      message: `Column "${colName}" has an excessive missing rate of ${nullPct.toFixed(1)}%.`,
      recommendation: `Investigate upstream data collection or consider imputation or dropping.`,
      metricValue: Math.round(nullPct * 10) / 10,
    });
    score -= 25;
  } else if (nullPct > 15) {
    alerts.push({
      id: nextAlertId(),
      column: colName,
      severity: 'warning',
      rule: 'MODERATE_NULL_RATE',
      message: `Column "${colName}" contains ${nullPct.toFixed(1)}% null values.`,
      recommendation: `Apply default value imputation or nullable constraints.`,
      metricValue: Math.round(nullPct * 10) / 10,
    });
    score -= 10;
  }

  // 2. Constant value check
  if (distinctCount === 1 && nonNullCount > 1) {
    alerts.push({
      id: nextAlertId(),
      column: colName,
      severity: 'warning',
      rule: 'CONSTANT_VALUE',
      message: `Column "${colName}" has zero variance — every row contains the exact same value.`,
      recommendation: `Constant columns add storage overhead without providing informational value. Consider omitting.`,
      metricValue: 1,
    });
    score -= 10;
  }

  // 3. High cardinality identifier check
  if (uniquenessRatio === 1.0 && nonNullCount >= 10 && !colName.toLowerCase().includes('id')) {
    alerts.push({
      id: nextAlertId(),
      column: colName,
      severity: 'info',
      rule: 'CANDIDATE_PRIMARY_KEY',
      message: `Column "${colName}" has 100% unique values across all ${nonNullCount} rows.`,
      recommendation: `This column is a candidate primary key or unique identifier.`,
      metricValue: 1.0,
    });
  }

  // 4. Numeric specific checks
  if (numericStats) {
    // Outliers check
    if (numericStats.outliersPercentage > 5) {
      alerts.push({
        id: nextAlertId(),
        column: colName,
        severity: 'warning',
        rule: 'NUMERIC_OUTLIERS',
        message: `Detected ${numericStats.outliersCount} statistical outliers (${numericStats.outliersPercentage}%) outside Tukey fences.`,
        recommendation: `Examine extreme values between [${numericStats.min}, ${numericStats.max}]. Consider winsorization or z-score filtering.`,
        metricValue: numericStats.outliersPercentage,
      });
      score -= Math.min(15, numericStats.outliersPercentage);
    }

    // Heavy skewness
    if (numericStats.skewness !== null && Math.abs(numericStats.skewness) > 2.0) {
      alerts.push({
        id: nextAlertId(),
        column: colName,
        severity: 'info',
        rule: 'HIGH_SKEWNESS',
        message: `Distribution is highly skewed (skewness = ${numericStats.skewness}).`,
        recommendation: `Consider applying log or Box-Cox transformations if used in linear machine learning models.`,
        metricValue: numericStats.skewness,
      });
    }

    // Negative values in typically non-negative columns
    const lowerName = colName.toLowerCase();
    const isTypicallyPositive =
      lowerName.includes('age') ||
      lowerName.includes('price') ||
      lowerName.includes('cost') ||
      lowerName.includes('amount') ||
      lowerName.includes('count') ||
      lowerName.includes('quantity') ||
      lowerName.includes('salary');

    if (isTypicallyPositive && numericStats.negativesCount > 0) {
      alerts.push({
        id: nextAlertId(),
        column: colName,
        severity: 'critical',
        rule: 'UNEXPECTED_NEGATIVE_VALUES',
        message: `Column "${colName}" appears to be a magnitude or quantity field but contains ${numericStats.negativesCount} negative values.`,
        recommendation: `Verify data entry pipeline. Enforce non-negative CHECK constraints.`,
        metricValue: numericStats.negativesCount,
      });
      score -= 15;
    }
  }

  // 5. String specific checks
  if (stringStats) {
    if (stringStats.whitespaceOnlyCount > 0) {
      alerts.push({
        id: nextAlertId(),
        column: colName,
        severity: 'warning',
        rule: 'WHITESPACE_ONLY_STRINGS',
        message: `Column "${colName}" contains ${stringStats.whitespaceOnlyCount} strings with only whitespace characters.`,
        recommendation: `Trim strings and replace whitespace-only entries with NULL during ingestion.`,
        metricValue: stringStats.whitespaceOnlyCount,
      });
      score -= 5;
    }
  }

  return {
    alerts,
    qualityScore: Math.max(0, Math.min(100, Math.round(score))),
  };
}

/**
 * Generate remediation suggestions based on dataset alerts.
 */
export function generateRemediations(
  datasetName: string,
  alerts: QualityAlert[],
  duplicateRowCount: number,
): ProfileReport['remediations'] {
  const remediations: ProfileReport['remediations'] = [];

  // Deduplication
  if (duplicateRowCount > 0) {
    remediations.push({
      title: 'Remove Duplicate Rows',
      description: `The dataset contains ${duplicateRowCount} fully duplicate rows that skew statistical aggregates and model weights.`,
      suggestedAction: 'Deduplicate rows using primary keys or distinct set operations.',
      sqlSnippet: `SELECT DISTINCT * FROM "${datasetName}";`,
      pythonSnippet: `df = df.drop_duplicates()`,
    });
  }

  // Null value handling
  const nullAlerts = alerts.filter(
    (a) => a.rule === 'HIGH_NULL_RATE' || a.rule === 'MODERATE_NULL_RATE',
  );
  if (nullAlerts.length > 0) {
    const colList = nullAlerts.map((a) => a.column).filter(Boolean);
    remediations.push({
      title: `Impute or Handle Missing Values in [${colList.join(', ')}]`,
      description: `${nullAlerts.length} columns exhibit elevated missing rates requiring imputation strategies.`,
      suggestedAction: 'For numeric columns use median/mean imputation; for categorical columns use mode or a sentinel value.',
      sqlSnippet: `UPDATE "${datasetName}" SET "${colList[0]}" = COALESCE("${colList[0]}", 0);`,
      pythonSnippet: `df['${colList[0]}'] = df['${colList[0]}'].fillna(df['${colList[0]}'].median())`,
    });
  }

  // Outliers handling
  const outlierAlerts = alerts.filter((a) => a.rule === 'NUMERIC_OUTLIERS');
  if (outlierAlerts.length > 0) {
    const colList = outlierAlerts.map((a) => a.column).filter(Boolean);
    remediations.push({
      title: `Filter or Cap Outliers in [${colList.join(', ')}]`,
      description: 'Outliers can distort mean, variance, and downstream ML training convergence.',
      suggestedAction: 'Clip values to 1st and 99th percentiles (Winsorization) or investigate data corruption.',
      sqlSnippet: `WITH bounds AS (\n  SELECT percentile_cont(0.01) WITHIN GROUP (ORDER BY "${colList[0]}") AS low,\n         percentile_cont(0.99) WITHIN GROUP (ORDER BY "${colList[0]}") AS high\n  FROM "${datasetName}"\n)\nSELECT * FROM "${datasetName}", bounds WHERE "${colList[0]}" BETWEEN low AND high;`,
      pythonSnippet: `q_low = df['${colList[0]}'].quantile(0.01)\nq_high = df['${colList[0]}'].quantile(0.99)\ndf['${colList[0]}'] = df['${colList[0]}'].clip(q_low, q_high)`,
    });
  }

  // Unused empty columns
  const emptyColAlerts = alerts.filter((a) => a.rule === 'EMPTY_COLUMN');
  if (emptyColAlerts.length > 0) {
    const colList = emptyColAlerts.map((a) => a.column).filter(Boolean);
    remediations.push({
      title: `Drop Dead Columns [${colList.join(', ')}]`,
      description: 'Columns that contain 100% missing values consume storage without analytical utility.',
      suggestedAction: 'Drop these columns from the schema definition.',
      sqlSnippet: colList.map((c) => `ALTER TABLE "${datasetName}" DROP COLUMN "${c}";`).join('\n'),
      pythonSnippet: `df = df.drop(columns=[${colList.map((c) => `'${c}'`).join(', ')}])`,
    });
  }

  return remediations;
}

/**
 * Assign letter grade based on overall quality score.
 */
export function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
