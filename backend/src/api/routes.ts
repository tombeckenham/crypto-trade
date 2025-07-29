import { FastifyInstance } from 'fastify';
import { MatchingEngine } from '../core/matching-engine';
import { CryptoOrder } from '../types/trading';
import { nanoid } from 'nanoid';

interface PlaceOrderBody {
  pair: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: number;
  amount: number;
  userId: string;
}

interface CancelOrderParams {
  id: string;
}

interface OrderBookParams {
  pair: string;
}

interface TradesParams {
  pair: string;
}

export function registerRoutes(fastify: FastifyInstance, matchingEngine: MatchingEngine): void {
  fastify.post<{ Body: PlaceOrderBody }>('/api/orders', async (request, reply) => {
    const { pair, side, type, price, amount, userId } = request.body;

    if (type === 'limit' && !price) {
      return reply.code(400).send({ error: 'Price is required for limit orders' });
    }

    const order: CryptoOrder = {
      id: nanoid(),
      pair,
      side,
      type,
      price: price || 0,
      amount,
      timestamp: Date.now(),
      userId,
      status: 'pending',
      filledAmount: 0
    };

    try {
      matchingEngine.submitOrder(order);
      return reply.send({ order });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to place order' });
    }
  });

  fastify.delete<{ Params: CancelOrderParams }>('/api/orders/:id', async (request, reply) => {
    const { id } = request.params;
    const pair = (request.query as any).pair as string;

    if (!pair) {
      return reply.code(400).send({ error: 'Pair is required' });
    }

    const cancelled = matchingEngine.cancelOrder(id, pair);
    
    if (cancelled) {
      return reply.send({ message: 'Order cancelled successfully' });
    } else {
      return reply.code(404).send({ error: 'Order not found' });
    }
  });

  fastify.get<{ Params: OrderBookParams }>('/api/orderbook/:pair', async (request, reply) => {
    const { pair } = request.params;
    const levels = parseInt((request.query as any).levels as string) || 20;
    
    try {
      const depth = matchingEngine.getMarketDepth(pair, levels);
      return reply.send(depth);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get order book' });
    }
  });

  fastify.get<{ Params: TradesParams }>('/api/trades/:pair', async (request, reply) => {
    const { pair } = request.params;
    
    return reply.send({
      pair,
      trades: [],
      message: 'Trade history not implemented yet'
    });
  });

  fastify.get('/api/portfolio', async (request, reply) => {
    const userId = (request.query as any).userId as string;
    
    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    return reply.send({
      userId,
      balances: {},
      message: 'Portfolio management not implemented yet'
    });
  });

  fastify.get('/api/metrics', async (_request, reply) => {
    const pairs = matchingEngine.getSupportedPairs();
    const stats = pairs.map(pair => ({
      ...matchingEngine.getOrderBookStats(pair)
    }));

    return reply.send({
      timestamp: Date.now(),
      pairs: stats
    });
  });

  fastify.get('/api/pairs', async (_request, reply) => {
    return reply.send({
      pairs: [
        { symbol: 'BTC-USDT', baseCurrency: 'BTC', quoteCurrency: 'USDT', active: true },
        { symbol: 'ETH-USDT', baseCurrency: 'ETH', quoteCurrency: 'USDT', active: true },
        { symbol: 'SOL-USDT', baseCurrency: 'SOL', quoteCurrency: 'USDT', active: true },
        { symbol: 'BNB-USDT', baseCurrency: 'BNB', quoteCurrency: 'USDT', active: true },
        { symbol: 'XRP-USDT', baseCurrency: 'XRP', quoteCurrency: 'USDT', active: true }
      ]
    });
  });

  fastify.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: Date.now()
    });
  });
}