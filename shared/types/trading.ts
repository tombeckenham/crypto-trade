/**
 * Trading Types and Interfaces for Cryptocurrency Exchange Simulation
 * 
 * This module defines the core data structures used throughout the trading
 * simulation system. These types ensure type safety and consistency across
 * order processing, market data, and trade execution.
 */

// Order direction - whether buying or selling the base asset
export type OrderSide = 'buy' | 'sell';

// Order execution strategy
export type OrderType = 'market' | 'limit' | 'stop-limit';

// Order lifecycle states
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled';

/**
 * Represents a cryptocurrency trading order
 * 
 * This is the core data structure for all order operations in the system.
 * All monetary values are stored as strings to maintain precision and
 * avoid floating-point arithmetic errors in financial calculations.
 */
export interface CryptoOrder {
  // Unique identifier for the order
  id: string;
  // Trading pair (e.g., "BTC-USDT", "ETH-USDT")
  pair: string;
  // Order direction (buy/sell)
  side: OrderSide;
  // Order price in quote currency ("0" for market orders)
  price: string;
  // Order quantity in base currency (e.g., BTC amount)
  amount: string;
  // Order execution type
  type: OrderType;
  // Creation timestamp (Unix milliseconds)
  timestamp: number;
  // User who placed the order
  userId: string;
  // Current order status
  status: OrderStatus;
  // Amount already filled (partial fills)
  filledAmount: string;
  // Optional trading fee charged
  fee?: string;
  // Asset used for fee payment
  feeAsset?: string;
}

/**
 * Represents a completed trade between two orders
 * 
 * Generated when a buy order matches with a sell order at a specific price.
 * Contains information about both the maker (passive) and taker (aggressive) sides.
 */
export interface CryptoTrade {
  // Unique identifier for the trade
  id: string;
  // Trading pair
  pair: string;
  // Execution price
  price: string;
  // Traded quantity in base currency
  amount: string;
  // Total value in quote currency (price × amount)
  volume: string;
  // Trade execution timestamp
  timestamp: number;
  // Side of the taker (order that initiated the trade)
  takerSide: OrderSide;
  // ID of the buy order involved
  buyOrderId: string;
  // ID of the sell order involved
  sellOrderId: string;
  // Fee charged to the maker (order provider)
  makerFee: string;
  // Fee charged to the taker (order initiator)
  takerFee: string;
}

/**
 * Represents a single price level in the order book
 * 
 * Order books aggregate orders at the same price level for display
 * and market depth analysis. Each level shows the total liquidity
 * available at that price point.
 */
export interface OrderBookLevel {
  // Price level
  price: string;
  // Total quantity available at this price
  amount: string;
  // Cumulative quantity from best price to this level
  total: string;
  // Individual orders at this price level
  orders: CryptoOrder[];
}

/**
 * Represents the current market depth (order book)
 * 
 * Shows the liquidity available on both sides of the market,
 * organized by price levels. Used for market analysis and
 * realistic order placement in simulations.
 */
export interface MarketDepth {
  // Trading pair
  pair: string;
  // Buy orders (highest price first)
  bids: OrderBookLevel[];
  // Sell orders (lowest price first)
  asks: OrderBookLevel[];
  // When this snapshot was taken
  lastUpdateTime: number;
}

/**
 * 24-hour market statistics for a trading pair
 * 
 * Provides comprehensive market data including price action,
 * volume metrics, and daily changes. Used for market analysis
 * and generating realistic simulation parameters.
 */
export interface Ticker {
  // Trading pair
  pair: string;
  // Most recent trade price
  lastPrice: string;
  // Current highest buy order price
  bidPrice: string;
  // Current lowest sell order price
  askPrice: string;
  // Price 24 hours ago
  openPrice: string;
  // Highest price in last 24 hours
  highPrice: string;
  // Lowest price in last 24 hours
  lowPrice: string;
  // Total base currency volume in 24h
  volume24h: string;
  // Total quote currency volume in 24h
  quoteVolume24h: string;
  // Absolute price change in 24h
  priceChange24h: string;
  // Percentage price change in 24h
  priceChangePercent24h: string;
  // Timestamp of this ticker data
  timestamp: number;
}

export interface TradingPair {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  active: boolean;
}

export interface OrderBookStats {
  pair: string;
  bestBid: OrderBookLevel | null;
  bestAsk: OrderBookLevel | null;
  spread: string;
  bidVolume: string;
  askVolume: string;
  orderCount: number;
}

export interface Metrics {
  timestamp: number;
  pairs: OrderBookStats[];
}