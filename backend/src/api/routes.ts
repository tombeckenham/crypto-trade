import { FastifyInstance } from 'fastify';
import { MatchingEngine } from '../core/matching-engine';
import { CryptoOrder } from '../types/trading';
import { nanoid } from 'nanoid';
import { marketDataService } from '../services/market-data-service';
import { createPooledOrder, releaseOrder, orderPool } from '../utils/object-pool';
import { simulationClient } from '../services/simulation-client';

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

  fastify.get('/api/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: Date.now()
    });
  });

  fastify.post('/api/simulate', async (request, reply) => {
    const { ordersPerSecond = 1000, durationSeconds = 10, pair = 'BTC-USDT', forceLocal = false } = request.body as any;
    
    if (ordersPerSecond > 100000) {
      return reply.code(400).send({ error: 'Maximum 100,000 orders per second supported' });
    }

    // Try external simulation server first for high-volume requests
    if (!forceLocal && ordersPerSecond > 10000 && await simulationClient.isExternalSimulationAvailable()) {
      try {
        console.log(`Delegating high-volume simulation (${ordersPerSecond} orders/sec) to external server`);
        const response = await simulationClient.startExternalSimulation({
          ordersPerSecond,
          durationSeconds,
          pair
        });
        return reply.send({
          ...response,
          message: 'High-volume simulation started on external server',
          externalSimulation: true
        });
      } catch (error) {
        console.warn('External simulation failed, falling back to local simulation:', error);
        // Continue with local simulation
      }
    }

    // Fetch real market data for realistic simulation
    const marketPrice = await marketDataService.getCurrentPrice(pair);
    if (!marketPrice) {
      return reply.code(500).send({ error: 'Failed to fetch market data' });
    }

    const params = marketDataService.generateRealisticOrderParams(marketPrice);
    
    let orderCount = 0;
    let tradeCount = 0;
    const startTime = Date.now();
    const targetOrders = ordersPerSecond * durationSeconds;
    
    // Smaller batches for high volumes to prevent memory spikes
    const batchSize = Math.min(100, Math.max(10, ordersPerSecond / 50));
    const batchDelay = (1000 / ordersPerSecond) * batchSize;

    let currentPrice = params.basePrice;
    const priceHistory: number[] = [currentPrice];
    
    // Memory monitoring
    let lastMemoryCheck = Date.now();
    const processedOrders = new Set<string>(); // Track processed orders for cleanup

    const simulateOrderBatch = () => {
      const batch: CryptoOrder[] = [];
      
      for (let i = 0; i < batchSize && orderCount < targetOrders; i++) {
        const isMarketOrder = Math.random() < params.marketOrderRatio;
        const isBuy = Math.random() < 0.5;
        
        // Price variation based on market volatility
        const volatilityFactor = params.volatility * (Math.random() - 0.5) * 2;
        const meanReversion = (params.basePrice - currentPrice) * 0.1; // Slight mean reversion
        const priceChange = currentPrice * (volatilityFactor * 0.1 + meanReversion * 0.01);
        
        let orderPrice: number;
        if (isMarketOrder) {
          orderPrice = 0;
        } else {
          // Limit orders spread around current price with realistic distribution
          const spreadMultiplier = (Math.random() - 0.5) * 4; // -2 to +2 spreads
          const spreadOffset = params.spread * spreadMultiplier;
          orderPrice = Math.max(0.01, currentPrice + priceChange + spreadOffset);
        }

        // Realistic order sizes with some large orders
        let orderSize: number;
        const sizeRandom = Math.random();
        if (sizeRandom < 0.7) {
          // Small orders (70%)
          orderSize = params.avgOrderSize * (0.1 + Math.random() * 0.4);
        } else if (sizeRandom < 0.95) {
          // Medium orders (25%)
          orderSize = params.avgOrderSize * (0.5 + Math.random() * 2);
        } else {
          // Large orders (5%)
          orderSize = params.avgOrderSize * (5 + Math.random() * 20);
        }
        
        // Use object pool for memory efficiency
        const order = createPooledOrder(
          pair,
          isBuy ? 'buy' : 'sell',
          isMarketOrder ? 'market' : 'limit',
          orderPrice,
          orderSize,
          `sim-user-${Math.floor(Math.random() * 1000)}`
        );

        batch.push(order);
        processedOrders.add(order.id);
        orderCount++;
      }

      // Process batch without blocking event loop
      setImmediate(() => {
        batch.forEach(order => {
          matchingEngine.submitOrder(order);
        });
        
        // Memory management - release processed orders back to pool
        setTimeout(() => {
          batch.forEach(order => {
            if (order.status === 'filled' || order.status === 'cancelled') {
              processedOrders.delete(order.id);
              releaseOrder(order);
            }
          });
        }, 1000); // Clean up after 1 second
        
        // Update current price based on order book mid-price
        const stats = matchingEngine.getOrderBookStats(pair);
        if (stats.bestBid && stats.bestAsk) {
          const midPrice = (stats.bestBid.price + stats.bestAsk.price) / 2;
          // Smooth price updates to prevent wild swings
          currentPrice = currentPrice * 0.9 + midPrice * 0.1;
        }
        
        priceHistory.push(currentPrice);
        if (priceHistory.length > 100) {
          priceHistory.shift(); // Keep last 100 price points
        }
        
        // Memory monitoring every 5 seconds
        const now = Date.now();
        if (now - lastMemoryCheck > 5000) {
          const memUsage = process.memoryUsage();
          const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
          const poolSize = orderPool.getPoolSize();
          console.log(`Memory: ${heapUsedMB}MB heap, ${poolSize} pooled orders, ${processedOrders.size} active`);
          
          if (heapUsedMB > 3500) { // Warning at 3.5GB
            console.warn('High memory usage detected, triggering GC');
            if (global.gc) {
              global.gc();
            }
          }
          
          lastMemoryCheck = now;
        }
      });

      if (orderCount < targetOrders) {
        setTimeout(simulateOrderBatch, batchDelay);
      } else {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const actualOrdersPerSecond = orderCount / duration;
        const finalPrice = priceHistory[priceHistory.length - 1] || params.basePrice;
        const priceChange = ((finalPrice - params.basePrice) / params.basePrice) * 100;
        
        console.log(`Simulation completed: ${orderCount} orders in ${duration}s (${actualOrdersPerSecond.toFixed(0)} orders/sec)`);
        console.log(`Price moved from $${params.basePrice.toFixed(2)} to $${finalPrice.toFixed(2)} (${priceChange.toFixed(2)}%)`);
        
        // Final cleanup - release any remaining orders
        setTimeout(() => {
          // Clear processed orders set
          processedOrders.clear();
          
          const finalMemUsage = process.memoryUsage();
          const finalHeapMB = Math.round(finalMemUsage.heapUsed / 1024 / 1024);
          console.log(`Final memory usage: ${finalHeapMB}MB heap, ${orderPool.getPoolSize()} pooled orders`);
          
          if (global.gc) {
            global.gc();
            console.log('Final garbage collection triggered');
          }
        }, 2000);
      }
    };

    // Count trades during simulation
    const tradeListener = () => tradeCount++;
    matchingEngine.on('trade', tradeListener);

    // Start simulation
    simulateOrderBatch();

    return reply.send({
      message: 'Simulation started with real market data',
      marketData: {
        symbol: marketPrice.symbol,
        currentPrice: marketPrice.price,
        spread: params.spread,
        volatility: (params.volatility * 100).toFixed(2) + '%',
        avgOrderSize: params.avgOrderSize,
        marketOrderRatio: (params.marketOrderRatio * 100).toFixed(1) + '%'
      },
      parameters: {
        ordersPerSecond,
        durationSeconds,
        pair,
        targetOrders,
        batchSize
      },
      startTime
    });
  });

  fastify.get('/api/engine/stats', async (_request, reply) => {
    const stats = matchingEngine.getEngineStats();
    return reply.send({
      timestamp: Date.now(),
      engine: stats,
      pairs: matchingEngine.getSupportedPairs().map(pair => 
        matchingEngine.getOrderBookStats(pair)
      )
    });
  });
}