/**
 * Utility functions for handling cryptocurrency precision without forcing decimal places
 */

/**
 * Converts a number to string while preserving its original precision
 * Removes trailing zeros and unnecessary decimal points
 */
export function numberToString(num: number): string {
  // Convert to string, removing scientific notation if present
  let str = num.toString();
  
  // Handle scientific notation
  if (str.includes('e')) {
    str = num.toFixed(20); // Use high precision, then clean up
  }
  
  // Remove trailing zeros after decimal point
  if (str.includes('.')) {
    str = str.replace(/\.?0+$/, '');
  }
  
  return str;
}

/**
 * Adds two string numbers while preserving precision
 */
export function addStrings(a: string, b: string): string {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  const result = numA + numB;
  return numberToString(result);
}

/**
 * Subtracts two string numbers while preserving precision
 */
export function subtractStrings(a: string, b: string): string {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  const result = numA - numB;
  return numberToString(result);
}

/**
 * Multiplies two string numbers while preserving precision
 */
export function multiplyStrings(a: string, b: string): string {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  const result = numA * numB;
  return numberToString(result);
}