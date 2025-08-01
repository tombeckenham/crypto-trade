/**
 * Core Type Definitions for the Simulation Server
 * 
 * This module contains type definitions specific to the simulation server,
 * including simulation configuration, status tracking, and external API types.
 * These types ensure type safety across simulation operations and data flow.
 */

// Order direction types
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled';

/**
 * Configuration parameters for starting a new simulation
 * 
 * Defines all the parameters needed to run a high-volume trading simulation,
 * including performance targets and destination configuration.
 */
export interface SimulationRequest {
  // Target order generation rate (1-200,000 orders/sec)
  ordersPerSecond: number;
  // How long to run the simulation (max 300 seconds)
  durationSeconds: number;
  // Trading pair to simulate (e.g., "BTC-USDT")
  pair: string;
  // URL of the target trading server's order endpoint
  targetEndpoint: string;
}

/**
 * Current status and progress of a simulation
 * 
 * Tracks the lifecycle and performance metrics of a running or completed
 * simulation. Used for monitoring progress and analyzing results.
 */
export interface SimulationStatus {
  // Unique simulation identifier
  id: string;
  // Current simulation state
  status: 'running' | 'completed' | 'failed';
  // Total orders generated by the simulation
  ordersProcessed: number;
  // Orders successfully sent to target server
  ordersSent: number;
  // Simulation start timestamp (Unix milliseconds)
  startTime: number;
  // Simulation end timestamp (if completed)
  endTime?: number;
  // Current memory usage in MB
  memoryUsage: number;
  // Error message if simulation failed
  error?: string;
  // Original simulation parameters
  parameters: SimulationRequest;
}

/**
 * Normalized market price data structure
 * 
 * Standard format for market price information used internally by the
 * simulation system. Normalized from various external data sources.
 */
export interface MarketPrice {
  // Trading pair symbol
  symbol: string;
  // Current market price
  price: number;
  // Best bid (buy) price
  bid: number;
  // Best ask (sell) price
  ask: number;
  // Highest price in last 24 hours
  high24h: number;
  // Lowest price in last 24 hours
  low24h: number;
  // Trading volume in last 24 hours
  volume24h: number;
  // Absolute price change in last 24 hours
  change24h: number;
  // Percentage price change in last 24 hours
  changePercent24h: number;
}

/**
 * Binance API ticker response format
 * 
 * Maps directly to the Binance REST API ticker endpoint response.
 * All price/amount values are returned as strings to preserve precision.
 * This is converted to our internal MarketPrice format for processing.
 */
export interface BinanceTicker {
  // Trading pair symbol in Binance format (e.g., "BTCUSDT")
  symbol: string;
  // Current price as string
  price: string;
  // Best bid price
  bidPrice: string;
  // Best ask price
  askPrice: string;
  // 24h high price
  highPrice: string;
  // 24h low price
  lowPrice: string;
  // 24h base asset volume
  volume: string;
  // Opening price 24h ago
  openPrice: string;
  // Absolute price change in 24h
  priceChange: string;
  // Percentage price change in 24h
  priceChangePercent: string;
}