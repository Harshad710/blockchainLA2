/**
 * Safely serialize a value to JSON, replacing NaN/Infinity with null.
 */
export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) return null;
    }
    return val;
  });
}

/**
 * Recursively sanitize numeric values in an object tree.
 * Replaces NaN and Infinity with null.
 */
export function sanitizeNumericValues<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    return (Number.isFinite(obj) ? obj : null) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeNumericValues) as unknown as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeNumericValues(val);
    }
    return result as T;
  }
  return obj;
}
