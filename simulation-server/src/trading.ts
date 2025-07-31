export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop-limit';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled';

export interface CryptoOrder {
  id: string;
  pair: string; // e.g., BTC-USDT, ETH-USDT
  side: OrderSide;
  price: string;
  amount: string; // Amount in base currency (e.g., BTC amount)
  type: OrderType;
  timestamp: number;
  userId: string;
  status: OrderStatus;
  filledAmount: string;
  fee?: string;
  feeAsset?: string;
}

export interface CryptoTrade {
  id: string;
  pair: string;
  price: string;
  amount: string;
  volume: string; // price * amount (in quote currency)
  timestamp: number;
  takerSide: OrderSide;
  buyOrderId: string;
  sellOrderId: string;
  makerFee: string;
  takerFee: string;
}

export interface OrderBookLevel {
  price: string;
  amount: string;
  total: string; // Cumulative amount
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
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume24h: string;
  quoteVolume24h: string;
  priceChange24h: string;
  priceChangePercent24h: string;
  timestamp: number;
}