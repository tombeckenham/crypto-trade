import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PlaceOrderRequest } from '../services/api';
import { binanceAPI } from '../services/binance-api';
import type { MarketDepth, TradingPair } from '../types/trading.js';
import type { Time } from 'lightweight-charts';

export const useOrderBook = (pair: string, levels: number = 20) => {
  return useQuery<MarketDepth>({
    queryKey: ['orderbook', pair, levels],
    queryFn: () => api.getOrderBook(pair, levels),
    refetchInterval: 20_000,
    staleTime: 30_000 // We have websocket, so we don't need to refetch
  });
};

export const useTradingPairs = () => {
  return useQuery<{ pairs: TradingPair[] }>({
    queryKey: ['pairs'],
    queryFn: () => api.getPairs(),
    staleTime: 60_000 // 1 minute
  });
};

export const useMetrics = () => {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: api.getMetrics,
    refetchInterval: 5_000
  });
};

export const usePlaceOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (order: PlaceOrderRequest) => api.placeOrder(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    }
  });
};

export const useCancelOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, pair }: { orderId: string; pair: string }) =>
      api.cancelOrder(orderId, pair),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    }
  });
};

export const usePortfolio = (userId: string) => {
  return useQuery({
    queryKey: ['portfolio', userId],
    queryFn: () => api.getPortfolio(userId),
    enabled: !!userId,
    refetchInterval: 10000
  });
};

interface CandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

const generateMockCandles = (interval: string = '1m', limit: number = 100): CandleData[] => {
  const now = Date.now();
  const candles = [];
  let basePrice = 50000;

  // Convert interval to milliseconds
  const intervalMs = interval === '1m' ? 60000 : interval === '1h' ? 3600000 : 86400000;

  // Adjust volatility based on interval
  const volatility = interval === '1m' ? 0.001 : interval === '1h' ? 0.005 : 0.02;

  // Adjust price range based on interval
  const priceRange = interval === '1m' ? 25 : interval === '1h' ? 100 : 500;

  for (let i = 0; i < limit; i++) {
    const time = Math.floor((now - (limit - i) * intervalMs) / 1000) as Time;
    const open = basePrice;

    // Generate more realistic OHLC data
    const change = (Math.random() - 0.5) * basePrice * volatility;
    const direction = Math.sign(change);

    // High and low should make sense relative to open and close
    const close = basePrice + change;
    const highOffset = Math.random() * priceRange * (1 + Math.abs(volatility) * 10);
    const lowOffset = Math.random() * priceRange * (1 + Math.abs(volatility) * 10);

    const high = Math.max(open, close) + highOffset;
    const low = Math.min(open, close) - lowOffset;

    candles.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2))
    });

    // Add some trend momentum
    basePrice = close + (direction * Math.random() * 50);

    // Keep price in reasonable range
    if (basePrice < 30000) basePrice = 30000 + Math.random() * 5000;
    if (basePrice > 100000) basePrice = 70000 + Math.random() * 20000;
  }

  return candles;
};

export const useBinanceCurrentPrice = (pair: string) => {
  return useQuery<number>({
    queryKey: ['binance-price', pair],
    queryFn: async () => {
      try {
        const binanceSymbol = binanceAPI.convertPairToBinanceSymbol(pair);
        return await binanceAPI.getCurrentPrice(binanceSymbol);
      } catch (error) {
        console.error('Failed to load Binance current price:', error);
        // Fallback to default price based on pair (matching backend fallbacks)
        if (pair === 'BTC-USDT') return 43000;
        if (pair === 'ETH-USDT') return 2600;
        if (pair === 'SOL-USDT') return 95;
        if (pair === 'BNB-USDT') return 320;
        if (pair === 'XRP-USDT') return 0.52;
        return 100; // Default fallback
      }
    },
    enabled: !!pair,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
    retry: 1
  });
};

export const useBinanceKlines = (pair: string, interval: string = '1m', limit: number = 100) => {
  return useQuery<CandleData[]>({
    queryKey: ['binance-klines', pair, interval, limit],
    queryFn: async () => {
      try {
        const binanceSymbol = binanceAPI.convertPairToBinanceSymbol(pair);
        const candlestickData = await binanceAPI.getKlines(binanceSymbol, interval, limit);

        return candlestickData.map(candle => ({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));
      } catch (error) {
        console.error('Failed to load Binance data:', error);
        // Fallback to mock data on error
        return generateMockCandles(interval, limit);
      }
    },
    enabled: !!pair,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
    retry: 1
  });
};