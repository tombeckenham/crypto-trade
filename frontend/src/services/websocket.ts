import { type MarketDepth } from "../types/trading.js";

interface EngineMetrics {
	orderCount: number;
	tradeCount: number;
	ordersMatched: number;
	ordersLast10s: number;
	ordersLast1m: number;
	ordersLast1h: number;
	tradesLast10s: number;
	tradesLast1m: number;
	tradesLast1h: number;
	ordersPerSecond10s: number;
	ordersPerSecond1m: number;
	tradesPerSecond10s: number;
	tradesPerSecond1m: number;
	matchEfficiency: number;
	supportedPairs: number;
	poolSize: number;
	memoryUsage: {
		heapUsed: number;
		heapTotal: number;
	};
	timestamp: number;
}

type MarketDataHandler = (data: MarketDepth) => void;
type MetricsHandler = (data: EngineMetrics) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimeout: number = 5000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Map<string, Set<MarketDataHandler>> = new Map();
  private metricsHandlers: Set<MetricsHandler> = new Set();
  private subscriptions: Map<string, Set<string>> = new Map();
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        const checkConnection = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkConnection);
          reject(new Error('Connection timeout'));
        }, 10000);
        return;
      }

      this.isConnecting = true;
      this.shouldReconnect = true;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('WebSocket connected to:', this.url);
          this.isConnecting = false;
          this.resubscribe();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnecting = false;
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.CONNECTING) {
        // Wait for connection to establish before closing
        this.ws.addEventListener('open', () => {
          this.ws?.close();
        });
      } else if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  subscribe(channel: string, pair: string, handler: MarketDataHandler): void {
    const key = `${channel}:${pair}`;
    console.log(`Subscribing to ${key}`);

    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler);

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(pair);

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log(`Sending subscription message for ${channel}:${pair}`);
      this.send({
        type: 'subscribe',
        channel,
        pair
      });
    }
  }
  
  subscribeToMetrics(handler: MetricsHandler): void {
    console.log('Subscribing to metrics');
    this.metricsHandlers.add(handler);

    if (!this.subscriptions.has('metrics')) {
      this.subscriptions.set('metrics', new Set());
    }
    this.subscriptions.get('metrics')!.add('global');

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('Sending metrics subscription message');
      this.send({
        type: 'subscribe',
        channel: 'metrics',
        pair: 'global'
      });
    }
  }
  
  unsubscribeFromMetrics(handler: MetricsHandler): void {
    this.metricsHandlers.delete(handler);

    if (this.metricsHandlers.size === 0) {
      const subs = this.subscriptions.get('metrics');
      if (subs) {
        subs.delete('global');
        if (subs.size === 0) {
          this.subscriptions.delete('metrics');
        }
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({
          type: 'unsubscribe',
          channel: 'metrics',
          pair: 'global'
        });
      }
    }
  }

  unsubscribe(channel: string, pair: string, handler: MarketDataHandler): void {
    const key = `${channel}:${pair}`;
    const handlers = this.handlers.get(key);

    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(key);

        const subs = this.subscriptions.get(channel);
        if (subs) {
          subs.delete(pair);
          if (subs.size === 0) {
            this.subscriptions.delete(channel);
          }
        }

        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send({
            type: 'unsubscribe',
            channel,
            pair
          });
        }
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'orderbook' || message.type === 'trade') {
        const key = `${message.type === 'orderbook' ? 'orderbook' : 'trades'}:${message.pair}`;
        const handlers = this.handlers.get(key);

        if (handlers) {
          handlers.forEach(handler => handler(message.data));
        }
      } else if (message.type === 'metrics') {
        this.metricsHandlers.forEach(handler => handler(message.data));
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private send(data: { type: string; channel: string; pair: string }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.shouldReconnect) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect().catch(console.error);
      }
    }, this.reconnectTimeout);
  }

  private resubscribe(): void {
    this.subscriptions.forEach((pairs, channel) => {
      pairs.forEach(pair => {
        this.send({
          type: 'subscribe',
          channel,
          pair
        });
      });
    });
  }
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws/market';
export const wsService = new WebSocketService(WS_URL);