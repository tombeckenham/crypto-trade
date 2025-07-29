export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop-limit';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled';

export interface CryptoOrder {
  id: string;
  pair: string; // e.g., BTC-USDT, ETH-USDT
  side: OrderSide;
  price: number;
  amount: number; // Amount in base currency (e.g., BTC amount)
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
  volume: number; // price * amount (in quote currency)
  timestamp: number;
  takerSide: OrderSide;
  buyOrderId: string;
  sellOrderId: string;
  makerFee: number;
  takerFee: number;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
  total: number; // Cumulative amount
  orders: CryptoOrder[];
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