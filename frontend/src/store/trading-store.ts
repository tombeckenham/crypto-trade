import { create } from 'zustand';

interface TradingState {
  selectedPair: string;
  userId: string;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  setSelectedPair: (pair: string) => void;
  setUserId: (userId: string) => void;
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'connecting') => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  selectedPair: 'BTC-USDT',
  userId: 'user123',
  connectionStatus: 'disconnected',
  setSelectedPair: (pair) => set({ selectedPair: pair }),
  setUserId: (userId) => set({ userId }),
  setConnectionStatus: (status) => set({ connectionStatus: status })
}));