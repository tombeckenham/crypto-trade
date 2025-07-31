/**
 * MarketDataService - Handles real-time market data fetching and price generation
 * 
 * This service provides:
 * - Real-time price data from Binance API with caching
 * - Fallback pricing for common cryptocurrency pairs
 * - Realistic order parameter generation based on market conditions
 * - Adaptive spread and volatility calculations
 */

import { MarketPrice, BinanceTicker } from './types';

/**
 * Service for managing market data and generating realistic trading parameters
 */
class MarketDataService {
  // Binance API endpoint for fetching real-time market data
  private readonly binanceUrl = 'https://api.binance.com/api/v3';
  // In-memory cache to reduce API calls and improve performance
  private priceCache = new Map<string, { data: MarketPrice; timestamp: number }>();
  // Cache timeout of 30 seconds to balance freshness and API rate limits
  private readonly cacheTimeout = 30000; // 30 seconds

  /**
   * Converts trading pair format to Binance symbol format
   * 
   * @param pair - Trading pair in format like "BTC-USDT" or "BTC/USDT"
   * @returns Binance symbol format like "BTCUSDT"
   * 
   * Examples:
   * - "BTC-USDT" -> "BTCUSDT"
   * - "eth/usdt" -> "ETHUSDT"
   */
  convertPairToBinanceSymbol(pair: string): string {
    return pair.replace(/[-/]/g, '').toUpperCase();
  }

  /**
   * Fetches current market price data for a trading pair
   * 
   * @param pair - Trading pair symbol (e.g., "BTC-USDT")
   * @returns Market price data including bid/ask/24h stats, or null on error
   * 
   * Implements a caching strategy to minimize API calls while maintaining
   * reasonably fresh data for high-frequency simulations.
   */
  async getCurrentPrice(pair: string): Promise<MarketPrice | null> {
    const binanceSymbol = this.convertPairToBinanceSymbol(pair);
    
    // Check cache first to avoid unnecessary API calls
    const cached = this.priceCache.get(binanceSymbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Fetch 24-hour ticker data from Binance API
      const response = await fetch(`${this.binanceUrl}/ticker/24hr?symbol=${binanceSymbol}`);
      
      if (!response.ok) {
        // Log warning and use fallback prices if API call fails
        console.warn(`Failed to fetch price for ${binanceSymbol}: ${response.status}`);
        return this.getFallbackPrice(pair);
      }

      // Parse Binance ticker response
      const ticker = await response.json() as BinanceTicker;
      
      // Convert Binance ticker data to our MarketPrice format
      const marketPrice: MarketPrice = {
        symbol: pair,
        price: parseFloat(ticker.price),
        bid: parseFloat(ticker.bidPrice),
        ask: parseFloat(ticker.askPrice),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume24h: parseFloat(ticker.volume),
        change24h: parseFloat(ticker.priceChange),
        changePercent24h: parseFloat(ticker.priceChangePercent)
      };

      // Cache the result to reduce API calls for subsequent requests
      this.priceCache.set(binanceSymbol, {
        data: marketPrice,
        timestamp: Date.now()
      });

      return marketPrice;
    } catch (error) {
      // Log error and fallback to predefined prices
      console.error(`Error fetching market data for ${pair}:`, error);
      return this.getFallbackPrice(pair);
    }
  }

