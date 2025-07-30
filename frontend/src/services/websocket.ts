import { type MarketDepth } from "../types/trading";

type MessageHandler = (data: MarketDepth) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimeout: number = 5000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
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

  subscribe(channel: string, pair: string, handler: MessageHandler): void {
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

  unsubscribe(channel: string, pair: string, handler: MessageHandler): void {
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
      console.log('WebSocket message received:', message);
      
      if (message.type === 'orderbook' || message.type === 'trade') {
        const key = `${message.type === 'orderbook' ? 'orderbook' : 'trades'}:${message.pair}`;
        const handlers = this.handlers.get(key);
        
        console.log(`Looking for handlers for key: ${key}, found ${handlers?.size || 0} handlers`);
        
        if (handlers) {
          handlers.forEach(handler => handler(message.data));
        }
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