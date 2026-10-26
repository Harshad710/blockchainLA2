import { FrequentValue, NumericStats, StringStats } from './types.js';

/**
 * Calculate percentile from sorted numbers using linear interpolation.
 */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}

/**
 * Compute numeric statistics for an array of numbers.
 */
export function computeNumericStats(rawNumbers: number[]): NumericStats | null {
  const numbers = rawNumbers.filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return null;

  const n = numbers.length;
  let min = numbers[0];
  let max = numbers[0];
  let sum = 0;
  let zerosCount = 0;
  let negativesCount = 0;

  for (const val of numbers) {
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
    if (val === 0) zerosCount++;
    if (val < 0) negativesCount++;
  }

  const mean = sum / n;

  // Variance & higher moments
  let varSum = 0;
  let m3Sum = 0;
  let m4Sum = 0;

  for (const val of numbers) {
    const diff = val - mean;
    varSum += diff * diff;
    m3Sum += diff * diff * diff;
    m4Sum += diff * diff * diff * diff;
  }

  const variance = n > 1 ? varSum / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  // Skewness and kurtosis
  let skewness: number | null = null;
  let kurtosis: number | null = null;

  if (n > 2 && stdDev > 0) {
    // Fisher-Pearson coefficient of skewness
    skewness = (m3Sum / n) / Math.pow(stdDev, 3);
    // Excess kurtosis (relative to normal distribution = 0)
    kurtosis = (m4Sum / n) / Math.pow(stdDev, 4) - 3;
  }

  // Quantiles
  const sorted = [...numbers].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const q25 = quantile(sorted, 0.25);
  const q75 = quantile(sorted, 0.75);
  const iqr = q75 - q25;

  // Outliers based on Tukey's fences: [Q1 - 1.5 * IQR, Q3 + 1.5 * IQR]
  const lowerFence = q25 - 1.5 * iqr;
  const upperFence = q75 + 1.5 * iqr;
  let outliersCount = 0;

  for (const val of numbers) {
    if (val < lowerFence || val > upperFence) {
      outliersCount++;
    }
  }

  // 10-bucket histogram
  const bucketCount = 10;
  const histogram: NumericStats['histogram'] = [];
  const range = max - min;

  if (range === 0 || bucketCount <= 1) {
    histogram.push({ bucketMin: min, bucketMax: max, count: n });
  } else {
    const step = range / bucketCount;
    const counts = new Array(bucketCount).fill(0);

    for (const val of numbers) {
      let bIdx = Math.floor((val - min) / step);
      if (bIdx >= bucketCount) bIdx = bucketCount - 1;
      counts[bIdx]++;
    }

    for (let i = 0; i < bucketCount; i++) {
      const bMin = min + i * step;
      const bMax = i === bucketCount - 1 ? max : min + (i + 1) * step;
      histogram.push({
        bucketMin: Math.round(bMin * 1000) / 1000,
        bucketMax: Math.round(bMax * 1000) / 1000,
        count: counts[i],
      });
    }
  }

  const roundStat = (val: number): number => {
    if (val === 0 || !Number.isFinite(val)) return val;
    if (Math.abs(val) < 0.001) {
      return parseFloat(val.toPrecision(6));
    }
    return Math.round(val * 10000) / 10000;
  };

  return {
    min: roundStat(min),
    max: roundStat(max),
    mean: roundStat(mean),
    sum: roundStat(sum),
    variance: roundStat(variance),
    stdDev: roundStat(stdDev),
    median: roundStat(median),
    q25: roundStat(q25),
    q75: roundStat(q75),
    iqr: roundStat(iqr),
    skewness: skewness !== null ? roundStat(skewness) : null,
    kurtosis: kurtosis !== null ? roundStat(kurtosis) : null,
    zerosCount,
    zerosPercentage: Math.round((zerosCount / n) * 10000) / 100,
    negativesCount,
    negativesPercentage: Math.round((negativesCount / n) * 10000) / 100,
    outliersCount,
    outliersPercentage: Math.round((outliersCount / n) * 10000) / 100,
    histogram,
  };
}

/**
 * Compute string length metrics.
 */
export function computeStringStats(rawStrings: string[]): StringStats {
  if (rawStrings.length === 0) {
    return {
      minLength: 0,
      maxLength: 0,
      avgLength: 0,
      emptyStringsCount: 0,
      whitespaceOnlyCount: 0,
    };
  }

  let minLength = rawStrings[0].length;
  let maxLength = rawStrings[0].length;
  let totalLength = 0;
  let emptyStringsCount = 0;
  let whitespaceOnlyCount = 0;

  for (const s of rawStrings) {
    const len = s.length;
    if (len < minLength) minLength = len;
    if (len > maxLength) maxLength = len;
    totalLength += len;

    if (len === 0) {
      emptyStringsCount++;
    } else if (s.trim().length === 0) {
      whitespaceOnlyCount++;
    }
  }

  return {
    minLength,
    maxLength,
    avgLength: Math.round((totalLength / rawStrings.length) * 100) / 100,
    emptyStringsCount,
    whitespaceOnlyCount,
  };
}

/**
 * Compute top N frequent values in a column.
 */
export function computeTopValues(values: (string | null)[], topN = 10): FrequentValue[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const val of values) {
    const key = val === null ? '(null)' : val;
    counts.set(key, (counts.get(key) || 0) + 1);
    total++;
  }

  if (total === 0) return [];

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  return sorted.map(([value, count]) => ({
    value,
    count,
    percentage: Math.round((count / total) * 10000) / 100,
  }));
}
