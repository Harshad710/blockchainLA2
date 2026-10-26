import { describe, it, expect } from 'vitest';
import { computeNumericStats, computeStringStats, computeTopValues } from '../src/profiler/stats.js';
import { evaluateColumnQuality, calculateGrade, generateRemediations } from '../src/profiler/quality.js';
import { profileDataset, preflightDataset } from '../src/profiler/engine.js';

describe('Stats & Quality Module', () => {
  describe('computeNumericStats', () => {
    it('computes basic descriptive statistics correctly', () => {
      const nums = [1, 2, 3, 4, 5];
      const stats = computeNumericStats(nums);

      expect(stats).not.toBeNull();
      if (!stats) return;

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.sum).toBe(15);
      expect(stats.mean).toBe(3);
      expect(stats.median).toBe(3);
      expect(stats.variance).toBe(2.5);
      expect(stats.stdDev).toBeCloseTo(1.5811, 2);
    });

    it('identifies outliers using Tukey fences', () => {
      // 10, 11, 12, 10, 11, 12, 10, 11, 500 (outlier)
      const data = [10, 11, 12, 10, 11, 12, 10, 11, 500];
      const stats = computeNumericStats(data);

      expect(stats).not.toBeNull();
      if (!stats) return;

      expect(stats.outliersCount).toBe(1);
      expect(stats.outliersPercentage).toBeGreaterThan(0);
    });

    it('generates a 10-bucket histogram', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = computeNumericStats(data);

      expect(stats?.histogram.length).toBe(10);
      const totalCount = stats?.histogram.reduce((acc, b) => acc + b.count, 0);
      expect(totalCount).toBe(10);
    });

    it('handles single number array gracefully', () => {
      const stats = computeNumericStats([42]);
      expect(stats?.min).toBe(42);
      expect(stats?.max).toBe(42);
      expect(stats?.mean).toBe(42);
      expect(stats?.stdDev).toBe(0);
      expect(stats?.skewness).toBeNull();
    });
  });

  describe('computeStringStats', () => {
    it('computes length metrics and whitespace counts', () => {
      const strings = ['apple', 'banana', 'kiwi', '', '   '];
      const stats = computeStringStats(strings);

      expect(stats.minLength).toBe(0);
      expect(stats.maxLength).toBe(6);
      expect(stats.emptyStringsCount).toBe(1);
      expect(stats.whitespaceOnlyCount).toBe(1);
    });
  });

  describe('computeTopValues', () => {
    it('computes top frequent values and percentages', () => {
      const values = ['A', 'A', 'A', 'B', 'B', 'C', null];
      const top = computeTopValues(values, 3);

      expect(top[0]).toEqual({ value: 'A', count: 3, percentage: 42.86 });
      expect(top[1]).toEqual({ value: 'B', count: 2, percentage: 28.57 });
    });
  });

  describe('evaluateColumnQuality & Alerts', () => {
    it('flags high null rate as critical', () => {
      const { alerts, qualityScore } = evaluateColumnQuality(
        'missing_col',
        'string',
        100,
        80, // 80% null
        10,
      );

      const highNullAlert = alerts.find((a) => a.rule === 'HIGH_NULL_RATE');
      expect(highNullAlert).toBeDefined();
      expect(highNullAlert?.severity).toBe('critical');
      expect(qualityScore).toBeLessThan(80);
    });

    it('flags constant column as warning', () => {
      const { alerts } = evaluateColumnQuality('status', 'string', 100, 0, 1);
      const constAlert = alerts.find((a) => a.rule === 'CONSTANT_VALUE');
      expect(constAlert).toBeDefined();
      expect(constAlert?.severity).toBe('warning');
    });

    it('flags negative values in price column as critical', () => {
      const numStats = computeNumericStats([-10, 20, 30]);
      const { alerts } = evaluateColumnQuality('unit_price', 'float', 3, 0, 3, numStats);
      const negAlert = alerts.find((a) => a.rule === 'UNEXPECTED_NEGATIVE_VALUES');
      expect(negAlert).toBeDefined();
      expect(negAlert?.severity).toBe('critical');
    });
  });

  describe('calculateGrade', () => {
    it('maps quality scores to appropriate letter grades', () => {
      expect(calculateGrade(95)).toBe('A');
      expect(calculateGrade(85)).toBe('B');
      expect(calculateGrade(75)).toBe('C');
      expect(calculateGrade(65)).toBe('D');
      expect(calculateGrade(40)).toBe('F');
    });
  });

  describe('generateRemediations', () => {
    it('generates deduplication advice when duplicate rows are present', () => {
      const remediations = generateRemediations('orders', [], 5);
      expect(remediations.some((r) => r.title.includes('Duplicate'))).toBe(true);
      expect(remediations[0].sqlSnippet).toContain('SELECT DISTINCT');
      expect(remediations[0].pythonSnippet).toContain('drop_duplicates');
    });
  });

  describe('profileDataset end-to-end', () => {
    it('profiles dirty CSV dataset and detects duplicates, nulls, and outliers', () => {
      const csv = `id,price,status\n1,10.0,active\n2,20.0,active\n3,-5.0,active\n3,-5.0,active\n4,,inactive\n`;
      const report = profileDataset(csv, { datasetName: 'test_table' });

      expect(report.summary.rowCount).toBe(5);
      expect(report.summary.columnCount).toBe(3);
      expect(report.summary.duplicateRowCount).toBe(1);
      expect(report.columns.length).toBe(3);

      const priceCol = report.columns.find((c) => c.name === 'price');
      expect(priceCol?.nullCount).toBe(1);
      expect(priceCol?.numericStats?.negativesCount).toBe(2);

      // Verify no NaNs or Infinities in serialized output
      const json = JSON.stringify(report);
      expect(json).not.toContain('NaN');
      expect(json).not.toContain('Infinity');
    });
  });

  describe('preflightDataset', () => {
    it('validates good dataset quickly', () => {
      const res = preflightDataset('a,b,c\n1,2,3');
      expect(res.valid).toBe(true);
      expect(res.readyForProfiling).toBe(true);
      expect(res.estimatedRows).toBe(1);
      expect(res.estimatedColumns).toBe(3);
    });

    it('rejects corrupt syntax in preflight', () => {
      const res = preflightDataset('{"broken json');
      expect(res.valid).toBe(false);
      expect(res.readyForProfiling).toBe(false);
      expect(res.issues.length).toBeGreaterThan(0);
    });
  });
});
