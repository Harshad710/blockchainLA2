import { parse as parseCsvSync } from 'csv-parse/sync';
import { LIMITS } from '../config.js';
import { ValidationError, ResourceLimitError } from '../errors.js';
import { utf8ByteLength } from '../utils/helpers.js';

export interface ParsedTable {
  headers: string[];
  rows: (string | null)[][];
  rowCount: number;
  columnCount: number;
  byteSize: number;
}

/**
 * Detect delimiter for CSV string from first few lines.
 */
function detectDelimiter(sample: string): string {
  const candidates = [',', ';', '\t', '|'];
  const lines = sample.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  if (lines.length === 0) return ',';

  let bestDelim = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = lines.map((line) => line.split(delim).length - 1);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    // Check if count is consistent across rows and > 0
    const variance = counts.reduce((acc, c) => acc + Math.pow(c - avg, 2), 0) / counts.length;
    if (avg > 0 && variance === 0 && avg > bestScore) {
      bestScore = avg;
      bestDelim = delim;
    } else if (avg > bestScore && variance < 1) {
      bestScore = avg;
      bestDelim = delim;
    }
  }

  return bestDelim;
}

/**
 * Parse CSV content string into tabular structure.
 */
export function parseCSV(content: string, maxBytes = LIMITS.MAX_DATASET_CONTENT_BYTES): ParsedTable {
  const byteSize = utf8ByteLength(content);
  if (byteSize > maxBytes) {
    throw new ResourceLimitError(
      `Dataset size (${(byteSize / 1024).toFixed(1)} KB) exceeds maximum limit (${maxBytes / 1024} KB)`,
    );
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new ValidationError('CSV content is empty');
  }

  const delimiter = detectDelimiter(trimmed.slice(0, 2048));

  let rawRecords: string[][];
  try {
    rawRecords = parseCsvSync(trimmed, {
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as string[][];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Failed to parse CSV: ${msg}`);
  }

  if (rawRecords.length === 0) {
    throw new ValidationError('CSV contains no data rows');
  }

  // First row is headers
  let headers = rawRecords[0].map((h, i) => (h ? h.trim() : `column_${i + 1}`));
  // Ensure header names are unique
  const seenNames = new Map<string, number>();
  headers = headers.map((h) => {
    const count = seenNames.get(h) || 0;
    seenNames.set(h, count + 1);
    return count > 0 ? `${h}_${count}` : h;
  });

  const columnCount = headers.length;
  if (columnCount > LIMITS.MAX_COLUMNS) {
    throw new ResourceLimitError(
      `Column count (${columnCount}) exceeds limit of ${LIMITS.MAX_COLUMNS}`,
    );
  }

  const dataRows = rawRecords.slice(1);
  if (dataRows.length > LIMITS.MAX_ROWS) {
    throw new ResourceLimitError(
      `Row count (${dataRows.length}) exceeds limit of ${LIMITS.MAX_ROWS}`,
    );
  }

  // Normalize rows to match column count
  const rows: (string | null)[][] = dataRows.map((row) => {
    const normalized: (string | null)[] = [];
    for (let i = 0; i < columnCount; i++) {
      const val = row[i];
      if (val === undefined || val === null || val === '') {
        normalized.push(null);
      } else {
        normalized.push(val);
      }
    }
    return normalized;
  });

  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount,
    byteSize,
  };
}

/**
 * Parse JSON content string (array of objects or object of arrays) into tabular structure.
 */
export function parseJSON(content: string, maxBytes = LIMITS.MAX_DATASET_CONTENT_BYTES): ParsedTable {
  const byteSize = utf8ByteLength(content);
  if (byteSize > maxBytes) {
    throw new ResourceLimitError(
      `Dataset size (${(byteSize / 1024).toFixed(1)} KB) exceeds maximum limit (${maxBytes / 1024} KB)`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Invalid JSON syntax: ${msg}`);
  }

  if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
    throw new ValidationError('JSON must be an array of objects or an object of arrays');
  }

  // Case 1: Array of objects [{ col1: val1, col2: val2 }, ...]
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new ValidationError('JSON array is empty');
    }

    if (parsed.length > LIMITS.MAX_ROWS) {
      throw new ResourceLimitError(`Row count (${parsed.length}) exceeds limit of ${LIMITS.MAX_ROWS}`);
    }

    // Collect all unique keys from all rows (preserving order of appearance)
    const headerSet = new Set<string>();
    for (const item of parsed) {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach((k) => headerSet.add(k));
      }
    }

    const headers = Array.from(headerSet);
    if (headers.length === 0) {
      throw new ValidationError('No valid object fields found in JSON array');
    }

    if (headers.length > LIMITS.MAX_COLUMNS) {
      throw new ResourceLimitError(`Column count (${headers.length}) exceeds limit of ${LIMITS.MAX_COLUMNS}`);
    }

    const rows: (string | null)[][] = parsed.map((item) => {
      const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return headers.map((h) => {
        const val = obj[h];
        if (val === undefined || val === null) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      });
    });

    return {
      headers,
      rows,
      rowCount: rows.length,
      columnCount: headers.length,
      byteSize,
    };
  }

  // Case 2: Columnar object { col1: [v1, v2], col2: [v1, v2] }
  const obj = parsed as Record<string, unknown>;
  const headers = Object.keys(obj);
  if (headers.length === 0) {
    throw new ValidationError('JSON object has no properties');
  }

  if (headers.length > LIMITS.MAX_COLUMNS) {
    throw new ResourceLimitError(`Column count (${headers.length}) exceeds limit of ${LIMITS.MAX_COLUMNS}`);
  }

  // Find max length of arrays
  let maxLen = 0;
  for (const h of headers) {
    const arr = obj[h];
    if (!Array.isArray(arr)) {
      throw new ValidationError(`Column "${h}" in columnar JSON must be an array`);
    }
    maxLen = Math.max(maxLen, arr.length);
  }

  if (maxLen > LIMITS.MAX_ROWS) {
    throw new ResourceLimitError(`Row count (${maxLen}) exceeds limit of ${LIMITS.MAX_ROWS}`);
  }

  const rows: (string | null)[][] = [];
  for (let r = 0; r < maxLen; r++) {
    const row: (string | null)[] = [];
    for (const h of headers) {
      const arr = obj[h] as unknown[];
      const val = arr[r];
      if (val === undefined || val === null) {
        row.push(null);
      } else if (typeof val === 'object') {
        row.push(JSON.stringify(val));
      } else {
        row.push(String(val));
      }
    }
    rows.push(row);
  }

  return {
    headers,
    rows,
    rowCount: maxLen,
    columnCount: headers.length,
    byteSize,
  };
}

/**
 * Universal table parser that detects format or uses explicit format.
 */
export function parseTable(
  content: string,
  format?: 'csv' | 'json',
  maxBytes = LIMITS.MAX_DATASET_CONTENT_BYTES,
): ParsedTable & { detectedFormat: 'csv' | 'json' } {
  const trimmed = content.trim();
  let selectedFormat: 'csv' | 'json';

  if (format) {
    selectedFormat = format;
  } else {
    // Detect by inspection
    if (trimmed.startsWith('[') || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      selectedFormat = 'json';
    } else {
      selectedFormat = 'csv';
    }
  }

  if (selectedFormat === 'json') {
    const parsed = parseJSON(content, maxBytes);
    return { ...parsed, detectedFormat: 'json' };
  } else {
    const parsed = parseCSV(content, maxBytes);
    return { ...parsed, detectedFormat: 'csv' };
  }
}
