import { DataType } from './types.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const BOOLEAN_VALUES = new Set(['true', 'false', 't', 'f', 'yes', 'no']);

/**
 * Determine the specific type of a single non-null string value.
 */
export function inferValueType(val: string): DataType {
  const trimmed = val.trim();
  if (trimmed === '') return 'empty';

  // Boolean check
  if (BOOLEAN_VALUES.has(trimmed.toLowerCase())) {
    return 'boolean';
  }

  // Integer check
  if (/^-?\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isSafeInteger(num)) {
      return 'integer';
    }
  }

  // Float check
  if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(trimmed) || /^-?\d+[eE][+-]?\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!isNaN(num) && isFinite(num)) {
      return 'float';
    }
  }

  // Email check
  if (EMAIL_REGEX.test(trimmed)) {
    return 'email';
  }

  // URL check
  if (URL_REGEX.test(trimmed)) {
    return 'url';
  }

  // Date check
  if (DATE_REGEX.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return 'date';
  }

  // Datetime check
  if (DATETIME_REGEX.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return 'datetime';
  }

  return 'string';
}

/**
 * Infer the predominant data type of a column across all non-null values.
 * Threshold: If >= 85% of non-null values conform to a type, assign that type.
 * If mixed integers and floats, classify as float.
 */
export function inferColumnType(values: (string | null)[]): DataType {
  const nonNulls = values.filter((v): v is string => v !== null && v.trim() !== '');
  if (nonNulls.length === 0) {
    return 'empty';
  }

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

  for (const val of nonNulls) {
    const t = inferValueType(val);
    typeCounts[t]++;
  }

  const total = nonNulls.length;

  // Check if purely numeric (mixed integer & float)
  const numericCount = typeCounts.integer + typeCounts.float;
  if (numericCount / total >= 0.85) {
    if (typeCounts.float > 0) {
      return 'float';
    }
    return 'integer';
  }

  // Check other specialized types with 85% threshold
  for (const t of ['boolean', 'date', 'datetime', 'email', 'url'] as DataType[]) {
    if (typeCounts[t] / total >= 0.85) {
      return t;
    }
  }

  return 'string';
}
