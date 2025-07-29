import type { CryptoTrade, MarketDepth, TradingPair } from "../types/trading";

const API_BASE_URL = 'http://localhost:3001/api';

export interface PlaceOrderRequest {
  pair: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: number;
  amount: number;
  userId: string;
}

export interface ApiError {
  error: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new Error(error.error || 'API request failed');
  }
  return response.json();
}

export const api = {
  async placeOrder(order: PlaceOrderRequest) {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    return handleResponse(response);
  },

  async cancelOrder(orderId: string, pair: string) {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}?pair=${pair}`, {
      method: 'DELETE'
    });
    return handleResponse(response);
  },

  async getOrderBook(pair: string, levels: number = 20): Promise<MarketDepth> {
    const response = await fetch(`${API_BASE_URL}/orderbook/${pair}?levels=${levels}`);
    return handleResponse(response);
  },

  async getTrades(pair: string): Promise<CryptoTrade[]> {
    const response = await fetch(`${API_BASE_URL}/trades/${pair}`);
    return handleResponse(response);
  },

  async getPortfolio(userId: string) {
    const response = await fetch(`${API_BASE_URL}/portfolio?userId=${userId}`);
    return handleResponse(response);
  },

  async getMetrics() {
    const response = await fetch(`${API_BASE_URL}/metrics`);
    return handleResponse(response);
  },

  async getPairs(): Promise<{ pairs: TradingPair[] }> {
    const response = await fetch(`${API_BASE_URL}/pairs`);
    return handleResponse(response);
  }
};