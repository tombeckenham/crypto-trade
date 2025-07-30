import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PlaceOrderRequest } from '../services/api';
import { binanceAPI } from '../services/binance-api';
import type { MarketDepth, TradingPair } from '../types/trading';
import type { Time } from 'lightweight-charts';

export const useOrderBook = (pair: string, levels: number = 20) => {
  return useQuery<MarketDepth>({
    queryKey: ['orderbook', pair, levels],
    queryFn: () => api.getOrderBook(pair, levels),
    refetchInterval: 2000,
    staleTime: 1000
  });
};

export const useTradingPairs = () => {
  return useQuery<{ pairs: TradingPair[] }>({
    queryKey: ['pairs'],
    queryFn: () => api.getPairs(),
    staleTime: 60000
  });
};

export const useMetrics = () => {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: api.getMetrics,
    refetchInterval: 5000
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

const generateMockCandles = (): CandleData[] => {
  const now = Date.now();
  const candles = [];
  let basePrice = 50000;

  for (let i = 0; i < 100; i++) {
    const time = Math.floor((now - (100 - i) * 60000) / 1000) as Time;
    const volatility = 0.002;
    const open = basePrice;
    const change = (Math.random() - 0.5) * basePrice * volatility;
    const high = basePrice + Math.abs(change) + Math.random() * 50;
    const low = basePrice - Math.abs(change) - Math.random() * 50;
    const close = basePrice + change;

    candles.push({ time, open, high, low, close });
    basePrice = close;
  }

  return candles;
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
        return generateMockCandles();
      }
    },
    enabled: !!pair,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
    retry: 1
  });
};