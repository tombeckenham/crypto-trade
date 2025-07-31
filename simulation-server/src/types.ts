export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled';

export interface SimulationRequest {
  ordersPerSecond: number;
  durationSeconds: number;
  pair: string;
  targetEndpoint: string; // Main trading server endpoint
}

export interface SimulationStatus {
  id: string;
  status: 'running' | 'completed' | 'failed';
  ordersProcessed: number;
  ordersSent: number;
  startTime: number;
  endTime?: number;
  memoryUsage: number;
  error?: string;
  parameters: SimulationRequest;
}

export interface MarketPrice {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
}

export interface BinanceTicker {
  symbol: string;
  price: string;
  bidPrice: string;
  askPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  openPrice: string;
  priceChange: string;
  priceChangePercent: string;
}