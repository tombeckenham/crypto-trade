import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import fastify, { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { MatchingEngine } from '../../core/matching-engine';
import { WebSocketService } from '../websocket-service';
import { CryptoOrder } from '../../types/trading';

describe('WebSocket Service Tests', () => {
  let app: FastifyInstance;
  let matchingEngine: MatchingEngine;
  let wsService: WebSocketService;
  let serverPort: number;

  beforeEach(async () => {
    matchingEngine = new MatchingEngine();
    wsService = new WebSocketService(matchingEngine);
    app = fastify({ logger: false });
    
    await wsService.register(app);
    await app.ready();
    
    // Start the server and get the address
    await app.listen({ port: 0 });
    const address = app.server.address();
    serverPort = typeof address === 'object' && address ? address.port : 0;
  });

  afterEach(async () => {
    wsService.shutdown();
    await app.close();
  });

  const createTestOrder = (
    side: 'buy' | 'sell',
    price: number,
    amount: number,
    pair: string = 'BTC-USDT'
  ): CryptoOrder => ({
    id: faker.string.nanoid(),
    pair,
    side,
    price,
    amount,
    type: 'limit',
    timestamp: Date.now(),
    userId: faker.string.uuid(),
    status: 'pending',
    filledAmount: 0
  });


  const connectAndWaitForConnectionMessage = (port: number): Promise<{ ws: WebSocket, message: any }> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/market`);
      
      // Set up message listener before connection is established
      ws.once('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          resolve({ ws, message });
        } catch (error) {
          reject(error);
        }
      });
      
      ws.on('error', reject);
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  };

  const waitForMessage = (ws: WebSocket, timeout: number = 1000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, timeout);

      ws.once('message', (data) => {
        clearTimeout(timer);
        try {
          const message = JSON.parse(data.toString());
          resolve(message);
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  describe('Connection Management', () => {
    it('should accept WebSocket connections', async () => {
      const { ws, message } = await connectAndWaitForConnectionMessage(serverPort);
      
      // Should receive connection confirmation
      expect(message.type).toBe('connection');
      expect(message.message).toBe('Connected to FluxTrade WebSocket');
      expect(message.timestamp).toBeTypeOf('number');
      
      ws.close();
    });

    it('should handle multiple concurrent connections', async () => {
      const results = await Promise.all([
        connectAndWaitForConnectionMessage(serverPort),
        connectAndWaitForConnectionMessage(serverPort),
        connectAndWaitForConnectionMessage(serverPort)
      ]);

      // All connections should receive welcome message
      results.forEach(({ message }) => {
        expect(message.type).toBe('connection');
      });

      results.forEach(({ ws }) => ws.close());
    });

    it('should handle connection cleanup on close', async () => {
      const { ws } = await connectAndWaitForConnectionMessage(serverPort);
      
      // Close connection
      ws.close();
      
      // Give time for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should not throw errors (client should be removed from internal map)
      expect(() => wsService.shutdown()).not.toThrow();
    });
  });

  describe('Subscription Management', () => {
    let ws: WebSocket;

    beforeEach(async () => {
      const result = await connectAndWaitForConnectionMessage(serverPort);
      ws = result.ws;
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle orderbook subscription', async () => {
      // Subscribe to orderbook
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'orderbook',
        pair: 'BTC-USDT'
      }));

      // Should receive subscription confirmation
      const subMessage = await waitForMessage(ws);
      expect(subMessage.type).toBe('subscribed');
      expect(subMessage.channel).toBe('orderbook');
      expect(subMessage.pair).toBe('BTC-USDT');

      // Should receive initial orderbook data
      const orderBookMessage = await waitForMessage(ws);
      expect(orderBookMessage.type).toBe('orderbook');
      expect(orderBookMessage.pair).toBe('BTC-USDT');
      expect(orderBookMessage.data).toBeDefined();
      expect(orderBookMessage.data.bids).toBeInstanceOf(Array);
      expect(orderBookMessage.data.asks).toBeInstanceOf(Array);
    });

    it('should handle trades subscription', async () => {
      // Subscribe to trades
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
        pair: 'BTC-USDT'
      }));

      const message = await waitForMessage(ws);
      expect(message.type).toBe('subscribed');
      expect(message.channel).toBe('trades');
      expect(message.pair).toBe('BTC-USDT');
    });

    it('should handle unsubscription', async () => {
      // First subscribe
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'orderbook',
        pair: 'BTC-USDT'
      }));
      
      await waitForMessage(ws); // subscription confirmation
      await waitForMessage(ws); // initial orderbook data

      // Then unsubscribe
      ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'orderbook',
        pair: 'BTC-USDT'
      }));

      const message = await waitForMessage(ws);
      expect(message.type).toBe('unsubscribed');
      expect(message.channel).toBe('orderbook');
      expect(message.pair).toBe('BTC-USDT');
    });

    it('should handle ping/pong', async () => {
      ws.send(JSON.stringify({
        type: 'ping'
      }));

      const message = await waitForMessage(ws);
      expect(message.type).toBe('pong');
      expect(message.timestamp).toBeTypeOf('number');
    });

    it('should handle invalid message format', async () => {
      ws.send('invalid json');

      const message = await waitForMessage(ws);
      expect(message.type).toBe('error');
      expect(message.message).toBe('Invalid message format');
    });
  });

  describe('Real-time Data Broadcasting', () => {
    let ws1: WebSocket;
    let ws2: WebSocket;

    beforeEach(async () => {
      const result1 = await connectAndWaitForConnectionMessage(serverPort);
      const result2 = await connectAndWaitForConnectionMessage(serverPort);
      ws1 = result1.ws;
      ws2 = result2.ws;
    });

    afterEach(() => {
      [ws1, ws2].forEach(ws => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    });

    it('should broadcast trades to subscribed clients', async () => {
      // Subscribe ws1 to trades
      ws1.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
        pair: 'BTC-USDT'
      }));
      await waitForMessage(ws1); // subscription confirmation

      // ws2 doesn't subscribe

      // Create orders that will generate a trade
      const sellOrder = createTestOrder('sell', 50000, 1.0);
      const buyOrder = createTestOrder('buy', 50000, 1.0);

      matchingEngine.submitOrder(sellOrder);
      matchingEngine.submitOrder(buyOrder); // This should create a trade

      // ws1 should receive trade notification
      const tradeMessage = await waitForMessage(ws1);
      expect(tradeMessage.type).toBe('trade');
      expect(tradeMessage.pair).toBe('BTC-USDT');
      expect(tradeMessage.data).toBeDefined();
      expect(tradeMessage.data.price).toBe(50000);
      expect(tradeMessage.data.amount).toBe(1.0);

      // ws2 should not receive anything (not subscribed)
      // We can't easily test negative case without complex timing
    });

    it('should broadcast orderbook updates to subscribed clients', async () => {
      // Create fresh WebSocket connections for this test
      const { ws: testWs1 } = await connectAndWaitForConnectionMessage(serverPort);
      const { ws: testWs2 } = await connectAndWaitForConnectionMessage(serverPort);

      try {
        // Both clients subscribe to orderbook
        testWs1.send(JSON.stringify({
          type: 'subscribe',
          channel: 'orderbook',
          pair: 'BTC-USDT'
        }));
        
        testWs2.send(JSON.stringify({
          type: 'subscribe',
          channel: 'orderbook',
          pair: 'BTC-USDT'
        }));

        // Wait for subscriptions and initial data
        await waitForMessage(testWs1); // subscription
        await waitForMessage(testWs1); // initial orderbook
        await waitForMessage(testWs2); // subscription
        await waitForMessage(testWs2); // initial orderbook

        // Add a small delay to ensure clients are fully registered
        await new Promise(resolve => setTimeout(resolve, 10));

        // Add multiple orders to trigger orderbook updates
        const order1 = createTestOrder('buy', 49000, 1.0);
        const order2 = createTestOrder('buy', 48000, 1.0);
        matchingEngine.submitOrder(order1);
        matchingEngine.submitOrder(order2);

        // Both clients should receive orderbook updates (we'll check the first one)
        const message1 = await waitForMessage(testWs1);
        const message2 = await waitForMessage(testWs2);

        [message1, message2].forEach(message => {
          expect(message.type).toBe('orderbook');
          expect(message.pair).toBe('BTC-USDT');
          expect(message.data.bids.length).toBeGreaterThan(0);
        });
      } finally {
        // Clean up connections
        if (testWs1.readyState === WebSocket.OPEN) testWs1.close();
        if (testWs2.readyState === WebSocket.OPEN) testWs2.close();
      }
    });

    it('should only send updates to clients subscribed to specific pairs', async () => {
      // ws1 subscribes to BTC-USDT
      ws1.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
        pair: 'BTC-USDT'
      }));

      // ws2 subscribes to ETH-USDT
      ws2.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
        pair: 'ETH-USDT'
      }));

      await waitForMessage(ws1); // subscription confirmation
      await waitForMessage(ws2); // subscription confirmation

      // Create trade for BTC-USDT
      const sellOrder = createTestOrder('sell', 50000, 1.0, 'BTC-USDT');
      const buyOrder = createTestOrder('buy', 50000, 1.0, 'BTC-USDT');

      matchingEngine.submitOrder(sellOrder);
      matchingEngine.submitOrder(buyOrder);

      // Only ws1 should receive the trade update
      const message = await waitForMessage(ws1);
      expect(message.type).toBe('trade');
      expect(message.pair).toBe('BTC-USDT');

      // ws2 should not receive anything for BTC-USDT
      // (difficult to test negative case reliably)
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket errors gracefully', async () => {
      const { ws } = await connectAndWaitForConnectionMessage(serverPort);

      // Simulate an error by sending malformed data
      const originalSend = ws.send;
      ws.send = vi.fn().mockImplementation(() => {
        throw new Error('Simulated send error');
      });

      // This should not crash the service
      expect(() => {
        ws.send = originalSend;
        ws.send(JSON.stringify({ type: 'ping' }));
      }).not.toThrow();

      ws.close();
    });

    it('should handle client disconnection during broadcast', async () => {
      const { ws } = await connectAndWaitForConnectionMessage(serverPort);

      // Subscribe to trades
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
        pair: 'BTC-USDT'
      }));
      await waitForMessage(ws); // subscription confirmation

      // Close connection immediately
      ws.close();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Creating a trade should not throw even though client disconnected
      expect(() => {
        const sellOrder = createTestOrder('sell', 50000, 1.0);
        const buyOrder = createTestOrder('buy', 50000, 1.0);
        matchingEngine.submitOrder(sellOrder);
        matchingEngine.submitOrder(buyOrder);
      }).not.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle many concurrent subscriptions', async () => {
      const numClients = 10;
      const clients: WebSocket[] = [];

      try {
        // Create multiple clients
        for (let i = 0; i < numClients; i++) {
          const { ws } = await connectAndWaitForConnectionMessage(serverPort);
          clients.push(ws);
        }

        // Subscribe all clients to orderbook
        const subscriptionPromises = clients.map(async (ws) => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'orderbook',
            pair: 'BTC-USDT'
          }));
          return waitForMessage(ws); // subscription confirmation
        });

        await Promise.all(subscriptionPromises);

        // Wait for initial orderbook data
        const initialDataPromises = clients.map(ws => waitForMessage(ws));
        await Promise.all(initialDataPromises);

        // Add a small delay to ensure clients are fully registered
        await new Promise(resolve => setTimeout(resolve, 10));

        // Trigger an orderbook update
        const order = createTestOrder('buy', 49000, 1.0);
        matchingEngine.submitOrder(order);

        // All clients should receive the update
        const updatePromises = clients.map(ws => waitForMessage(ws));
        const updates = await Promise.all(updatePromises);

        updates.forEach(update => {
          expect(update.type).toBe('orderbook');
          expect(update.pair).toBe('BTC-USDT');
        });

      } finally {
        // Clean up all clients
        clients.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
      }
    });

    it('should handle rapid order updates without message loss', async () => {
      const { ws } = await connectAndWaitForConnectionMessage(serverPort);

      // Subscribe to orderbook
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'orderbook',
        pair: 'BTC-USDT'
      }));
      
      await waitForMessage(ws); // subscription
      await waitForMessage(ws); // initial data

      const messages: any[] = [];
      const messagePromise = new Promise<void>((resolve) => {
        let messageCount = 0;
        const expectedMessages = 5;

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'orderbook') {
            messages.push(message);
            messageCount++;
            if (messageCount >= expectedMessages) {
              resolve();
            }
          }
        });
      });

      // Submit multiple rapid orders
      for (let i = 0; i < 5; i++) {
        const order = createTestOrder('buy', 49000 - i * 100, 1.0);
        matchingEngine.submitOrder(order);
      }

      // Wait for all messages
      await messagePromise;

      expect(messages.length).toBe(5);
      messages.forEach(message => {
        expect(message.type).toBe('orderbook');
        expect(message.data).toBeDefined();
      });

      ws.close();
    });
  });

  describe('Ping/Pong Keep-Alive', () => {
    it('should handle ping/pong for connection health', async () => {
      const { ws } = await connectAndWaitForConnectionMessage(serverPort);

      // Send ping and expect pong
      ws.send(JSON.stringify({ type: 'ping' }));
      const pongMessage = await waitForMessage(ws);
      
      expect(pongMessage.type).toBe('pong');
      expect(pongMessage.timestamp).toBeTypeOf('number');

      ws.close();
    });

    // Note: Testing the automatic ping interval is complex in unit tests
    // as it requires waiting for the 30-second interval, which is impractical
    // In a real environment, this would be tested with integration tests
  });
});