  /**
   * Provides fallback market prices when API is unavailable
   * 
   * @param pair - Trading pair symbol
   * @returns Static market price data based on typical market values
   * 
   * These fallback prices are based on historical averages and provide
   * reasonable defaults for testing when live data is unavailable.
   */
  private getFallbackPrice(pair: string): MarketPrice {
    // Predefined fallback prices for major cryptocurrency pairs
    const fallbackPrices: Record<string, MarketPrice> = {
      'BTC-USDT': {
        symbol: 'BTC-USDT',
        price: 43000,
        bid: 42995,
        ask: 43005,
        high24h: 44000,
        low24h: 42000,
        volume24h: 1000,
        change24h: 500,
        changePercent24h: 1.17
      },
      'ETH-USDT': {
        symbol: 'ETH-USDT',
        price: 2600,
        bid: 2598,
        ask: 2602,
        high24h: 2650,
        low24h: 2550,
        volume24h: 5000,
        change24h: 30,
        changePercent24h: 1.16
      },
      'SOL-USDT': {
        symbol: 'SOL-USDT',
        price: 95,
        bid: 94.8,
        ask: 95.2,
        high24h: 98,
        low24h: 92,
        volume24h: 10000,
        change24h: 2,
        changePercent24h: 2.15
      },
      'BNB-USDT': {
        symbol: 'BNB-USDT',
        price: 320,
        bid: 319.5,
        ask: 320.5,
        high24h: 325,
        low24h: 315,
        volume24h: 2000,
        change24h: 5,
        changePercent24h: 1.59
      },
      'XRP-USDT': {
        symbol: 'XRP-USDT',
        price: 0.52,
        bid: 0.519,
        ask: 0.521,
        high24h: 0.535,
        low24h: 0.505,
        volume24h: 50000,
        change24h: 0.01,
        changePercent24h: 1.96
      }
    };

    // Return specific fallback or generic default if pair not found
    return fallbackPrices[pair] || {
      symbol: pair,
      price: 100,
      bid: 99.5,
      ask: 100.5,
      high24h: 105,
      low24h: 95,
      volume24h: 1000,
      change24h: 1,
      changePercent24h: 1.0
    };
  }

  /**
   * Generates realistic trading parameters based on current market conditions
   * 
   * @param marketPrice - Current market price data
   * @returns Trading parameters optimized for realistic simulation
   * 
   * This method analyzes market conditions to generate parameters that
   * produce realistic order flow patterns including:
   * - Price-appropriate spreads (wider for higher-priced assets)
   * - Volatility based on 24h price range
   * - Order sizes scaled to asset price
   * - Market order ratios based on volatility
   */
  generateRealisticOrderParams(marketPrice: MarketPrice): {
    basePrice: number;
    spread: number;
    volatility: number;
    avgOrderSize: number;
    marketOrderRatio: number;
  } {
    const price = marketPrice.price;
    // Calculate initial spread from market data
    let spread = Math.max(0.01, marketPrice.ask - marketPrice.bid);
    
    // Adjust minimum spread based on price level for realistic market behavior
    // Higher-priced assets typically have wider absolute spreads
    if (price > 10000) {
      spread = Math.max(1, spread); // At least $1 spread for BTC-level prices
    } else if (price > 1000) {
      spread = Math.max(0.1, spread); // At least $0.10 spread for ETH-level prices
    } else if (price > 10) {
      spread = Math.max(0.01, spread); // At least $0.01 spread for mid-range assets
    } else {
      spread = Math.max(0.001, spread); // At least $0.001 spread for low-priced assets
    }
    
    // Calculate volatility from 24h price range
    const dailyRange = marketPrice.high24h - marketPrice.low24h;
    // Normalize volatility as percentage of price, capped at 10%
    const volatility = Math.min(0.1, dailyRange / price); // Cap volatility at 10%
    
    // Determine average order size based on asset price
    // Higher-priced assets typically have smaller order quantities
    let avgOrderSize: number;
    if (price > 10000) {
      avgOrderSize = 0.05; // Small fractions for BTC-level prices
    } else if (price > 1000) {
      avgOrderSize = 0.5; // Moderate amounts for ETH-level prices
    } else if (price > 10) {
      avgOrderSize = 5; // Larger quantities for mid-range assets
    } else {
      avgOrderSize = 500; // High quantities for low-priced assets
    }

    // Calculate market order ratio based on volatility
    // More volatile markets tend to have more market orders
    const marketOrderRatio = Math.max(0.1, Math.min(0.25, volatility * 20)); // 10-25% market orders

    return {
      basePrice: price,
      spread,
      volatility,
      avgOrderSize,
      marketOrderRatio
    };
  }
}

// Export singleton instance for global access
export const marketDataService = new MarketDataService();