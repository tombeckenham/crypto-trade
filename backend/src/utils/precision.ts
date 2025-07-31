/**
 * Utility functions for handling cryptocurrency precision without forcing decimal places
 */
import BigNumber from "bignumber.js";

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

  // Ensure that if the string becomes empty (e.g., from 0.000), it returns "0"
  if (str === '') {
    return '0';
  }

  return str;
}

/**
 * Adds two string numbers while preserving precision
 */
export function addStrings(a: string, b: string): string {
  // Potentially could do this more efficiently but ok for now
  const numA = new BigNumber(a);
  const numB = new BigNumber(b);
  const result = numA.plus(numB);
  return result.toString();
}

/**
 * Subtracts two string numbers while preserving precision
 */
export function subtractStrings(a: string, b: string): string {
  // Potentially could do this more efficiently but ok for now
  const numA = new BigNumber(a);
  const numB = new BigNumber(b);
  const result = numA.minus(numB);
  return result.toString();
}

/**
 * Multiplies two string numbers while preserving precision
 */
export function multiplyStrings(a: string, b: string): string {
  // Potentially could do this more efficiently but ok for now
  const numA = new BigNumber(a);
  const numB = new BigNumber(b);
  const result = numA.multipliedBy(numB);
  return result.toString();
}