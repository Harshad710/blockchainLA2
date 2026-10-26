import { describe, it, expect } from 'vitest';
import { parseCSV, parseJSON, parseTable } from '../src/profiler/parsers.js';
import { ValidationError, ResourceLimitError } from '../src/errors.js';

describe('Parsers Module', () => {
  describe('parseCSV', () => {
    it('parses standard comma-separated CSV with headers', () => {
      const csv = 'id,name,age\n1,Alice,30\n2,Bob,25\n3,Charlie,35';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['id', 'name', 'age']);
      expect(result.rowCount).toBe(3);
      expect(result.columnCount).toBe(3);
      expect(result.rows[0]).toEqual(['1', 'Alice', '30']);
      expect(result.rows[1]).toEqual(['2', 'Bob', '25']);
    });

    it('auto-detects semicolon delimiter', () => {
      const csv = 'product;price;quantity\nWidget;19.99;100\nGadget;49.99;50';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['product', 'price', 'quantity']);
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual(['Widget', '19.99', '100']);
    });

    it('auto-detects tab delimiter (TSV)', () => {
      const tsv = 'colA\tcolB\nfoo\tbar\nbaz\tqux';
      const result = parseCSV(tsv);

      expect(result.headers).toEqual(['colA', 'colB']);
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual(['foo', 'bar']);
    });

    it('handles quoted fields and commas inside quotes', () => {
      const csv = 'id,address,city\n1,"123 Main St, Apt 4B",Seattle\n2,"456 Elm St",Austin';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['id', 'address', 'city']);
      expect(result.rows[0][1]).toBe('123 Main St, Apt 4B');
    });

    it('handles missing values and empty cells as null', () => {
      const csv = 'a,b,c\n1,,3\n4,5,';
      const result = parseCSV(csv);

      expect(result.rows[0]).toEqual(['1', null, '3']);
      expect(result.rows[1]).toEqual(['4', '5', null]);
    });

    it('deduplicates duplicate header names', () => {
      const csv = 'status,status,status\n1,2,3';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['status', 'status_1', 'status_2']);
    });

    it('throws ValidationError on empty CSV', () => {
      expect(() => parseCSV('   \n\n  ')).toThrow(ValidationError);
    });

    it('throws ResourceLimitError if content exceeds byte limit', () => {
      const largeContent = 'a,b\n1,2\n3,4';
      expect(() => parseCSV(largeContent, 5)).toThrow(ResourceLimitError);
    });
  });

  describe('parseJSON', () => {
    it('parses array of objects', () => {
      const json = JSON.stringify([
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ]);
      const result = parseJSON(json);

      expect(result.headers).toEqual(['id', 'name', 'active']);
      expect(result.rowCount).toBe(2);
      expect(result.columnCount).toBe(3);
      expect(result.rows[0]).toEqual(['1', 'Alice', 'true']);
    });

    it('handles objects with non-uniform keys by taking union of keys', () => {
      const json = JSON.stringify([
        { a: 1, b: 2 },
        { b: 3, c: 4 },
      ]);
      const result = parseJSON(json);

      expect(result.headers).toEqual(['a', 'b', 'c']);
      expect(result.rows[0]).toEqual(['1', '2', null]);
      expect(result.rows[1]).toEqual([null, '3', '4']);
    });

    it('parses columnar JSON format', () => {
      const json = JSON.stringify({
        col1: ['val1', 'val2', 'val3'],
        col2: [10, 20, 30],
      });
      const result = parseJSON(json);

      expect(result.headers).toEqual(['col1', 'col2']);
      expect(result.rowCount).toBe(3);
      expect(result.rows[1]).toEqual(['val2', '20']);
    });

    it('throws ValidationError on invalid JSON syntax', () => {
      expect(() => parseJSON('{ malformed json')).toThrow(ValidationError);
    });

    it('throws ValidationError on empty JSON array', () => {
      expect(() => parseJSON('[]')).toThrow(ValidationError);
    });
  });

  describe('parseTable auto-detection', () => {
    it('detects JSON when string starts with [', () => {
      const content = '[{"x": 10}]';
      const result = parseTable(content);
      expect(result.detectedFormat).toBe('json');
      expect(result.headers).toEqual(['x']);
    });

    it('detects CSV for comma separated text', () => {
      const content = 'col1,col2\n1,2';
      const result = parseTable(content);
      expect(result.detectedFormat).toBe('csv');
      expect(result.headers).toEqual(['col1', 'col2']);
    });
  });
});
