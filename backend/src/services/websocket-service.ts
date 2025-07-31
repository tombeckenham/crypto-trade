import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { MatchingEngine } from '../core/matching-engine.js';
import { CryptoOrder, CryptoTrade } from '../types/trading.js';
import { getErrorMessage } from '../utils/error-utils.js';

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  channel?: 'trades' | 'orderbook' | 'ticker';
  pair?: string;
}

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Map<string, Set<string>>;
  isAlive: boolean;
}

export class WebSocketService {
  private clients: Map<string, WebSocketClient> = new Map();
  private matchingEngine: MatchingEngine;
  private pingInterval: NodeJS.Timeout | null = null;
  private updateThrottles: Map<string, NodeJS.Timeout> = new Map();
  private tradeBuffer: Map<string, CryptoTrade[]> = new Map();
  private readonly UPDATE_THROTTLE_MS = 16; // Throttle updates to ~60Hz for responsive simulation
  private readonly MAX_TRADES_PER_BATCH = 10;
  private readonly logger: any;

  constructor(matchingEngine: MatchingEngine, logger: FastifyBaseLogger) {
    this.matchingEngine = matchingEngine;
    this.logger = logger;
    this.setupEventListeners();
    this.startPingInterval();
  }

  async register(fastify: FastifyInstance): Promise<void> {
    await fastify.register((await import('@fastify/websocket')).default);

    const self = this;

    fastify.get('/ws/market', { websocket: true }, (socket, _req) => {
      const clientId = self.generateClientId();
      const client: WebSocketClient = {
        id: clientId,
        ws: socket,
        subscriptions: new Map(),
        isAlive: true
      };

      self.clients.set(clientId, client);

      socket.on('message', (message: Buffer) => {
        self.handleMessage(client, message);
      });

      socket.on('pong', () => {
        client.isAlive = true;
      });

      socket.on('close', () => {
        self.clients.delete(clientId);
      });

      socket.on('error', (error: Error) => {
        this.logger.error(`WebSocket error for client ${clientId}:`, getErrorMessage(error));
        self.clients.delete(clientId);
      });

      self.sendMessage(client, {
        type: 'connection',
        message: 'Connected to CryptoTrade WebSocket',
        timestamp: Date.now()
      });
    });
  }

  private setupEventListeners(): void {
    this.matchingEngine.on('trade', (trade: CryptoTrade) => {
      this.bufferTrade(trade);
    });

    this.matchingEngine.on('orderUpdate', (order: CryptoOrder) => {
      this.throttleOrderBookUpdate(order.pair);
    });
  }

  private handleMessage(client: WebSocketClient, message: Buffer): void {
    try {
      const data: WebSocketMessage = JSON.parse(message.toString());
      this.logger.debug(`Received message from client ${client.id}:`, data);

      switch (data.type) {
        case 'subscribe':
          if (data.channel && data.pair) {
            this.subscribe(client, data.channel, data.pair);
          }
          break;
        case 'unsubscribe':
          if (data.channel && data.pair) {
            this.unsubscribe(client, data.channel, data.pair);
          }
          break;
        case 'ping':
          this.sendMessage(client, { type: 'pong', timestamp: Date.now() });
          break;
      }
    } catch (error) {
      this.logger.error(`Error handling message from client ${client.id}:`, error);
      this.sendMessage(client, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  private subscribe(client: WebSocketClient, channel: string, pair: string): void {
    this.logger.debug(`Client ${client.id} subscribing to ${channel}:${pair}`);

    if (!client.subscriptions.has(channel)) {
      client.subscriptions.set(channel, new Set());
    }
    client.subscriptions.get(channel)!.add(pair);

    this.sendMessage(client, {
      type: 'subscribed',
      channel,
      pair,
      timestamp: Date.now()
    });

    if (channel === 'orderbook') {
      const depth = this.matchingEngine.getMarketDepth(pair);
      this.logger.debug(`Sending initial order book data for ${pair}:`, depth);

      this.sendMessage(client, {
        type: 'orderbook',
        pair,
        data: depth,
        timestamp: Date.now()
      });
    }
  }

  private unsubscribe(client: WebSocketClient, channel: string, pair: string): void {
    const subscription = client.subscriptions.get(channel);
    if (subscription) {
      subscription.delete(pair);
      if (subscription.size === 0) {
        client.subscriptions.delete(channel);
      }
    }

    this.sendMessage(client, {
      type: 'unsubscribed',
      channel,
      pair,
      timestamp: Date.now()
    });
  }

  private bufferTrade(trade: CryptoTrade): void {
    if (!this.tradeBuffer.has(trade.pair)) {
      this.tradeBuffer.set(trade.pair, []);
    }

    const buffer = this.tradeBuffer.get(trade.pair)!;
    buffer.push(trade);

    // Flush buffer if it gets too large or set timer to flush
    if (buffer.length >= this.MAX_TRADES_PER_BATCH) {
      this.flushTradeBuffer(trade.pair);
    } else if (buffer.length === 1) {
      // Start timer for first trade in buffer
      setTimeout(() => this.flushTradeBuffer(trade.pair), this.UPDATE_THROTTLE_MS);
    }
  }

  private flushTradeBuffer(pair: string): void {
    const buffer = this.tradeBuffer.get(pair);
    if (!buffer || buffer.length === 0) return;

    const trades = buffer.splice(0, this.MAX_TRADES_PER_BATCH);
    const message = {
      type: 'trades',
      pair,
      data: trades,
      timestamp: Date.now()
    };

    this.clients.forEach(client => {
      const tradeSubs = client.subscriptions.get('trades');
      if (tradeSubs && tradeSubs.has(pair)) {
        this.sendMessage(client, message);
      }
    });
  }

  private throttleOrderBookUpdate(pair: string): void {
    // Clear existing throttle for this pair
    const existingTimeout = this.updateThrottles.get(pair);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new throttled update
    const timeout = setTimeout(() => {
      this.broadcastOrderBookUpdate(pair);
      this.updateThrottles.delete(pair);
    }, this.UPDATE_THROTTLE_MS);

    this.updateThrottles.set(pair, timeout);
  }

  private broadcastOrderBookUpdate(pair: string): void {
    try {
      const depth = this.matchingEngine.getMarketDepth(pair, 10); // Limit to 10 levels
      const message = {
        type: 'orderbook',
        pair,
        data: depth,
        timestamp: Date.now()
      };

      this.clients.forEach(client => {
        const orderbookSubs = client.subscriptions.get('orderbook');
        if (orderbookSubs && orderbookSubs.has(pair)) {
          this.sendMessage(client, message);
        }
      });
    } catch (error) {
      this.logger.error(`Error broadcasting order book update for ${pair}:`, error);
    }
  }

  private sendMessage(client: WebSocketClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client, id) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(id);
          return;
        }

        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000);
  }

  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Clear all throttle timers
    this.updateThrottles.forEach(timeout => clearTimeout(timeout));
    this.updateThrottles.clear();

    // Clear trade buffers
    this.tradeBuffer.clear();

    this.clients.forEach(client => {
      if (client && client.ws && typeof client.ws.close === 'function') {
        client.ws.close();
      }
    });

    this.clients.clear();
  }
}