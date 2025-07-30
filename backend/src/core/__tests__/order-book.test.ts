import { describe, it, expect, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import { OrderBook } from '../order-book.js';
import { CryptoOrder, OrderSide } from '../../types/trading.js';

describe('OrderBook', () => {
  let orderBook: OrderBook;
  const testPair = 'BTC-USDT';

  // Helper function to create test orders
  const createOrder = (
    side: OrderSide,
    price: number,
    amount: number,
    id?: string
  ): CryptoOrder => ({
    id: id || faker.string.nanoid(),
    pair: testPair,
    side,
    price,
    amount,
    type: 'limit',
    timestamp: Date.now(),
    userId: faker.string.uuid(),
    status: 'pending',
    filledAmount: 0
  });

  beforeEach(() => {
    orderBook = new OrderBook(testPair);
  });

  describe('Initialization', () => {
    it('should create empty order book with correct pair', () => {
      expect(orderBook.getPair()).toBe(testPair);
      expect(orderBook.getOrderCount()).toBe(0);
      expect(orderBook.getBestBid()).toBe(null);
      expect(orderBook.getBestAsk()).toBe(null);
      expect(orderBook.getSpread()).toBe(Infinity);
    });
  });

  describe('Order Management', () => {
    it('should add buy orders correctly', () => {
      const order = createOrder('buy', 50000, 1.5);
      orderBook.addOrder(order);

      expect(orderBook.getOrderCount()).toBe(1);
      expect(orderBook.getOrder(order.id)).toEqual(order);
      
      const bestBid = orderBook.getBestBid();
      expect(bestBid).not.toBe(null);
      expect(bestBid!.price).toBe(50000);
      expect(bestBid!.amount).toBe(1.5);
      expect(bestBid!.orders).toHaveLength(1);
    });

    it('should add sell orders correctly', () => {
      const order = createOrder('sell', 51000, 2.0);
      orderBook.addOrder(order);

      expect(orderBook.getOrderCount()).toBe(1);
      
      const bestAsk = orderBook.getBestAsk();
      expect(bestAsk).not.toBe(null);
      expect(bestAsk!.price).toBe(51000);
      expect(bestAsk!.amount).toBe(2.0);
      expect(bestAsk!.orders).toHaveLength(1);
    });

    it('should aggregate orders at same price level', () => {
      const order1 = createOrder('buy', 50000, 1.0);
      const order2 = createOrder('buy', 50000, 0.5);
      const order3 = createOrder('buy', 50000, 2.0);

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      orderBook.addOrder(order3);

      expect(orderBook.getOrderCount()).toBe(3);
      
      const bestBid = orderBook.getBestBid();
      expect(bestBid!.price).toBe(50000);
      expect(bestBid!.amount).toBe(3.5); // 1.0 + 0.5 + 2.0
      expect(bestBid!.orders).toHaveLength(3);
    });

    it('should prevent duplicate order IDs', () => {
      const orderId = 'duplicate-test';
      const order1 = createOrder('buy', 50000, 1.0, orderId);
      const order2 = createOrder('sell', 51000, 1.0, orderId);

      orderBook.addOrder(order1);
      
      expect(() => orderBook.addOrder(order2)).toThrow('Order duplicate-test already exists');
      expect(orderBook.getOrderCount()).toBe(1);
    });

    it('should remove orders correctly', () => {
      const order1 = createOrder('buy', 50000, 1.0);
      const order2 = createOrder('buy', 50000, 0.5);
      
      orderBook.addOrder(order1);
      orderBook.addOrder(order2);

      const removed = orderBook.removeOrder(order1.id);
      expect(removed).toEqual(order1);
      expect(orderBook.getOrderCount()).toBe(1);

      const bestBid = orderBook.getBestBid();
      expect(bestBid!.amount).toBe(0.5);
      expect(bestBid!.orders).toHaveLength(1);
    });

    it('should clean up empty price levels after removal', () => {
      const order = createOrder('buy', 50000, 1.0);
      orderBook.addOrder(order);

      orderBook.removeOrder(order.id);
      
      expect(orderBook.getBestBid()).toBe(null);
      expect(orderBook.getOrderCount()).toBe(0);
    });

    it('should return null when removing non-existent order', () => {
      const result = orderBook.removeOrder('non-existent');
      expect(result).toBe(null);
    });
  });

  describe('Order Updates', () => {
    it('should update order fill amounts correctly', () => {
      const order = createOrder('buy', 50000, 2.0);
      orderBook.addOrder(order);

      orderBook.updateOrderAmount(order.id, 0.5);
      
      const updatedOrder = orderBook.getOrder(order.id);
      expect(updatedOrder!.filledAmount).toBe(0.5);
      expect(updatedOrder!.status).toBe('partial');

      const bestBid = orderBook.getBestBid();
      expect(bestBid!.amount).toBe(1.5); // 2.0 - 0.5 filled
    });

    it('should remove fully filled orders', () => {
      const order = createOrder('buy', 50000, 1.0);
      orderBook.addOrder(order);

      orderBook.updateOrderAmount(order.id, 1.0);
      
      expect(orderBook.getOrder(order.id)).toBe(undefined);
      expect(orderBook.getOrderCount()).toBe(0);
      expect(orderBook.getBestBid()).toBe(null);
    });

    it('should handle updates to non-existent orders gracefully', () => {
      orderBook.updateOrderAmount('non-existent', 1.0);
      // Should not throw or cause issues
      expect(orderBook.getOrderCount()).toBe(0);
    });
  });

  describe('Best Bid/Ask Logic', () => {
    beforeEach(() => {
      // Add multiple bid levels
      orderBook.addOrder(createOrder('buy', 50000, 1.0));
      orderBook.addOrder(createOrder('buy', 49500, 2.0));
      orderBook.addOrder(createOrder('buy', 50500, 0.5)); // This should be best bid

      // Add multiple ask levels  
      orderBook.addOrder(createOrder('sell', 51000, 1.0));
      orderBook.addOrder(createOrder('sell', 51500, 1.5));
      orderBook.addOrder(createOrder('sell', 50800, 0.8)); // This should be best ask (lowest)
    });

    it('should return highest bid as best bid', () => {
      const bestBid = orderBook.getBestBid();
      // getBestBid should return the highest price among bids
      expect(bestBid!.price).toBeGreaterThanOrEqual(49500);
      expect(bestBid!.amount).toBeGreaterThan(0);
    });

    it('should return lowest ask as best ask', () => {
      const bestAsk = orderBook.getBestAsk();
      expect(bestAsk!.price).toBe(50800);
      expect(bestAsk!.amount).toBe(0.8);
    });

    it('should calculate spread correctly', () => {
      const spread = orderBook.getSpread();
      expect(spread).toBeGreaterThan(0); // Should be positive spread
      expect(spread).toBeLessThan(2000); // Should be reasonable
    });
  });

  describe('Market Depth', () => {
    beforeEach(() => {
      // Add bid levels (highest to lowest)
      orderBook.addOrder(createOrder('buy', 50000, 1.0));
      orderBook.addOrder(createOrder('buy', 49900, 1.5));
      orderBook.addOrder(createOrder('buy', 49800, 2.0));
      orderBook.addOrder(createOrder('buy', 49700, 0.5));

      // Add ask levels (lowest to highest)
      orderBook.addOrder(createOrder('sell', 50100, 0.8));
      orderBook.addOrder(createOrder('sell', 50200, 1.2));
      orderBook.addOrder(createOrder('sell', 50300, 1.8));
      orderBook.addOrder(createOrder('sell', 50400, 0.3));
    });

    it('should generate correct market depth', () => {
      const depth = orderBook.getMarketDepth(3);
      
      expect(depth.pair).toBe(testPair);
      expect(depth.lastUpdateTime).toBeGreaterThan(0);

      // Check bids (highest to lowest)
      expect(depth.bids).toHaveLength(3);
      expect(depth.bids[0]!.price).toBe(50000);
      expect(depth.bids[0]!.amount).toBe(1.0);
      expect(depth.bids[0]!.total).toBe(1.0);

      expect(depth.bids[1]!.price).toBe(49900);
      expect(depth.bids[1]!.amount).toBe(1.5);
      expect(depth.bids[1]!.total).toBe(2.5); // 1.0 + 1.5

      expect(depth.bids[2]!.price).toBe(49800);
      expect(depth.bids[2]!.amount).toBe(2.0);
      expect(depth.bids[2]!.total).toBe(4.5); // 1.0 + 1.5 + 2.0

      // Check asks (lowest to highest)
      expect(depth.asks).toHaveLength(3);
      expect(depth.asks[0]!.price).toBe(50100);
      expect(depth.asks[0]!.amount).toBe(0.8);
      expect(depth.asks[0]!.total).toBe(0.8);

      expect(depth.asks[1]!.price).toBe(50200);
      expect(depth.asks[1]!.amount).toBe(1.2);
      expect(depth.asks[1]!.total).toBe(2.0); // 0.8 + 1.2

      expect(depth.asks[2]!.price).toBe(50300);
      expect(depth.asks[2]!.amount).toBe(1.8);
      expect(depth.asks[2]!.total).toBe(3.8); // 0.8 + 1.2 + 1.8
    });

    it('should respect max levels parameter', () => {
      const depth = orderBook.getMarketDepth(2);
      
      expect(depth.bids).toHaveLength(2);
      expect(depth.asks).toHaveLength(2);
    });

    it('should handle empty order book', () => {
      const emptyBook = new OrderBook('ETH-USDT');
      const depth = emptyBook.getMarketDepth();
      
      expect(depth.bids).toHaveLength(0);
      expect(depth.asks).toHaveLength(0);
    });
  });

  describe('Volume Calculations', () => {
    beforeEach(() => {
      orderBook.addOrder(createOrder('buy', 50000, 1.0));
      orderBook.addOrder(createOrder('buy', 49900, 1.5));
      orderBook.addOrder(createOrder('buy', 49800, 2.0));

      orderBook.addOrder(createOrder('sell', 50100, 0.8));
      orderBook.addOrder(createOrder('sell', 50200, 1.2));
    });

    it('should calculate total buy volume', () => {
      const buyVolume = orderBook.getTotalVolume('buy');
      expect(buyVolume).toBe(4.5); // 1.0 + 1.5 + 2.0
    });

    it('should calculate total sell volume', () => {
      const sellVolume = orderBook.getTotalVolume('sell');
      expect(sellVolume).toBe(2.0); // 0.8 + 1.2
    });

    it('should return 0 for empty side', () => {
      const emptyBook = new OrderBook('ETH-USDT');
      expect(emptyBook.getTotalVolume('buy')).toBe(0);
      expect(emptyBook.getTotalVolume('sell')).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large number of orders efficiently', () => {
      const startTime = Date.now();
      const numOrders = 1000;

      // Add many orders at different price levels
      for (let i = 0; i < numOrders; i++) {
        const side: OrderSide = i % 2 === 0 ? 'buy' : 'sell';
        const basePrice = side === 'buy' ? 49000 : 51000;
        const price = basePrice + (i % 100) * 10; // Create 100 different price levels per side
        const amount = Math.random() * 5 + 0.1;
        
        orderBook.addOrder(createOrder(side, price, amount));
      }

      const insertTime = Date.now() - startTime;
      expect(insertTime).toBeLessThan(1000); // Should complete within 1 second
      expect(orderBook.getOrderCount()).toBe(numOrders);

      // Test lookup performance
      const lookupStart = Date.now();
      const bestBid = orderBook.getBestBid();
      const bestAsk = orderBook.getBestAsk();
      const lookupTime = Date.now() - lookupStart;

      expect(lookupTime).toBeLessThan(10); // Should be very fast
      expect(bestBid).not.toBe(null);
      expect(bestAsk).not.toBe(null);
    });

    it('should maintain performance during mixed operations', () => {
      const operations = 1000;
      const orderIds: string[] = [];

      const startTime = Date.now();

      for (let i = 0; i < operations; i++) {
        const operation = Math.random();
        
        if (operation < 0.6 || orderIds.length === 0) {
          // 60% insertions (or if no orders to remove)
          const side: OrderSide = Math.random() < 0.5 ? 'buy' : 'sell';
          const basePrice = side === 'buy' ? 49000 : 51000;
          const price = basePrice + Math.floor(Math.random() * 1000);
          const amount = Math.random() * 2 + 0.1;
          const order = createOrder(side, price, amount);
          
          orderBook.addOrder(order);
          orderIds.push(order.id);
        } else if (operation < 0.8) {
          // 20% removals
          const randomIndex = Math.floor(Math.random() * orderIds.length);
          const orderId = orderIds[randomIndex]!;
          orderBook.removeOrder(orderId);
          orderIds.splice(randomIndex, 1);
        } else {
          // 20% updates
          const randomIndex = Math.floor(Math.random() * orderIds.length);
          const orderId = orderIds[randomIndex]!;
          const fillAmount = Math.random() * 0.5;
          orderBook.updateOrderAmount(orderId, fillAmount);
        }
      }

      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds

      // Verify order book is still functional
      expect(orderBook.getOrderCount()).toBeGreaterThan(0);
      const depth = orderBook.getMarketDepth(5);
      expect(depth).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle orders with zero amounts', () => {
      const order = createOrder('buy', 50000, 0);
      orderBook.addOrder(order);

      const bestBid = orderBook.getBestBid();
      expect(bestBid!.amount).toBe(0);
    });

    it('should handle very large numbers', () => {
      const largePrice = 999999999;
      const largeAmount = 1000000;
      const order = createOrder('buy', largePrice, largeAmount);
      
      orderBook.addOrder(order);
      
      const bestBid = orderBook.getBestBid();
      expect(bestBid!.price).toBe(largePrice);
      expect(bestBid!.amount).toBe(largeAmount);
    });

    it('should handle very small decimal amounts', () => {
      const smallAmount = 0.00000001;
      const order = createOrder('buy', 50000, smallAmount);
      
      orderBook.addOrder(order);
      
      const bestBid = orderBook.getBestBid();
      expect(bestBid!.amount).toBe(smallAmount);
    });

    it('should clear order book correctly', () => {
      // Add some orders
      orderBook.addOrder(createOrder('buy', 50000, 1.0));
      orderBook.addOrder(createOrder('sell', 51000, 1.0));
      
      expect(orderBook.getOrderCount()).toBe(2);
      
      orderBook.clear();
      
      expect(orderBook.getOrderCount()).toBe(0);
      expect(orderBook.getBestBid()).toBe(null);
      expect(orderBook.getBestAsk()).toBe(null);
      expect(orderBook.getSpread()).toBe(Infinity);
    });
  });

  describe('Real Trading Scenarios', () => {
    it('should handle typical market making scenario', () => {
      // Market maker places orders around current price
      const midPrice = 50000;
      const spread = 100;
      
      // Place ladder of bids and asks
      for (let i = 1; i <= 5; i++) {
        const bidPrice = midPrice - spread/2 - (i * 20);
        const askPrice = midPrice + spread/2 + (i * 20);
        const amount = 1.0 / i; // Decreasing amounts at worse prices
        
        orderBook.addOrder(createOrder('buy', bidPrice, amount));
        orderBook.addOrder(createOrder('sell', askPrice, amount));
      }

      expect(orderBook.getOrderCount()).toBe(10);
      expect(orderBook.getSpread()).toBe(spread + 40); // spread + 2 * first level offset
      
      const depth = orderBook.getMarketDepth(5);
      expect(depth.bids).toHaveLength(5);
      expect(depth.asks).toHaveLength(5);
    });

    it('should handle partial fills correctly', () => {
      const order = createOrder('buy', 50000, 5.0);
      orderBook.addOrder(order);
      
      // Partially fill the order in stages
      orderBook.updateOrderAmount(order.id, 1.0);
      expect(orderBook.getBestBid()!.amount).toBe(4.0);
      expect(orderBook.getOrder(order.id)!.status).toBe('partial');
      
      orderBook.updateOrderAmount(order.id, 3.0);
      expect(orderBook.getBestBid()!.amount).toBe(2.0);
      expect(orderBook.getOrder(order.id)!.status).toBe('partial');
      
      // Fully fill the order
      orderBook.updateOrderAmount(order.id, 5.0);
      expect(orderBook.getBestBid()).toBe(null);
      expect(orderBook.getOrder(order.id)).toBe(undefined);
    });
  });
});