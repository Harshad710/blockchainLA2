import { describe, it, expect } from 'vitest';
import { inferColumnType, inferValueType } from '../src/profiler/type-inference.js';

describe('Type Inference Module', () => {
  describe('inferValueType', () => {
    it('infers integer values', () => {
      expect(inferValueType('42')).toBe('integer');
      expect(inferValueType('-100')).toBe('integer');
      expect(inferValueType('0')).toBe('integer');
    });

    it('infers float values', () => {
      expect(inferValueType('3.14159')).toBe('float');
      expect(inferValueType('-0.05')).toBe('float');
      expect(inferValueType('1e-5')).toBe('float');
      expect(inferValueType('2.5e10')).toBe('float');
    });

    it('infers boolean values', () => {
      expect(inferValueType('true')).toBe('boolean');
      expect(inferValueType('false')).toBe('boolean');
      expect(inferValueType('yes')).toBe('boolean');
      expect(inferValueType('no')).toBe('boolean');
      expect(inferValueType('t')).toBe('boolean');
      expect(inferValueType('f')).toBe('boolean');
    });

    it('infers dates and datetimes', () => {
      expect(inferValueType('2024-01-15')).toBe('date');
      expect(inferValueType('2024-01-15T09:30:00Z')).toBe('datetime');
      expect(inferValueType('2024-01-15 09:30:00')).toBe('datetime');
    });

    it('infers emails and URLs', () => {
      expect(inferValueType('alice@company.com')).toBe('email');
      expect(inferValueType('bob.dev+tag@sub.example.org')).toBe('email');
      expect(inferValueType('https://x402.org')).toBe('url');
      expect(inferValueType('http://localhost:3000/api')).toBe('url');
    });

    it('returns empty for blank values', () => {
      expect(inferValueType('')).toBe('empty');
      expect(inferValueType('   ')).toBe('empty');
    });

    it('defaults to string for non-structured text', () => {
      expect(inferValueType('Hello world')).toBe('string');
      expect(inferValueType('INV-98234-A')).toBe('string');
    });
  });

  describe('inferColumnType', () => {
    it('infers integer column when all or most values are integers', () => {
      const col = ['1', '2', '3', '4', '5'];
      expect(inferColumnType(col)).toBe('integer');
    });

    it('infers float column when integers and floats are mixed', () => {
      const col = ['10', '20.5', '30', '40'];
      expect(inferColumnType(col)).toBe('float');
    });

    it('infers email column when threshold is satisfied', () => {
      const col = ['a@b.com', 'c@d.org', 'e@f.io', null];
      expect(inferColumnType(col)).toBe('email');
    });

    it('returns empty for completely null column', () => {
      const col = [null, null, '', '  '];
      expect(inferColumnType(col)).toBe('empty');
    });

    it('tolerates small amount of dirty values if majority matches threshold', () => {
      // 9 valid dates out of 10
      const col = [
        '2024-01-01',
        '2024-01-02',
        '2024-01-03',
        '2024-01-04',
        '2024-01-05',
        '2024-01-06',
        '2024-01-07',
        '2024-01-08',
        '2024-01-09',
        'N/A',
      ];
      expect(inferColumnType(col)).toBe('date');
    });
  });
});
