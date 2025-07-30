import { describe, it, expect, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import { OrderBook } from '../order-book';
import { MatchingEngine } from '../matching-engine';
import { RedBlackTree } from '../red-black-tree';
import { CryptoOrder, OrderSide } from '../../types/trading';

describe('Performance Tests', () => {
  describe('Red-Black Tree Performance', () => {
    let tree: RedBlackTree<number, string>;

    beforeEach(() => {
      tree = new RedBlackTree<number, string>((a, b) => a - b);
    });

    it('should handle 100K insertions in under 5 seconds', () => {
      const numInsertions = 100000;
      const startTime = Date.now();

      for (let i = 0; i < numInsertions; i++) {
        const key = Math.floor(Math.random() * numInsertions * 2);
        tree.insert(key, `value_${key}`);
      }

      const duration = Date.now() - startTime;
      console.log(`${numInsertions} insertions took ${duration}ms`);
      
      expect(duration).toBeLessThan(5000);
      expect(tree.getSize()).toBeGreaterThan(numInsertions * 0.8); // Allow for some duplicates
    });

    it('should handle 50K lookups in under 1 second', () => {
      // First populate the tree
      const numItems = 10000;
      const keys: number[] = [];
      
      for (let i = 0; i < numItems; i++) {
        const key = i * 2; // Use deterministic keys
        tree.insert(key, `value_${key}`);
        keys.push(key);
      }

      // Now perform lookups
      const numLookups = 50000;
      const startTime = Date.now();

      for (let i = 0; i < numLookups; i++) {
        const randomKey = keys[Math.floor(Math.random() * keys.length)]!;
        const result = tree.find(randomKey);
        expect(result).toBeDefined();
      }

      const duration = Date.now() - startTime;
      console.log(`${numLookups} lookups took ${duration}ms`);
      
      expect(duration).toBeLessThan(1000);
    });

    it('should handle mixed operations under load', () => {
      const operations = 50000;
      const startTime = Date.now();
      let insertCount = 0;
      let deleteCount = 0;
      let findCount = 0;

      for (let i = 0; i < operations; i++) {
        const operation = Math.random();
        const key = Math.floor(Math.random() * 10000);

        if (operation < 0.5) {
          // 50% insertions
          tree.insert(key, `value_${key}`);
          insertCount++;
        } else if (operation < 0.7) {
          // 20% deletions
          tree.remove(key);
          deleteCount++;
        } else {
          // 30% lookups
          tree.find(key);
          findCount++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Mixed operations (${insertCount} inserts, ${deleteCount} deletes, ${findCount} finds) took ${duration}ms`);
      
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('OrderBook Performance', () => {
    let orderBook: OrderBook;

    beforeEach(() => {
      orderBook = new OrderBook('BTC-USDT');
    });

    const createRandomOrder = (side?: OrderSide): CryptoOrder => ({
      id: faker.string.nanoid(),
      pair: 'BTC-USDT',
      side: side || (Math.random() < 0.5 ? 'buy' : 'sell'),
      price: Math.floor(Math.random() * 1000) + 49000, // 49000-50000 range
      amount: Math.random() * 10 + 0.1,
      type: 'limit',
      timestamp: Date.now(),
      userId: faker.string.uuid(),
      status: 'pending',
      filledAmount: 0
    });

    it('should handle 50K order insertions in under 3 seconds', () => {
      const numOrders = 50000;
      const startTime = Date.now();

      for (let i = 0; i < numOrders; i++) {
        const order = createRandomOrder();
        orderBook.addOrder(order);
      }

      const duration = Date.now() - startTime;
      console.log(`${numOrders} order insertions took ${duration}ms`);
      
      expect(duration).toBeLessThan(3000);
      expect(orderBook.getOrderCount()).toBe(numOrders);
    });

    it('should maintain fast best bid/ask lookups under load', () => {
      // First populate the order book
      const numOrders = 10000;
      for (let i = 0; i < numOrders; i++) {
        const order = createRandomOrder();
        orderBook.addOrder(order);
      }

      // Now perform many best bid/ask lookups
      const numLookups = 100000;
      const startTime = Date.now();

      for (let i = 0; i < numLookups; i++) {
        const bestBid = orderBook.getBestBid();
        const bestAsk = orderBook.getBestAsk();
        
        // These operations should still be very fast
        if (bestBid) expect(bestBid.price).toBeTypeOf('number');
        if (bestAsk) expect(bestAsk.price).toBeTypeOf('number');
      }

      const duration = Date.now() - startTime;
      console.log(`${numLookups} best bid/ask lookups took ${duration}ms`);
      
      expect(duration).toBeLessThan(500); // Should be very fast due to O(log n) complexity
    });

    it('should handle rapid order updates efficiently', () => {
      // Add orders first
      const orders: CryptoOrder[] = [];
      for (let i = 0; i < 5000; i++) {
        const order = createRandomOrder();
        orderBook.addOrder(order);
        orders.push(order);
      }

      // Now perform rapid updates
      const numUpdates = 20000;
      const startTime = Date.now();

      for (let i = 0; i < numUpdates; i++) {
        const randomOrder = orders[Math.floor(Math.random() * orders.length)]!;
        const fillAmount = Math.random() * randomOrder.amount * 0.5;
        orderBook.updateOrderAmount(randomOrder.id, fillAmount);
      }

      const duration = Date.now() - startTime;
      console.log(`${numUpdates} order updates took ${duration}ms`);
      
      expect(duration).toBeLessThan(2000);
    });

    it('should generate market depth quickly even with many levels', () => {
      // Create a deep order book
      const levelsPerSide = 1000;
      
      for (let i = 0; i < levelsPerSide; i++) {
        // Buy orders from 49000 down to 48001
        const buyOrder = createRandomOrder('buy');
        buyOrder.price = 49000 - i;
        orderBook.addOrder(buyOrder);

        // Sell orders from 50000 up to 50999
        const sellOrder = createRandomOrder('sell');
        sellOrder.price = 50000 + i;
        orderBook.addOrder(sellOrder);
      }

      // Test market depth generation speed
      const numDepthQueries = 1000;
      const startTime = Date.now();

      for (let i = 0; i < numDepthQueries; i++) {
        const depth = orderBook.getMarketDepth(50); // Get top 50 levels
        expect(depth.bids.length).toBeGreaterThan(0);
        expect(depth.asks.length).toBeGreaterThan(0);
      }

      const duration = Date.now() - startTime;
      console.log(`${numDepthQueries} market depth queries took ${duration}ms`);
      
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('MatchingEngine Performance', () => {
    let engine: MatchingEngine;

    beforeEach(() => {
      engine = new MatchingEngine();
    });

    const createRandomOrder = (pair: string = 'BTC-USDT'): CryptoOrder => ({
      id: faker.string.nanoid(),
      pair,
      side: Math.random() < 0.5 ? 'buy' : 'sell',
      price: Math.floor(Math.random() * 2000) + 49000, // 49000-51000 range
      amount: Math.random() * 5 + 0.1,
      type: 'limit',
      timestamp: Date.now(),
      userId: faker.string.uuid(),
      status: 'pending',
      filledAmount: 0
    });

    it('should handle high-frequency order submissions', () => {
      const numOrders = 25000;
      const startTime = Date.now();
      let tradesGenerated = 0;

      // Count trades for performance metrics
      engine.on('trade', () => {
        tradesGenerated++;
      });

      for (let i = 0; i < numOrders; i++) {
        const order = createRandomOrder();
        engine.submitOrder(order);
      }

      const duration = Date.now() - startTime;
      const ordersPerSecond = Math.floor(numOrders / (duration / 1000));
      
      console.log(`${numOrders} orders processed in ${duration}ms (${ordersPerSecond} orders/sec)`);
      console.log(`Generated ${tradesGenerated} trades`);
      
      expect(duration).toBeLessThan(5000);
      expect(ordersPerSecond).toBeGreaterThan(5000); // Should handle >5K orders per second
    });

    it('should handle market orders efficiently under heavy load', () => {
      // First create liquidity with limit orders
      const liquidityOrders = 10000;
      for (let i = 0; i < liquidityOrders; i++) {
        const order = createRandomOrder();
        engine.submitOrder(order);
      }

      // Now submit market orders that will consume liquidity
      const marketOrders = 5000;
      const startTime = Date.now();
      let tradesGenerated = 0;

      engine.on('trade', () => {
        tradesGenerated++;
      });

      for (let i = 0; i < marketOrders; i++) {
        const order = createRandomOrder();
        order.type = 'market';
        order.price = 0; // Market orders don't need price
        engine.submitOrder(order);
      }

      const duration = Date.now() - startTime;
      console.log(`${marketOrders} market orders processed in ${duration}ms`);
      console.log(`Generated ${tradesGenerated} trades from market orders`);
      
      expect(duration).toBeLessThan(3000);
    });

    it('should maintain performance with multiple trading pairs', () => {
      const pairs = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT'];
      const ordersPerPair = 5000;
      const totalOrders = pairs.length * ordersPerPair;
      
      const startTime = Date.now();
      let tradesGenerated = 0;

      engine.on('trade', () => {
        tradesGenerated++;
      });

      for (const pair of pairs) {
        for (let i = 0; i < ordersPerPair; i++) {
          const order = createRandomOrder(pair);
          engine.submitOrder(order);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`${totalOrders} orders across ${pairs.length} pairs processed in ${duration}ms`);
      console.log(`Generated ${tradesGenerated} trades`);
      console.log(`Supported pairs: ${engine.getSupportedPairs().join(', ')}`);
      
      expect(duration).toBeLessThan(8000);
      expect(engine.getSupportedPairs().length).toBe(pairs.length);
    });

    it('should handle rapid order cancellations efficiently', () => {
      // First add orders
      const numOrders = 10000;
      const orderIds: { id: string; pair: string }[] = [];

      for (let i = 0; i < numOrders; i++) {
        const order = createRandomOrder();
        engine.submitOrder(order);
        orderIds.push({ id: order.id, pair: order.pair });
      }

      // Now cancel half of them rapidly
      const numCancellations = Math.floor(numOrders / 2);
      const startTime = Date.now();
      let successfulCancellations = 0;

      for (let i = 0; i < numCancellations; i++) {
        const { id, pair } = orderIds[i]!;
        const cancelled = engine.cancelOrder(id, pair);
        if (cancelled) successfulCancellations++;
      }

      const duration = Date.now() - startTime;
      console.log(`${numCancellations} cancellation attempts took ${duration}ms`);
      console.log(`${successfulCancellations} successful cancellations`);
      
      expect(duration).toBeLessThan(2000);
      expect(successfulCancellations).toBeGreaterThan(numCancellations * 0.8); // Most should succeed
    });
  });

  describe('Memory Usage and Garbage Collection', () => {
    it('should maintain reasonable memory usage under sustained load', () => {
      const engine = new MatchingEngine();
      const initialMemory = process.memoryUsage();
      
      // Create sustained trading activity
      const iterations = 5;
      const ordersPerIteration = 10000;

      for (let iteration = 0; iteration < iterations; iteration++) {
        console.log(`Memory test iteration ${iteration + 1}/${iterations}`);
        
        const orders: CryptoOrder[] = [];
        
        // Add orders
        for (let i = 0; i < ordersPerIteration; i++) {
          const order: CryptoOrder = {
            id: faker.string.nanoid(),
            pair: 'BTC-USDT',
            side: Math.random() < 0.5 ? 'buy' : 'sell',
            price: Math.floor(Math.random() * 1000) + 49000,
            amount: Math.random() * 2 + 0.1,
            type: 'limit',
            timestamp: Date.now(),
            userId: faker.string.uuid(),
            status: 'pending',
            filledAmount: 0
          };
          
          engine.submitOrder(order);
          orders.push(order);
        }

        // Cancel half the orders to simulate realistic trading
        for (let i = 0; i < ordersPerIteration / 2; i++) {
          const order = orders[i]!;
          engine.cancelOrder(order.id, order.pair);
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
      
      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);
      console.log(`Final heap used: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      
      // Memory increase should be reasonable (less than 100MB for this load)
      expect(memoryIncreaseMB).toBeLessThan(100);
    });
  });

  describe('Latency Measurements', () => {
    it('should maintain sub-millisecond order processing latency', () => {
      const engine = new MatchingEngine();
      const numTests = 1000;
      const latencies: number[] = [];

      // Warm up
      for (let i = 0; i < 100; i++) {
        const order: CryptoOrder = {
          id: faker.string.nanoid(),
          pair: 'BTC-USDT',
          side: 'buy',
          price: 50000,
          amount: 1.0,
          type: 'limit',
          timestamp: Date.now(),
          userId: faker.string.uuid(),
          status: 'pending',
          filledAmount: 0
        };
        engine.submitOrder(order);
      }

      // Measure latencies
      for (let i = 0; i < numTests; i++) {
        const order: CryptoOrder = {
          id: faker.string.nanoid(),
          pair: 'BTC-USDT',
          side: Math.random() < 0.5 ? 'buy' : 'sell',
          price: Math.floor(Math.random() * 1000) + 49000,
          amount: Math.random() * 2 + 0.1,
          type: 'limit',
          timestamp: Date.now(),
          userId: faker.string.uuid(),
          status: 'pending',
          filledAmount: 0
        };

        const startTime = process.hrtime.bigint();
        engine.submitOrder(order);
        const endTime = process.hrtime.bigint();

        const latencyNs = Number(endTime - startTime);
        const latencyMs = latencyNs / 1_000_000;
        latencies.push(latencyMs);
      }

      // Calculate statistics
      latencies.sort((a, b) => a - b);
      const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
      const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
      const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
      const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
      const max = latencies[latencies.length - 1]!;

      console.log(`Latency statistics (${numTests} samples):`);
      console.log(`  Average: ${avg.toFixed(3)}ms`);
      console.log(`  P50: ${p50.toFixed(3)}ms`);
      console.log(`  P95: ${p95.toFixed(3)}ms`);
      console.log(`  P99: ${p99.toFixed(3)}ms`);
      console.log(`  Max: ${max.toFixed(3)}ms`);

      // Performance requirements from CLAUDE.md
      expect(avg).toBeLessThan(1.0); // Average < 1ms
      expect(p95).toBeLessThan(2.0); // 95th percentile < 2ms
      expect(p99).toBeLessThan(5.0); // 99th percentile < 5ms
    });
  });
});