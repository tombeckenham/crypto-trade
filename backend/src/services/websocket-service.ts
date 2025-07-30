import { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { MatchingEngine } from '../core/matching-engine';
import { CryptoOrder, CryptoTrade } from '../types/trading';
import { getErrorMessage } from '../utils/error-utils';

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

  constructor(matchingEngine: MatchingEngine) {
    this.matchingEngine = matchingEngine;
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
        console.error(`WebSocket error for client ${clientId}:`, getErrorMessage(error));
        self.clients.delete(clientId);
      });

      self.sendMessage(client, {
        type: 'connection',
        message: 'Connected to FluxTrade WebSocket',
        timestamp: Date.now()
      });
    });
  }

  private setupEventListeners(): void {
    this.matchingEngine.on('trade', (trade: CryptoTrade) => {
      this.broadcastTrade(trade);
    });

    this.matchingEngine.on('orderUpdate', (order: CryptoOrder) => {
      this.broadcastOrderBookUpdate(order.pair);
    });
  }

  private handleMessage(client: WebSocketClient, message: Buffer): void {
    try {
      const data: WebSocketMessage = JSON.parse(message.toString());

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
      this.sendMessage(client, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  private subscribe(client: WebSocketClient, channel: string, pair: string): void {
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

  private broadcastTrade(trade: CryptoTrade): void {
    const message = {
      type: 'trade',
      pair: trade.pair,
      data: trade,
      timestamp: Date.now()
    };

    this.clients.forEach(client => {
      const tradeSubs = client.subscriptions.get('trades');
      if (tradeSubs && tradeSubs.has(trade.pair)) {
        this.sendMessage(client, message);
      }
    });
  }

  private broadcastOrderBookUpdate(pair: string): void {
    const depth = this.matchingEngine.getMarketDepth(pair);
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

    this.clients.forEach(client => {
      if (client && client.ws && typeof client.ws.close === 'function') {
        client.ws.close();
      }
    });

    this.clients.clear();
  }
}