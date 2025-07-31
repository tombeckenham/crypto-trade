/**
 * Object Pool Implementation for High-Performance Order Processing
 * 
 * This module implements a generic object pool pattern to minimize garbage collection
 * pressure during high-frequency trading simulations. By reusing order objects instead
 * of creating new ones, we can achieve:
 * 
 * - Reduced memory allocation overhead
 * - Minimal garbage collection pauses
 * - Consistent performance at high order rates (up to 200K orders/sec)
 * - Lower CPU usage from object creation/destruction
 */

import { CryptoOrder } from './trading.js';
import { nanoid } from 'nanoid';

/**
 * Generic object pool implementation
 * 
 * @template T - Type of objects to pool
 */
export class ObjectPool<T> {
  // Array of available objects ready for reuse
  private pool: T[] = [];
  // Factory function to create new objects when pool is empty
  private createFn: () => T;
  // Function to reset object state before returning to pool
  private resetFn: (obj: T) => void;
  // Maximum number of objects to keep in the pool
  private maxSize: number;

  /**
   * Creates a new object pool
   * 
   * @param createFn - Factory function to create new objects
   * @param resetFn - Function to reset object state for reuse
   * @param maxSize - Maximum pool size (default: 10000)
   */
  constructor(createFn: () => T, resetFn: (obj: T) => void, maxSize: number = 10000) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  /**
   * Acquires an object from the pool
   * 
   * @returns A reused object from the pool or a new one if pool is empty
   * 
   * Performance: O(1) when objects are available in pool
   */
  acquire(): T {
    // Reuse existing object if available
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    // Create new object if pool is empty
    return this.createFn();
  }

  /**
   * Returns an object to the pool for reuse
   * 
   * @param obj - Object to return to the pool
   * 
   * Objects are reset before being pooled to prevent data leaks.
   * Pool size is capped to prevent excessive memory usage.
   */
  release(obj: T): void {
    // Only pool if under maximum size limit
    if (this.pool.length < this.maxSize) {
      // Reset object state to prevent data leaks
      this.resetFn(obj);
      this.pool.push(obj);
    }
    // If pool is full, let object be garbage collected
  }

  /**
   * Gets the current number of objects in the pool
   * 
   * @returns Number of available objects
   * 
   * Useful for monitoring pool efficiency and memory usage
   */
  getPoolSize(): number {
    return this.pool.length;
  }

  /**
   * Pre-populates the pool with objects
   * 
   * @param count - Number of objects to pre-create
   * 
   * Pre-warming prevents object creation overhead during initial high-load periods
   */
  preWarm(count: number): void {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.createFn());
    }
  }
}

/**
 * Singleton order pool instance for the simulation server
 * 
 * Configured with:
 * - Factory function creating empty order objects
 * - Reset function clearing all order properties
 * - Large pool size (10K) to handle burst traffic
 */
export const orderPool = new ObjectPool<CryptoOrder>(
  // Factory function: creates new empty order object
  () => ({
    id: '',
    pair: '',
    side: 'buy',
    price: '0',
    amount: '0',
    type: 'limit',
    timestamp: 0,
    userId: '',
    status: 'pending',
    filledAmount: '0'
  }),
  // Reset function: clears all order properties for reuse
  (order) => {
    order.id = '';
    order.pair = '';
    order.side = 'buy';
    order.price = '0';
    order.amount = '0';
    order.type = 'limit';
    order.timestamp = 0;
    order.userId = '';
    order.status = 'pending';
    order.filledAmount = '0';
  },
  10000 // Large pool size to handle up to 200K orders/sec
);

// Pre-warm the pool with 5000 orders at startup
// This prevents allocation overhead during initial load spike
orderPool.preWarm(5000);

/**
 * Creates a new order using the object pool
 * 
 * @param pair - Trading pair (e.g., "BTC-USDT")
 * @param side - Order side ("buy" or "sell")
 * @param type - Order type ("market" or "limit")
 * @param price - Order price ("0" for market orders)
 * @param amount - Order quantity
 * @param userId - User identifier
 * @returns Configured order object from the pool
 * 
 * This function is the primary interface for creating orders in the simulation.
 * It ensures consistent object reuse and optimal performance.
 */
export function createPooledOrder(
  pair: string,
  side: 'buy' | 'sell',
  type: 'market' | 'limit',
  price: string,
  amount: string,
  userId: string
): CryptoOrder {
  // Get an order object from the pool
  const order = orderPool.acquire();

  // Configure the order with provided parameters
  order.id = nanoid(); // Generate unique order ID
  order.pair = pair;
  order.side = side;
  order.type = type;
  order.price = price.toString();
  order.amount = amount.toString();
  order.timestamp = Date.now();
  order.userId = userId;
  order.status = 'pending';
  order.filledAmount = '0';

  return order;
}

/**
 * Returns an order to the pool for reuse
 * 
 * @param order - Order object to release
 * 
 * IMPORTANT: Only call this after the order is no longer needed.
 * The order will be reset and may be reused immediately.
 */
export function releaseOrder(order: CryptoOrder): void {
  orderPool.release(order);
}