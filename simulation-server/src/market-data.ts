import { MarketPrice, BinanceTicker } from './types.js';

class MarketDataService {
  private readonly binanceUrl = 'https://api.binance.com/api/v3';
  private priceCache = new Map<string, { data: MarketPrice; timestamp: number }>();
  private readonly cacheTimeout = 30000; // 30 seconds

  convertPairToBinanceSymbol(pair: string): string {
    return pair.replace(/[-/]/g, '').toUpperCase();
  }

  async getCurrentPrice(pair: string): Promise<MarketPrice | null> {
    const binanceSymbol = this.convertPairToBinanceSymbol(pair);
    
    // Check cache first
    const cached = this.priceCache.get(binanceSymbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.binanceUrl}/ticker/24hr?symbol=${binanceSymbol}`);
      
      if (!response.ok) {
        console.warn(`Failed to fetch price for ${binanceSymbol}: ${response.status}`);
        return this.getFallbackPrice(pair);
      }

      const ticker = await response.json() as BinanceTicker;
      
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

      // Cache the result
      this.priceCache.set(binanceSymbol, {
        data: marketPrice,
        timestamp: Date.now()
      });

      return marketPrice;
    } catch (error) {
      console.error(`Error fetching market data for ${pair}:`, error);
      return this.getFallbackPrice(pair);
    }
  }

  private getFallbackPrice(pair: string): MarketPrice {
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

  generateRealisticOrderParams(marketPrice: MarketPrice): {
    basePrice: number;
    spread: number;
    volatility: number;
    avgOrderSize: number;
    marketOrderRatio: number;
  } {
    const price = marketPrice.price;
    const spread = Math.max(0.01, marketPrice.ask - marketPrice.bid);
    
    const dailyRange = marketPrice.high24h - marketPrice.low24h;
    const volatility = dailyRange / price;
    
    let avgOrderSize: number;
    if (price > 10000) {
      avgOrderSize = 0.1;
    } else if (price > 1000) {
      avgOrderSize = 1;
    } else if (price > 10) {
      avgOrderSize = 10;
    } else {
      avgOrderSize = 1000;
    }

    const marketOrderRatio = Math.max(0.2, Math.min(0.4, volatility * 100));

    return {
      basePrice: price,
      spread,
      volatility,
      avgOrderSize,
      marketOrderRatio
    };
  }
}

export const marketDataService = new MarketDataService();