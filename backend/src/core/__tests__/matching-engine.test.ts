import { describe, it, expect, beforeEach, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { MatchingEngine } from '../matching-engine';
import { CryptoOrder, CryptoTrade, OrderSide } from '../../types/trading';

describe('MatchingEngine', () => {
  let engine: MatchingEngine;
  const testPair = 'BTC-USDT';

  // Helper function to create test orders
  const createOrder = (
    side: OrderSide,
    price: number,
    amount: number,
    type: 'market' | 'limit' = 'limit',
    id?: string
  ): CryptoOrder => ({
    id: id || faker.string.nanoid(),
    pair: testPair,
    side,
    price,
    amount,
    type,
    timestamp: Date.now(),
    userId: faker.string.uuid(),
    status: 'pending',
    filledAmount: 0
  });

  beforeEach(() => {
    engine = new MatchingEngine(0.001, 0.002); // 0.1% maker fee, 0.2% taker fee
  });

  describe('Initialization', () => {
    it('should create engine with default fee rates', () => {
      const defaultEngine = new MatchingEngine();
      expect(defaultEngine).toBeDefined();
    });

    it('should create engine with custom fee rates', () => {
      const customEngine = new MatchingEngine(0.0005, 0.001);
      expect(customEngine).toBeDefined();
    });

    it('should return empty supported pairs initially', () => {
      expect(engine.getSupportedPairs()).toEqual([]);
    });
  });

  describe('Order Book Management', () => {
    it('should create order book for new pair', () => {
      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook).toBeDefined();
      expect(orderBook.getPair()).toBe(testPair);
      expect(engine.getSupportedPairs()).toContain(testPair);
    });

    it('should reuse existing order book for same pair', () => {
      const orderBook1 = engine.getOrderBook(testPair);
      const orderBook2 = engine.getOrderBook(testPair);
      expect(orderBook1).toBe(orderBook2);
    });

    it('should provide market depth', () => {
      // Add some orders to create depth
      engine.submitOrder(createOrder('buy', 50000, 1.0));
      engine.submitOrder(createOrder('sell', 51000, 1.0));

      const depth = engine.getMarketDepth(testPair, 5);
      expect(depth).toBeDefined();
      expect(depth.pair).toBe(testPair);
      expect(depth.bids.length).toBeGreaterThan(0);
      expect(depth.asks.length).toBeGreaterThan(0);
    });

    it('should provide order book statistics', () => {
      engine.submitOrder(createOrder('buy', 50000, 1.0));
      engine.submitOrder(createOrder('sell', 51000, 1.0));

      const stats = engine.getOrderBookStats(testPair);
      expect(stats.pair).toBe(testPair);
      expect(stats.bestBid).toBeDefined();
      expect(stats.bestAsk).toBeDefined();
      expect(stats.spread).toBe(1000);
      expect(stats.bidVolume).toBe(1.0);
      expect(stats.askVolume).toBe(1.0);
      expect(stats.orderCount).toBe(2);
    });
  });

  describe('Limit Order Processing', () => {
    it('should add limit order to book when no match', () => {
      const buyOrder = createOrder('buy', 50000, 1.0);

      engine.submitOrder(buyOrder);

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getOrderCount()).toBe(1);
      expect(orderBook.getBestBid()!.price).toBe(50000);
    });

    it('should emit orderUpdate event for new limit order', () => {
      const orderUpdateSpy = vi.fn();
      engine.on('orderUpdate', orderUpdateSpy);

      const order = createOrder('buy', 50000, 1.0);
      engine.submitOrder(order);

      expect(orderUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: order.id,
          status: 'pending'
        })
      );
    });

    it('should match limit orders when prices cross', () => {
      const tradeSpy = vi.fn();
      const orderUpdateSpy = vi.fn();

      engine.on('trade', tradeSpy);
      engine.on('orderUpdate', orderUpdateSpy);

      // Add a sell order first
      const sellOrder = createOrder('sell', 50000, 1.0);
      engine.submitOrder(sellOrder);

      // Add a buy order that matches
      const buyOrder = createOrder('buy', 50000, 0.5);
      engine.submitOrder(buyOrder);

      // Should generate a trade
      expect(tradeSpy).toHaveBeenCalledTimes(1);
      const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;

      expect(trade.pair).toBe(testPair);
      expect(trade.price).toBe(50000);
      expect(trade.amount).toBe(0.5);
      expect(trade.volume).toBe(25000); // 50000 * 0.5
      expect(trade.takerSide).toBe('buy');
      expect(trade.makerFee).toBe(25); // 25000 * 0.001
      expect(trade.takerFee).toBe(50); // 25000 * 0.002

      // Both orders should be updated
      expect(orderUpdateSpy).toHaveBeenCalledTimes(4); // 2 for initial placement, 2 for matching
    });

    it('should partially fill orders when amounts dont match exactly', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      // Large sell order
      const sellOrder = createOrder('sell', 50000, 2.0);
      engine.submitOrder(sellOrder);

      // Smaller buy order
      const buyOrder = createOrder('buy', 50000, 0.8);
      engine.submitOrder(buyOrder);

      expect(tradeSpy).toHaveBeenCalledTimes(1);

      const orderBook = engine.getOrderBook(testPair);
      const bestAsk = orderBook.getBestAsk();

      // Sell order should be partially filled
      expect(bestAsk!.amount).toBe(1.2); // 2.0 - 0.8
      expect(orderBook.getOrder(buyOrder.id)).toBe(undefined); // Buy order fully filled
    });

    it('should match multiple orders at same price level', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      // Add multiple small sell orders at same price
      engine.submitOrder(createOrder('sell', 50000, 0.3, 'limit', 'sell1'));
      engine.submitOrder(createOrder('sell', 50000, 0.2, 'limit', 'sell2'));
      engine.submitOrder(createOrder('sell', 50000, 0.5, 'limit', 'sell3'));

      // Large buy order that matches all
      const buyOrder = createOrder('buy', 50000, 0.8);
      engine.submitOrder(buyOrder);

      // Should generate multiple trades
      expect(tradeSpy).toHaveBeenCalledTimes(3);

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getBestAsk()!.amount).toBeCloseTo(0.2, 10); // Handle floating point precision
    });

    it('should not match when prices dont cross', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      engine.submitOrder(createOrder('sell', 51000, 1.0));
      engine.submitOrder(createOrder('buy', 50000, 1.0));

      expect(tradeSpy).not.toHaveBeenCalled();

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getOrderCount()).toBe(2);
      expect(orderBook.getSpread()).toBe(1000);
    });
  });

  describe('Market Order Processing', () => {
    beforeEach(() => {
      // Set up a basic order book with liquidity
      engine.submitOrder(createOrder('sell', 50100, 0.5));
      engine.submitOrder(createOrder('sell', 50200, 1.0));
      engine.submitOrder(createOrder('sell', 50300, 1.5));

      engine.submitOrder(createOrder('buy', 49900, 0.8));
      engine.submitOrder(createOrder('buy', 49800, 1.2));
      engine.submitOrder(createOrder('buy', 49700, 2.0));
    });

    it('should execute market buy order against best asks', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      const marketBuy = createOrder('buy', 0, 0.7, 'market'); // Price ignored for market orders
      engine.submitOrder(marketBuy);

      expect(tradeSpy).toHaveBeenCalledTimes(1);

      const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;
      expect(trade.price).toBe(50100); // Should match against best ask
      expect(trade.amount).toBe(0.7);
      expect(trade.takerSide).toBe('buy');
    });

    it('should execute market sell order against best bids', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      const marketSell = createOrder('sell', 0, 0.6, 'market');
      engine.submitOrder(marketSell);

      expect(tradeSpy).toHaveBeenCalledTimes(1);

      const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;
      expect(trade.price).toBe(49900); // Should match against best bid
      expect(trade.amount).toBe(0.6);
      expect(trade.takerSide).toBe('sell');
    });

    it('should walk through price levels for large market orders', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      // Market buy that exceeds first level
      const marketBuy = createOrder('buy', 0, 1.2, 'market');
      engine.submitOrder(marketBuy);

      expect(tradeSpy).toHaveBeenCalledTimes(2);

      // First trade at 50100 for 0.5
      const trade1 = tradeSpy.mock.calls[0]![0] as CryptoTrade;
      expect(trade1.price).toBe(50100);
      expect(trade1.amount).toBe(0.5);

      // Second trade at 50200 for 0.7 (remaining)
      const trade2 = tradeSpy.mock.calls[1]![0] as CryptoTrade;
      expect(trade2.price).toBe(50200);
      expect(trade2.amount).toBe(0.7);
    });

    it('should partially fill market order when insufficient liquidity', () => {
      const orderUpdateSpy = vi.fn();
      engine.on('orderUpdate', orderUpdateSpy);

      // Market buy larger than all available liquidity
      const marketBuy = createOrder('buy', 0, 10.0, 'market');
      engine.submitOrder(marketBuy);

      // Should be partially filled
      const finalUpdate = orderUpdateSpy.mock.calls.find(call =>
        call[0]!.id === marketBuy.id && call[0]!.status === 'partial'
      );
      expect(finalUpdate).toBeDefined();
    });

    it('should cancel market order with no liquidity', () => {
      // Clear the order book
      engine.cancelOrder('dummy', testPair); // Just to access the order book
      const orderBook = engine.getOrderBook(testPair);
      orderBook.clear();

      const orderUpdateSpy = vi.fn();
      engine.on('orderUpdate', orderUpdateSpy);

      const marketBuy = createOrder('buy', 0, 1.0, 'market');
      engine.submitOrder(marketBuy);

      // Should be cancelled due to no liquidity
      const finalUpdate = orderUpdateSpy.mock.calls.find(call =>
        call[0]!.id === marketBuy.id && call[0]!.status === 'cancelled'
      );
      expect(finalUpdate).toBeDefined();
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel existing orders', () => {
      const cancelledSpy = vi.fn();
      engine.on('orderCancelled', cancelledSpy);

      const order = createOrder('buy', 50000, 1.0);
      engine.submitOrder(order);

      const result = engine.cancelOrder(order.id, testPair);
      expect(result).toBe(true);
      expect(cancelledSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: order.id,
          status: 'cancelled'
        })
      );

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getOrderCount()).toBe(0);
    });

    it('should return false for non-existent orders', () => {
      const result = engine.cancelOrder('non-existent', testPair);
      expect(result).toBe(false);
    });

    it('should not emit event for failed cancellation', () => {
      const cancelledSpy = vi.fn();
      engine.on('orderCancelled', cancelledSpy);

      engine.cancelOrder('non-existent', testPair);
      expect(cancelledSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fee Calculations', () => {
    it('should calculate correct maker and taker fees', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      // Custom engine with known fee rates
      const customEngine = new MatchingEngine(0.01, 0.02); // 1% maker, 2% taker

      customEngine.submitOrder(createOrder('sell', 100, 1.0));
      customEngine.submitOrder(createOrder('buy', 100, 1.0));

      expect(tradeSpy).toHaveBeenCalledTimes(1);
      const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;

      expect(trade.volume).toBe(100); // 100 * 1.0
      expect(trade.makerFee).toBe(1); // 100 * 0.01
      expect(trade.takerFee).toBe(2); // 100 * 0.02
    });
  });

  describe('Event System', () => {
    it('should emit all events during matching', () => {
      const tradeSpy = vi.fn();
      const orderUpdateSpy = vi.fn();

      engine.on('trade', tradeSpy);
      engine.on('orderUpdate', orderUpdateSpy);

      const sellOrder = createOrder('sell', 50000, 1.0);
      const buyOrder = createOrder('buy', 50000, 1.0);

      engine.submitOrder(sellOrder);
      engine.submitOrder(buyOrder);

      // Should emit trade event
      expect(tradeSpy).toHaveBeenCalledTimes(1);

      // Should emit multiple order updates (initial submission + matching updates)
      expect(orderUpdateSpy).toHaveBeenCalledTimes(4);

      // Verify trade event contains all required fields
      const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;
      expect(trade.id).toBeDefined();
      expect(trade.pair).toBe(testPair);
      expect(trade.price).toBe(50000);
      expect(trade.amount).toBe(1.0);
      expect(trade.volume).toBe(50000);
      expect(trade.timestamp).toBeGreaterThan(0);
      expect(trade.buyOrderId).toBeDefined();
      expect(trade.sellOrderId).toBeDefined();
    });

    it('should support multiple event listeners', () => {
      const tradeSpy1 = vi.fn();
      const tradeSpy2 = vi.fn();

      engine.on('trade', tradeSpy1);
      engine.on('trade', tradeSpy2);

      engine.submitOrder(createOrder('sell', 50000, 1.0));
      engine.submitOrder(createOrder('buy', 50000, 1.0));

      expect(tradeSpy1).toHaveBeenCalledTimes(1);
      expect(tradeSpy2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-frequency order submissions', () => {
      const startTime = Date.now();
      const numOrders = 1000;

      for (let i = 0; i < numOrders; i++) {
        const side: OrderSide = i % 2 === 0 ? 'buy' : 'sell';
        const basePrice = side === 'buy' ? 49000 : 51000;
        const price = basePrice + (i % 100) * 10;
        const amount = Math.random() * 2 + 0.1;

        engine.submitOrder(createOrder(side, price, amount));
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getOrderCount()).toBe(numOrders);
    });

    it('should handle rapid matching efficiently', () => {
      // Set up order book with many levels
      for (let i = 1; i <= 100; i++) {
        engine.submitOrder(createOrder('sell', 50000 + i * 10, 0.1));
        engine.submitOrder(createOrder('buy', 50000 - i * 10, 0.1));
      }

      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      const startTime = Date.now();

      // Submit market orders that will match many levels
      for (let i = 0; i < 10; i++) {
        engine.submitOrder(createOrder('buy', 0, 5.0, 'market'));
        engine.submitOrder(createOrder('sell', 0, 5.0, 'market'));
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(tradeSpy).toHaveBeenCalled(); // Should generate trades
    });
  });

  describe('Complex Trading Scenarios', () => {
    it('should handle iceberg order scenario', () => {
      // Simulate breaking large order into smaller pieces
      const totalAmount = 10.0;
      const chunkSize = 1.0;
      const price = 50000;

      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      // Add liquidity on other side
      engine.submitOrder(createOrder('sell', price, totalAmount));

      // Submit order in chunks
      for (let i = 0; i < totalAmount / chunkSize; i++) {
        engine.submitOrder(createOrder('buy', price, chunkSize));
      }

      expect(tradeSpy).toHaveBeenCalledTimes(10); // Should generate 10 trades

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getOrderCount()).toBe(0); // All orders should be matched
    });

    it('should handle price improvement scenarios', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      // Add orders at different price levels
      engine.submitOrder(createOrder('sell', 50100, 1.0));
      engine.submitOrder(createOrder('sell', 50200, 1.0));

      // Buy order with higher price should get price improvement
      engine.submitOrder(createOrder('buy', 50200, 1.0));

      expect(tradeSpy).toHaveBeenCalledTimes(1);
      const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;

      // Should execute at better price (50100, not 50200)
      expect(trade.price).toBe(50100);
      expect(trade.amount).toBe(1.0);
    });

    it('should maintain FIFO order within price levels', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      // Add multiple orders at same price level
      const order1 = createOrder('sell', 50000, 1.0, 'limit', 'first');
      const order2 = createOrder('sell', 50000, 1.0, 'limit', 'second');
      const order3 = createOrder('sell', 50000, 1.0, 'limit', 'third');

      engine.submitOrder(order1);
      // Small delay to ensure different timestamps
      setTimeout(() => engine.submitOrder(order2), 1);
      setTimeout(() => engine.submitOrder(order3), 2);

      // Wait for all orders to be submitted
      setTimeout(() => {
        // Market buy should match first order first
        engine.submitOrder(createOrder('buy', 50000, 0.5));

        expect(tradeSpy).toHaveBeenCalledTimes(1);
        const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;
        expect(trade.sellOrderId).toBe(order1.id);

        const orderBook = engine.getOrderBook(testPair);
        const bestAsk = orderBook.getBestAsk();
        expect(bestAsk!.orders[0]?.id).toBe(order1.id); // First order should still be first (partially filled)
      }, 10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-amount orders', () => {
      const order = createOrder('buy', 50000, 0);

      expect(() => engine.submitOrder(order)).not.toThrow();

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getOrderCount()).toBe(1);
    });

    it('should handle very small amounts', () => {
      const tradeSpy = vi.fn();
      engine.on('trade', tradeSpy);

      const smallAmount = 0.00000001;
      engine.submitOrder(createOrder('sell', 50000, smallAmount));
      engine.submitOrder(createOrder('buy', 50000, smallAmount));

      expect(tradeSpy).toHaveBeenCalledTimes(1);
      const trade = tradeSpy.mock.calls[0]![0] as CryptoTrade;
      expect(trade.amount).toBe(smallAmount);
    });

    it('should handle very large amounts', () => {
      const largeAmount = 1000000;
      const order = createOrder('buy', 50000, largeAmount);

      expect(() => engine.submitOrder(order)).not.toThrow();

      const orderBook = engine.getOrderBook(testPair);
      expect(orderBook.getBestBid()!.amount).toBe(largeAmount);
    });
  });
});