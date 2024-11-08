/**
 * Pauses the execution for the specified duration.
 * @param {number} ms - The duration to sleep in milliseconds.
 * @returns {Promise<void>} - A promise that resolves after the specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Splits an array into chunks of specified size.
 * @template T
 * @param {T[]} array - The array to split.
 * @param {number} chunkSize - The size of each chunk.
 * @returns {T[][]} - The array split into chunks.
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Asserts that a value is a number.
 * @param {number} value - The value to check.
 * @throws Will throw an error if the value is not a number.
 * @returns {number} - The value as a number.
 */
export function assertIsNumber(value: any): number {
  const shouldBeNum = parseInt(value, 10);
  if (isNaN(shouldBeNum)) {
    throw new Error(`invalid number: ${value}`);
  }
  return shouldBeNum;
}
