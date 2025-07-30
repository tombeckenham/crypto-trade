import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { faker } from '@faker-js/faker';
import fastify, { FastifyInstance } from 'fastify';
import { MatchingEngine } from '../../core/matching-engine';
import { registerRoutes } from '../routes';

describe('API Routes Integration Tests', () => {
  let app: FastifyInstance;
  let matchingEngine: MatchingEngine;

  beforeEach(async () => {
    // Create fresh instances for each test
    matchingEngine = new MatchingEngine();
    app = fastify({ logger: false });
    registerRoutes(app, matchingEngine);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeTypeOf('number');
    });
  });

  describe('Trading Pairs', () => {
    it('should return list of supported trading pairs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pairs'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.pairs).toBeInstanceOf(Array);
      expect(data.pairs.length).toBeGreaterThan(0);
      
      // Check structure of first pair
      const firstPair = data.pairs[0];
      expect(firstPair).toHaveProperty('symbol');
      expect(firstPair).toHaveProperty('baseCurrency');
      expect(firstPair).toHaveProperty('quoteCurrency');
      expect(firstPair).toHaveProperty('active');
    });
  });

  describe('Order Management', () => {
    const testPair = 'BTC-USDT';
    const testUserId = faker.string.uuid();

    it('should place a limit order successfully', async () => {
      const orderData = {
        pair: testPair,
        side: 'buy' as const,
        type: 'limit' as const,
        price: 50000,
        amount: 1.5,
        userId: testUserId
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: orderData
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.order).toBeDefined();
      expect(data.order.pair).toBe(testPair);
      expect(data.order.side).toBe('buy');
      expect(data.order.type).toBe('limit');
      expect(data.order.price).toBe(50000);
      expect(data.order.amount).toBe(1.5);
      expect(data.order.userId).toBe(testUserId);
      expect(data.order.id).toBeDefined();
      expect(data.order.status).toBe('pending');
    });

    it('should place a market order successfully', async () => {
      // First add some liquidity
      await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: testPair,
          side: 'sell',
          type: 'limit',
          price: 51000,
          amount: 2.0,
          userId: faker.string.uuid()
        }
      });

      const orderData = {
        pair: testPair,
        side: 'buy' as const,
        type: 'market' as const,
        amount: 0.5,
        userId: testUserId
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: orderData
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.order.type).toBe('market');
      expect(data.order.price).toBe(0); // Market orders have price 0
    });

    it('should reject limit order without price', async () => {
      const orderData = {
        pair: testPair,
        side: 'buy',
        type: 'limit',
        amount: 1.0,
        userId: testUserId
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: orderData
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Price is required for limit orders');
    });

    it('should cancel an existing order', async () => {
      // First place an order
      const placeResponse = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: testPair,
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1.0,
          userId: testUserId
        }
      });

      const orderData = JSON.parse(placeResponse.payload);
      const orderId = orderData.order.id;

      // Cancel the order
      const cancelResponse = await app.inject({
        method: 'DELETE',
        url: `/api/orders/${orderId}?pair=${testPair}`
      });

      expect(cancelResponse.statusCode).toBe(200);
      const cancelData = JSON.parse(cancelResponse.payload);
      expect(cancelData.message).toBe('Order cancelled successfully');
    });

    it('should return 404 when cancelling non-existent order', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orders/non-existent-id?pair=${testPair}`
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Order not found');
    });

    it('should require pair parameter for order cancellation', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/orders/some-id'
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Pair is required');
    });
  });

  describe('Order Book', () => {
    const testPair = 'BTC-USDT';

    beforeEach(async () => {
      // Set up order book with some orders
      const orders = [
        { side: 'buy', price: 49000, amount: 1.0 },
        { side: 'buy', price: 48500, amount: 1.5 },
        { side: 'buy', price: 48000, amount: 2.0 },
        { side: 'sell', price: 51000, amount: 0.8 },
        { side: 'sell', price: 51500, amount: 1.2 },
        { side: 'sell', price: 52000, amount: 1.8 }
      ];

      for (const order of orders) {
        await app.inject({
          method: 'POST',
          url: '/api/orders',
          payload: {
            pair: testPair,
            side: order.side,
            type: 'limit',
            price: order.price,
            amount: order.amount,
            userId: faker.string.uuid()
          }
        });
      }
    });

    it('should return order book data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orderbook/${testPair}`
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.pair).toBe(testPair);
      expect(data.bids).toBeInstanceOf(Array);
      expect(data.asks).toBeInstanceOf(Array);
      expect(data.lastUpdateTime).toBeTypeOf('number');

      // Check bid ordering (highest to lowest)
      if (data.bids.length > 1) {
        expect(data.bids[0].price).toBeGreaterThan(data.bids[1].price);
      }

      // Check ask ordering (lowest to highest)
      if (data.asks.length > 1) {
        expect(data.asks[0].price).toBeLessThan(data.asks[1].price);
      }
    });

    it('should respect levels parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orderbook/${testPair}?levels=2`
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.bids.length).toBeLessThanOrEqual(2);
      expect(data.asks.length).toBeLessThanOrEqual(2);
    });

    it('should handle non-existent pair gracefully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orderbook/INVALID-PAIR'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.bids).toEqual([]);
      expect(data.asks).toEqual([]);
    });
  });

  describe('Trading Scenarios', () => {
    const testPair = 'BTC-USDT';

    it('should handle complete order matching flow', async () => {
      // Place a sell order
      const sellResponse = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: testPair,
          side: 'sell',
          type: 'limit',
          price: 50000,
          amount: 1.0,
          userId: faker.string.uuid()
        }
      });

      expect(sellResponse.statusCode).toBe(200);

      // Check order book has the sell order
      let orderBookResponse = await app.inject({
        method: 'GET',
        url: `/api/orderbook/${testPair}`
      });

      let orderBookData = JSON.parse(orderBookResponse.payload);
      expect(orderBookData.asks.length).toBeGreaterThan(0);

      // Place a matching buy order
      const buyResponse = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: testPair,
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1.0,
          userId: faker.string.uuid()
        }
      });

      expect(buyResponse.statusCode).toBe(200);

      // Check that orders were matched (order book should be empty or reduced)
      orderBookResponse = await app.inject({
        method: 'GET',
        url: `/api/orderbook/${testPair}`
      });

      orderBookData = JSON.parse(orderBookResponse.payload);
      // After matching, the orders should be removed from the book
      const hasMatchingOrders = orderBookData.asks.some((ask: any) => ask.price === 50000) ||
                               orderBookData.bids.some((bid: any) => bid.price === 50000);
      expect(hasMatchingOrders).toBe(false);
    });

    it('should handle partial order fills', async () => {
      // Place a large sell order
      await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: testPair,
          side: 'sell',
          type: 'limit',
          price: 50000,
          amount: 5.0,
          userId: faker.string.uuid()
        }
      });

      // Place a smaller buy order that partially fills it
      await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: testPair,
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 2.0,
          userId: faker.string.uuid()
        }
      });

      // Check order book still has remaining sell order
      const orderBookResponse = await app.inject({
        method: 'GET',
        url: `/api/orderbook/${testPair}`
      });

      const orderBookData = JSON.parse(orderBookResponse.payload);
      const remainingAsk = orderBookData.asks.find((ask: any) => ask.price === 50000);
      expect(remainingAsk).toBeDefined();
      expect(remainingAsk.amount).toBe(3.0); // 5.0 - 2.0
    });
  });

  describe('Portfolio Endpoint', () => {
    it('should return portfolio data with userId', async () => {
      const userId = faker.string.uuid();
      const response = await app.inject({
        method: 'GET',
        url: `/api/portfolio?userId=${userId}`
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.userId).toBe(userId);
      expect(data.balances).toBeDefined();
      expect(data.message).toContain('not implemented yet');
    });

    it('should require userId parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/portfolio'
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('userId is required');
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return system metrics', async () => {
      // Add some orders to create metrics
      await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: 'BTC-USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1.0,
          userId: faker.string.uuid()
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.timestamp).toBeTypeOf('number');
      expect(data.pairs).toBeInstanceOf(Array);
      
      if (data.pairs.length > 0) {
        const pairStats = data.pairs[0];
        expect(pairStats).toHaveProperty('pair');
        expect(pairStats).toHaveProperty('orderCount');
        expect(pairStats).toHaveProperty('bidVolume');
        expect(pairStats).toHaveProperty('askVolume');
      }
    });

    it('should return empty metrics for no activity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.pairs).toEqual([]);
    });
  });

  describe('Trades Endpoint', () => {
    it('should return trade history placeholder', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/trades/BTC-USDT'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.pair).toBe('BTC-USDT');
      expect(data.trades).toEqual([]);
      expect(data.message).toContain('not implemented yet');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: 'invalid json',
        headers: {
          'content-type': 'application/json'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          side: 'buy',
          type: 'limit'
          // Missing required fields
        }
      });

      expect(response.statusCode).toBe(400); // Missing required fields
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple concurrent orders', async () => {
      const promises: Promise<any>[] = [];
      const numOrders = 20;

      // Create concurrent order requests
      for (let i = 0; i < numOrders; i++) {
        const promise = app.inject({
          method: 'POST',
          url: '/api/orders',
          payload: {
            pair: 'BTC-USDT',
            side: i % 2 === 0 ? 'buy' : 'sell',
            type: 'limit',
            price: 50000 + (i % 2 === 0 ? -i : i) * 10,
            amount: Math.random() * 2 + 0.1,
            userId: faker.string.uuid()
          }
        });
        promises.push(promise);
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Verify order book is in consistent state
      const orderBookResponse = await app.inject({
        method: 'GET',
        url: '/api/orderbook/BTC-USDT'
      });

      expect(orderBookResponse.statusCode).toBe(200);
      const orderBookData = JSON.parse(orderBookResponse.payload);
      expect(orderBookData.bids.length + orderBookData.asks.length).toBeGreaterThan(0);
    });

    it('should handle rapid order book queries', async () => {
      // Add some orders first
      await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          pair: 'BTC-USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 1.0,
          userId: faker.string.uuid()
        }
      });

      const promises: Promise<any>[] = [];
      const numQueries = 50;

      // Create concurrent order book queries
      for (let i = 0; i < numQueries; i++) {
        const promise = app.inject({
          method: 'GET',
          url: '/api/orderbook/BTC-USDT'
        });
        promises.push(promise);
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed and return consistent data
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        expect(data.pair).toBe('BTC-USDT');
      });
    });
  });
});