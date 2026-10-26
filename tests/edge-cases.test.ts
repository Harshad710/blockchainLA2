import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseCSV, parseJSON, parseTable } from '../src/profiler/parsers.js';
import { inferColumnType, inferValueType } from '../src/profiler/type-inference.js';
import { computeNumericStats } from '../src/profiler/stats.js';
import { profileDataset, preflightDataset } from '../src/profiler/engine.js';
import { LIMITS } from '../src/config.js';
import { ResourceLimitError } from '../src/errors.js';

describe('Advanced Edge-Case & Stress Testcases', () => {
  const app = createApp();

  describe('1. Unusual Delimiters & Escaping', () => {
    it('handles pipe-delimited data (|) correctly', () => {
      const pipeData = 'user_id|full_name|country\nU-01|John Doe|USA\nU-02|Jane Smith|Canada\n';
      const parsed = parseCSV(pipeData);
      expect(parsed.headers).toEqual(['user_id', 'full_name', 'country']);
      expect(parsed.rowCount).toBe(2);
      expect(parsed.rows[0]).toEqual(['U-01', 'John Doe', 'USA']);
    });

    it('handles escaped double quotes inside quoted fields ("")', () => {
      const csv = 'id,quote_text\n1,"She said, ""TablePulse is fast!"""\n2,"Normal text"';
      const parsed = parseCSV(csv);
      expect(parsed.rowCount).toBe(2);
      expect(parsed.rows[0][1]).toBe('She said, "TablePulse is fast!"');
    });

    it('handles mixed line breaks (CRLF \\r\\n and LF \\n)', () => {
      const csv = "col1,col2\r\nval1,val2\nval3,val4\r\n";
      const parsed = parseCSV(csv);
      expect(parsed.rowCount).toBe(2);
      expect(parsed.rows[0]).toEqual(['val1', 'val2']);
      expect(parsed.rows[1]).toEqual(['val3', 'val4']);
    });
  });

  describe('2. Internationalization & Unicode Characters', () => {
    it('accurately profiles datasets with multi-byte Unicode and emojis', () => {
      const csv = `id,city,greeting,emoji_rating
1,Tokyo (東京),こんにちは,⭐
2,München,Guten Tag,⭐⭐
3,São Paulo,Olá,⭐⭐⭐
`;
      const report = profileDataset(csv, { datasetName: 'unicode_test.csv' });
      expect(report.summary.rowCount).toBe(3);
      expect(report.summary.columnCount).toBe(4);

      const cityCol = report.columns.find((c) => c.name === 'city');
      expect(cityCol).toBeDefined();
      expect(cityCol?.inferredType).toBe('string');
      expect(cityCol?.distinctCount).toBe(3);
    });
  });

  describe('3. Zero Variance & Uniform Distribution Edge Cases', () => {
    it('handles column where every numeric value is identical without divide-by-zero', () => {
      const numbers = [42, 42, 42, 42, 42, 42, 42];
      const stats = computeNumericStats(numbers);

      expect(stats).not.toBeNull();
      if (!stats) return;

      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.mean).toBe(42);
      expect(stats.variance).toBe(0);
      expect(stats.stdDev).toBe(0);
      expect(stats.skewness).toBeNull();
      expect(stats.kurtosis).toBeNull();
      expect(stats.outliersCount).toBe(0);
    });

    it('triggers CONSTANT_VALUE warning for zero-variance columns in full profile', () => {
      const csv = `id,status,score\n1,active,100\n2,active,95\n3,active,80\n4,active,75\n`;
      const report = profileDataset(csv);

      const statusCol = report.columns.find((c) => c.name === 'status');
      expect(statusCol?.isConstant).toBe(true);

      const alert = report.alerts.find((a) => a.rule === 'CONSTANT_VALUE' && a.column === 'status');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('warning');
    });
  });

  describe('4. Extreme Outliers & Pareto/Skewed Distributions', () => {
    it('detects extreme outliers and calculates high skewness', () => {
      // 100 values near 10, plus extreme outliers
      const values: number[] = new Array(50).fill(10);
      values.push(1000, 5000); // extreme outliers

      const stats = computeNumericStats(values);
      expect(stats).not.toBeNull();
      if (!stats) return;

      expect(stats.outliersCount).toBe(2);
      expect(stats.skewness).not.toBeNull();
      expect(stats.skewness!).toBeGreaterThan(3.0); // heavily right-skewed
    });

    it('handles scientific notation numbers correctly in type inference and stats', () => {
      expect(inferValueType('1.5e-4')).toBe('float');
      expect(inferValueType('-3.2e8')).toBe('float');

      const csv = `id,scientific_val\n1,1.5e-4\n2,2.5e-4\n3,3.5e-4\n`;
      const report = profileDataset(csv);
      const col = report.columns.find((c) => c.name === 'scientific_val');
      expect(col?.inferredType).toBe('float');
      expect(col?.numericStats?.mean).toBeCloseTo(0.00025, 5);
    });
  });

  describe('5. Complex JSON & Columnar Edge Cases', () => {
    it('handles JSON with nested objects by serializing them cleanly', () => {
      const json = JSON.stringify([
        { id: 1, user: { name: 'Alice', role: 'admin' } },
        { id: 2, user: { name: 'Bob', role: 'member' } },
      ]);
      const report = profileDataset(json, { format: 'json' });
      expect(report.summary.rowCount).toBe(2);
      expect(report.summary.columnCount).toBe(2);
      expect(report.columns[1].inferredType).toBe('string');
    });

    it('handles columnar JSON where arrays have different lengths gracefully', () => {
      const json = JSON.stringify({
        colA: [1, 2, 3, 4],
        colB: ['x', 'y'], // shorter array
      });
      const parsed = parseJSON(json);
      expect(parsed.rowCount).toBe(4);
      expect(parsed.rows[2][1]).toBeNull(); // missing filled as null
      expect(parsed.rows[3][1]).toBeNull();
    });
  });

  describe('6. Empty Rows & Duplicate Detection', () => {
    it('flags completely empty rows interspersed in the middle of dataset', () => {
      const csv = `col1,col2\nval1,val2\n,\nval3,val4\n,\nval5,val6\n`;
      const report = profileDataset(csv);
      expect(report.summary.rowCount).toBe(5);
      expect(report.summary.emptyRowCount).toBe(2);
      expect(report.alerts.some((a) => a.rule === 'EMPTY_ROWS_FOUND')).toBe(true);
    });

    it('detects multiple duplicate rows and computes exact percentage', () => {
      const csv = `id,code\n1,A\n1,A\n1,A\n2,B\n`;
      const report = profileDataset(csv);
      expect(report.summary.rowCount).toBe(4);
      expect(report.summary.duplicateRowCount).toBe(2); // 2 extra copies
      expect(report.summary.duplicateRowPercentage).toBe(50);
      expect(report.alerts.some((a) => a.rule === 'HIGH_DUPLICATE_ROWS')).toBe(true);
    });
  });

  describe('7. API Boundary & Limit Enforcements', () => {
    it('handles raw text/csv in POST /api/v1/profile without JSON wrapper', async () => {
      const csvContent = 'sku,price,stock\nSKU-01,19.99,100\nSKU-02,29.99,50';
      const res = await request(app)
        .post('/api/v1/profile?name=raw_stream.csv')
        .set('Content-Type', 'text/csv')
        .send(csvContent);

      expect(res.status).toBe(200);
      expect(res.body.summary.name).toBe('raw_stream.csv');
      expect(res.body.summary.rowCount).toBe(2);
      expect(res.body.summary.columnCount).toBe(3);
    });

    it('rejects batch exceeding max batch limit of 10 datasets with 400', async () => {
      const datasets = [];
      for (let i = 0; i < 11; i++) {
        datasets.push({ datasetName: `ds_${i}.csv`, content: 'a,b\n1,2' });
      }

      const res = await request(app)
        .post('/api/v1/profile/batch')
        .send({ datasets });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error)).toContain('Batch cannot exceed 10 datasets');
    });

    it('rejects dataset exceeding row limit with 413 ResourceLimitError', () => {
      // Build dummy CSV with rows > MAX_ROWS (10,000)
      const header = 'id,value\n';
      const row = '1,test\n';
      // 10,001 rows
      const rows = row.repeat(LIMITS.MAX_ROWS + 1);
      const oversizedCsv = header + rows;

      expect(() => parseCSV(oversizedCsv)).toThrow(ResourceLimitError);
    });
  });
});
