export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop-limit';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled';

export interface CryptoOrder {
  id: string;
  pair: string;
  side: OrderSide;
  price: number;
  amount: number;
  type: OrderType;
  timestamp: number;
  userId: string;
  status: OrderStatus;
  filledAmount: number;
  fee?: number;
  feeAsset?: string;
}

export interface CryptoTrade {
  id: string;
  pair: string;
  price: number;
  amount: number;
  volume: number;
  timestamp: number;
  takerSide: OrderSide;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
  total: number;
}

export interface MarketDepth {
  pair: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateTime: number;
}

export interface Ticker {
  pair: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume24h: number;
  quoteVolume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  timestamp: number;
}

export interface TradingPair {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  active: boolean;
}