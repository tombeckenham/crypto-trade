import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PlaceOrderRequest } from '../services/api';
import type { MarketDepth, TradingPair } from '../types/trading';

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