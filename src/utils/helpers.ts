/**
 * Calculate the UTF-8 byte length of a string.
 */
export function utf8ByteLength(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}

/**
 * Generate a UTC ISO timestamp.
 */
export function utcNow(): string {
  return new Date().toISOString();
}

/**
 * Measure elapsed time in milliseconds since a start time.
 */
export function elapsedMs(startHrTime: [number, number]): number {
  const diff = process.hrtime(startHrTime);
  return Math.round(diff[0] * 1000 + diff[1] / 1_000_000);
}
