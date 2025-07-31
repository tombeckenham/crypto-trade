import { FastifyInstance } from 'fastify';
import { MatchingEngine } from '../core/matching-engine.js';
import { CryptoOrder } from '@shared/types/trading.js';
import { nanoid } from 'nanoid';
import { marketDataService } from '../services/market-data-service.js';
import { createPooledOrder, releaseOrder, orderPool } from '../utils/object-pool.js';
import { SimulationClient } from '../services/simulation-client.js';
import { numberToString } from '../utils/precision.js';

interface PlaceOrderBody {
  pair: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: string;
  amount: string;
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

// API Key authentication hook
const validateApiKey = async (request: any, reply: any) => {
  const apiKey = request.headers['x-api-key'];
  const validApiKeys = [
    process.env['SIMULATION_API_KEY'],
    process.env['FRONTEND_API_KEY']
  ].filter(Boolean);

  if (!apiKey || !validApiKeys.includes(apiKey)) {
    reply.code(401).send({ error: 'Invalid or missing API key' });
  }
};

export function registerRoutes(fastify: FastifyInstance, matchingEngine: MatchingEngine, simulationClient: SimulationClient): void {
  // Rate limiting configurations
  const publicRateLimit = {
    max: 100,
    timeWindow: 1_000, // 1 second
  };

  const authenticatedRateLimit = {
    max: async (_request: any, key: string) => key === 'unlimited' ? 5_000_000 : 1000, // 1000 per second is the max for a client
    timeWindow: 1_000, // 1 second
    keyGenerator: (request: any) => {
      const apiKey = request.headers['x-api-key'];
      // Give simulation server unlimited requests by using a unique key space
      if (apiKey === process.env['SIMULATION_API_KEY']) {
        return `unlimited`; // New key every minute = unlimited
      }
      return request.ip;
    }
  };
  // Schema definitions for OpenAPI
  const orderSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique order identifier' },
      pair: { type: 'string', description: 'Trading pair symbol' },
      side: { type: 'string', enum: ['buy', 'sell'], description: 'Order side' },
      type: { type: 'string', enum: ['market', 'limit'], description: 'Order type' },
      price: { type: 'string', description: 'Order price (0 for market orders)' },
      amount: { type: 'string', description: 'Order amount in base currency' },
      timestamp: { type: 'number', description: 'Order creation timestamp' },
      userId: { type: 'string', description: 'User identifier' },
      status: { type: 'string', enum: ['pending', 'partial', 'filled', 'cancelled'] },
      filledAmount: { type: 'string', description: 'Amount filled so far' }
    }
  };

  const orderBookLevelSchema = {
    type: 'object',
    properties: {
      price: { type: 'string', description: 'Price level' },
      amount: { type: 'string', description: 'Total amount at this price' },
      total: { type: 'string', description: 'Cumulative amount' },
      orders: { type: 'array', items: orderSchema, description: 'Orders at this level' }
    }
  };

  const marketDepthSchema = {
    type: 'object',
    properties: {
      pair: { type: 'string', description: 'Trading pair' },
      bids: { type: 'array', items: orderBookLevelSchema, description: 'Buy orders' },
      asks: { type: 'array', items: orderBookLevelSchema, description: 'Sell orders' },
      lastUpdateTime: { type: 'number', description: 'Last update timestamp' }
    }
  };

  const errorSchema = {
    type: 'object',
    properties: {
      error: { type: 'string', description: 'Error message' }
    }
  };

  fastify.post<{ Body: PlaceOrderBody }>('/api/orders', {
    preHandler: validateApiKey,
    config: { rateLimit: authenticatedRateLimit },
    schema: {
      tags: ['Orders'],
      summary: 'Place a new order',
      description: 'Submit a new buy or sell order to the matching engine (requires API key)',
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['pair', 'side', 'type', 'amount', 'userId'],
        properties: {
          pair: { type: 'string', description: 'Trading pair symbol' },
          side: { type: 'string', enum: ['buy', 'sell'], description: 'Order side' },
          type: { type: 'string', enum: ['market', 'limit'], description: 'Order type' },
          price: { type: 'string', description: 'Order price (required for limit orders)' },
          amount: { type: 'string', description: 'Order amount in base currency' },
          userId: { type: 'string', description: 'User identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            order: orderSchema
          }
        },
        400: errorSchema,
        500: errorSchema
      }
    }
  }, async (request, reply) => {
    const { pair, side, type, price, amount, userId } = request.body;

    if (type === 'limit' && !price) {
      return reply.code(400).send({ error: 'Price is required for limit orders' });
    }

    const order: CryptoOrder = {
      id: nanoid(),
      pair,
      side,
      type,
      price: price || '0',
      amount,
      timestamp: Date.now(),
      userId,
      status: 'pending',
      filledAmount: '0'
    };

    try {
      matchingEngine.submitOrder(order);
      return reply.send({ order });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to place order' });
    }
  });

  fastify.delete<{ Params: CancelOrderParams }>('/api/orders/:id', {
    schema: {
      tags: ['Orders'],
      summary: 'Cancel an order',
      description: 'Cancel an existing order by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Order ID to cancel' }
        }
      },
      querystring: {
        type: 'object',
        required: ['pair'],
        properties: {
          pair: { type: 'string', description: 'Trading pair' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Success message' }
          }
        },
        400: errorSchema,
        404: errorSchema
      }
    }
  }, async (request, reply) => {
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

  fastify.get<{ Params: OrderBookParams }>('/api/orderbook/:pair', {
    config: { rateLimit: publicRateLimit },
    schema: {
      tags: ['Market Data'],
      summary: 'Get order book',
      description: 'Retrieve current order book for a trading pair',
      params: {
        type: 'object',
        required: ['pair'],
        properties: {
          pair: { type: 'string', description: 'Trading pair symbol' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          levels: { type: 'integer', minimum: 1, maximum: 1000, default: 20, description: 'Number of price levels to return' }
        }
      },
      response: {
        200: marketDepthSchema,
        500: errorSchema
      }
    }
  }, async (request, reply) => {
    const { pair } = request.params;
    const levels = parseInt((request.query as any).levels as string) || 20;

    try {
      const depth = matchingEngine.getMarketDepth(pair, levels);
      return reply.send(depth);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get order book' });
    }
  });

  fastify.get<{ Params: TradesParams }>('/api/trades/:pair', {
    schema: {
      tags: ['Market Data'],
      summary: 'Get recent trades',
      description: 'Retrieve recent trade history for a trading pair',
      params: {
        type: 'object',
        required: ['pair'],
        properties: {
          pair: { type: 'string', description: 'Trading pair symbol' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            pair: { type: 'string', description: 'Trading pair' },
            trades: { type: 'array', items: { type: 'object' }, description: 'Trade history' },
            message: { type: 'string', description: 'Status message' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { pair } = request.params;

    return reply.send({
      pair,
      trades: [],
      message: 'Trade history not implemented yet'
    });
  });

  fastify.get('/api/portfolio', {
    schema: {
      tags: ['Portfolio'],
      summary: 'Get user portfolio',
      description: 'Retrieve user portfolio with balances and positions',
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User identifier' },
            balances: { type: 'object', description: 'Asset balances' },
            message: { type: 'string', description: 'Status message' }
          }
        },
        400: errorSchema
      }
    }
  }, async (request, reply) => {
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

  fastify.get('/api/metrics', {
    schema: {
      tags: ['System'],
      summary: 'Get system metrics',
      description: 'Retrieve system performance metrics and statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'number', description: 'Metrics timestamp' },
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pair: { type: 'string', description: 'Trading pair' },
                  orderCount: { type: 'number', description: 'Total orders' },
                  tradeCount: { type: 'number', description: 'Total trades' }
                }
              }
            }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const pairs = matchingEngine.getSupportedPairs();
    const stats = pairs.map(pair => {
      const orderBookStats = matchingEngine.getOrderBookStats(pair);
      return {
        pair: orderBookStats.pair,
        bestBid: orderBookStats.bestBid,
        bestAsk: orderBookStats.bestAsk,
        spread: orderBookStats.spread,
        bidVolume: orderBookStats.bidVolume,
        askVolume: orderBookStats.askVolume,
        orderCount: orderBookStats.orderCount
      };
    });

    return reply.send({
      timestamp: Date.now(),
      pairs: stats
    });
  });

  fastify.get('/api/pairs', {
    schema: {
      tags: ['Market Data'],
      summary: 'Get trading pairs',
      description: 'Retrieve list of available trading pairs',
      response: {
        200: {
          type: 'object',
          properties: {
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  symbol: { type: 'string', description: 'Trading pair symbol' },
                  baseCurrency: { type: 'string', description: 'Base currency' },
                  quoteCurrency: { type: 'string', description: 'Quote currency' },
                  active: { type: 'boolean', description: 'Whether pair is active for trading' }
                }
              }
            }
          }
        }
      }
    }
  }, async (_request, reply) => {
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

  fastify.get('/api/health', {
    schema: {
      tags: ['System'],
      summary: 'Health check',
      description: 'Check system health status',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'], description: 'Health status' },
            timestamp: { type: 'number', description: 'Check timestamp' },
            service: { type: 'string', description: 'Service name' },
            version: { type: 'string', description: 'Service version' }
          }
        }
      }
    }
  }, async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: Date.now(),
      service: 'cryptotrade-backend',
      version: '1.0.0'
    });
  });

  fastify.post('/api/simulate', {
    schema: {
      tags: ['Simulation'],
      summary: 'Start trading simulation',
      description: 'Start a high-volume trading simulation with realistic market data',
      body: {
        type: 'object',
        properties: {
          ordersPerSecond: { type: 'integer', minimum: 1, maximum: 100000, default: 1000, description: 'Orders per second' },
          durationSeconds: { type: 'integer', minimum: 1, maximum: 3600, default: 10, description: 'Simulation duration' },
          pair: { type: 'string', default: 'BTC-USDT', description: 'Trading pair to simulate' },
          forceLocal: { type: 'boolean', default: false, description: 'Force local simulation' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Simulation ID' },
            message: { type: 'string', description: 'Simulation status' },
            marketData: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'Trading symbol' },
                currentPrice: { type: 'string', description: 'Current market price' },
                spread: { type: 'string', description: 'Bid-ask spread' },
                volatility: { type: 'string', description: 'Market volatility percentage' },
                avgOrderSize: { type: 'string', description: 'Average order size' },
                marketOrderRatio: { type: 'string', description: 'Market order ratio percentage' }
              }
            },
            parameters: {
              type: 'object',
              properties: {
                ordersPerSecond: { type: 'number' },
                durationSeconds: { type: 'number' },
                pair: { type: 'string' },
                targetOrders: { type: 'number' },
                batchSize: { type: 'number' }
              }
            },
            startTime: { type: 'number', description: 'Simulation start timestamp' },
            externalSimulation: { type: 'boolean', description: 'Whether using external simulation server' }
          }
        },
        400: errorSchema,
        500: errorSchema
      }
    }
  }, async (request, reply) => {
    const { ordersPerSecond = 1000, durationSeconds = 10, pair = 'BTC-USDT', forceLocal = false } = request.body as any;

    if (ordersPerSecond > 100000) {
      return reply.code(400).send({ error: 'Maximum 100,000 orders per second supported' });
    }

    // Try external simulation server first for high-volume requests
    if (!forceLocal && await simulationClient.isExternalSimulationAvailable()) {
      try {
        fastify.log.info(`Delegating high-volume simulation (${ordersPerSecond} orders/sec) to external server`);
        const response = await simulationClient.startExternalSimulation({
          ordersPerSecond,
          durationSeconds,
          pair
        });
        fastify.log.info('External simulation response:', response);
        return reply.send({
          externalSimulation: true,
          ...response
        });
      } catch (error) {
        fastify.log.warn('External simulation failed, falling back to local simulation:', error);
        // Continue with local simulation
      }
    }

    // Fetch real market data for realistic simulation
    const marketPrice = await marketDataService.getCurrentPrice(pair);
    if (!marketPrice) {
      return reply.code(500).send({ error: 'Failed to fetch market data' });
    }

    let params;
    try {
      params = marketDataService.generateRealisticOrderParams(marketPrice);
    } catch (error) {
      fastify.log.error('Error generating order parameters:', error);
      return reply.code(500).send({ error: 'Invalid market data received' });
    }

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
          numberToString(orderPrice),
          numberToString(orderSize),
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
          const bidPriceNum = parseFloat(stats.bestBid.price);
          const askPriceNum = parseFloat(stats.bestAsk.price);
          const midPrice = (bidPriceNum + askPriceNum) / 2;
          // Smooth price updates to prevent wild swings, ensure midPrice is a valid number
          if (!isNaN(midPrice)) {
            currentPrice = currentPrice * 0.9 + midPrice * 0.1;
          } else {
            fastify.log.warn(`MidPrice is NaN. bidPrice: ${stats.bestBid.price}, askPrice: ${stats.bestAsk.price}. Retaining previous currentPrice.`);
          }
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
          fastify.log.info(`Memory: ${heapUsedMB}MB heap, ${poolSize} pooled orders, ${processedOrders.size} active`);

          if (heapUsedMB > 3500) { // Warning at 3.5GB
            fastify.log.warn('High memory usage detected, triggering GC');
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

        fastify.log.info(`Simulation completed: ${orderCount} orders in ${duration}s (${actualOrdersPerSecond.toFixed(0)} orders/sec)`);
        fastify.log.info(`Price moved from ${params.basePrice.toFixed(2)} to ${finalPrice.toFixed(2)} (${priceChange.toFixed(2)}%)`);

        // Final cleanup - release any remaining orders
        setTimeout(() => {
          // Clear processed orders set
          processedOrders.clear();

          const finalMemUsage = process.memoryUsage();
          const finalHeapMB = Math.round(finalMemUsage.heapUsed / 1024 / 1024);
          fastify.log.info(`Final memory usage: ${finalHeapMB}MB heap, ${orderPool.getPoolSize()} pooled orders`);

          if (global.gc) {
            global.gc();
            fastify.log.info('Final garbage collection triggered');
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
        currentPrice: numberToString(marketPrice.price),
        spread: numberToString(params.spread),
        volatility: (params.volatility * 100).toFixed(2) + '%',
        avgOrderSize: numberToString(params.avgOrderSize),
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

  fastify.get('/api/engine/stats', {
    schema: {
      tags: ['System'],
      summary: 'Get matching engine statistics',
      description: 'Retrieve detailed matching engine performance statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'number', description: 'Stats timestamp' },
            engine: {
              type: 'object',
              description: 'Engine-level statistics'
            },
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                description: 'Per-pair statistics'
              }
            }
          }
        }
      }
    }
  }, async (_request, reply) => {
    const stats = matchingEngine.getEngineStats();
    return reply.send({
      timestamp: Date.now(),
      engine: stats,
      pairs: matchingEngine.getSupportedPairs().map(pair =>
        matchingEngine.getOrderBookStats(pair)
      )
    });
  });

  fastify.get<{ Params: { id: string } }>('/api/simulate/:id/logs', {
    schema: {
      tags: ['Simulation'],
      summary: 'Get simulation logs',
      description: 'Retrieve the logs of a simulation in CSV format',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Simulation ID' }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'Simulation logs in CSV format'
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' }
          },
          required: ['error']
        },
        500: errorSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    try {
      const logs = await simulationClient.getSimulationLogs(id);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename=simulation-${id}-logs.csv`);
      return reply.send(logs);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return reply.code(404).send({ error: 'Simulation logs not found' });
      }
      fastify.log.error('Error fetching simulation logs:', error);
      return reply.code(500).send({ error: 'Failed to retrieve simulation logs' });
    }
  });

  fastify.post('/api/generate-liquidity', {
    preHandler: validateApiKey,
    config: { rateLimit: authenticatedRateLimit },
    schema: {
      tags: ['Simulation'],
      summary: 'Generate market liquidity',
      description: 'Create realistic limit orders to simulate market liquidity (requires API key)',
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['pair', 'basePrice'],
        properties: {
          pair: { type: 'string', description: 'Trading pair symbol' },
          basePrice: { type: 'string', description: 'Base price around which to generate orders' },
          orderCount: { type: 'integer', minimum: 10, maximum: 1000, default: 100, description: 'Number of orders to generate' },
          spread: { type: 'string', default: '0.01', description: 'Spread percentage (0.01 = 1%)' },
          maxDepth: { type: 'string', default: '0.05', description: 'Maximum price depth percentage (0.05 = 5%)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Success message' },
            ordersGenerated: { type: 'number', description: 'Number of orders created' },
            pair: { type: 'string', description: 'Trading pair' },
            basePrice: { type: 'string', description: 'Base price used' },
            priceRange: {
              type: 'object',
              properties: {
                minBid: { type: 'string', description: 'Lowest bid price' },
                maxAsk: { type: 'string', description: 'Highest ask price' }
              }
            }
          }
        },
        400: errorSchema,
        500: errorSchema
      }
    }
  }, async (request, reply) => {
    const {
      pair,
      basePrice,
      orderCount = 100,
      spread = '0.01',
      maxDepth = '0.05'
    } = request.body as {
      pair: string;
      basePrice: string;
      orderCount?: number;
      spread?: string;
      maxDepth?: string;
    };

    try {
      const basePriceNum = parseFloat(basePrice);
      const spreadNum = parseFloat(spread);
      const maxDepthNum = parseFloat(maxDepth);

      if (basePriceNum <= 0 || spreadNum <= 0 || maxDepthNum <= 0) {
        return reply.code(400).send({ error: 'Invalid price parameters' });
      }

      const ordersPerSide = Math.floor(orderCount / 2);
      let ordersCreated = 0;
      const userPrefix = 'liquidity-bot';

      // Calculate price ranges
      const halfSpread = basePriceNum * spreadNum / 2;
      const bidBase = basePriceNum - halfSpread;
      const askBase = basePriceNum + halfSpread;
      const depthRange = basePriceNum * maxDepthNum;

      let minBid = bidBase;
      let maxAsk = askBase;

      // Generate buy orders (bids) below base price
      for (let i = 0; i < ordersPerSide; i++) {
        const depthFactor = Math.pow(Math.random(), 0.5); // Bias towards better prices
        const priceOffset = depthRange * depthFactor;
        const orderPrice = bidBase - priceOffset;

        if (orderPrice <= 0) continue;

        // Vary order sizes - more small orders, fewer large ones
        const sizeRandom = Math.random();
        let orderSize: number;
        if (sizeRandom < 0.6) {
          // Small orders (60%)
          orderSize = 0.01 + Math.random() * 0.1;
        } else if (sizeRandom < 0.9) {
          // Medium orders (30%)
          orderSize = 0.1 + Math.random() * 0.5;
        } else {
          // Large orders (10%)
          orderSize = 0.5 + Math.random() * 2;
        }

        const order: CryptoOrder = {
          id: nanoid(),
          pair,
          side: 'buy',
          type: 'limit',
          price: orderPrice.toFixed(8),
          amount: orderSize.toFixed(8),
          timestamp: Date.now(),
          userId: `${userPrefix}-${Math.floor(Math.random() * 1000)}`,
          status: 'pending',
          filledAmount: '0'
        };

        matchingEngine.submitOrder(order);
        ordersCreated++;
        minBid = Math.min(minBid, orderPrice);
      }

      // Generate sell orders (asks) above base price
      for (let i = 0; i < ordersPerSide; i++) {
        const depthFactor = Math.pow(Math.random(), 0.5); // Bias towards better prices
        const priceOffset = depthRange * depthFactor;
        const orderPrice = askBase + priceOffset;

        // Vary order sizes
        const sizeRandom = Math.random();
        let orderSize: number;
        if (sizeRandom < 0.6) {
          // Small orders (60%)
          orderSize = 0.01 + Math.random() * 0.1;
        } else if (sizeRandom < 0.9) {
          // Medium orders (30%)
          orderSize = 0.1 + Math.random() * 0.5;
        } else {
          // Large orders (10%)
          orderSize = 0.5 + Math.random() * 2;
        }

        const order: CryptoOrder = {
          id: nanoid(),
          pair,
          side: 'sell',
          type: 'limit',
          price: orderPrice.toFixed(8),
          amount: orderSize.toFixed(8),
          timestamp: Date.now(),
          userId: `${userPrefix}-${Math.floor(Math.random() * 1000)}`,
          status: 'pending',
          filledAmount: '0'
        };

        matchingEngine.submitOrder(order);
        ordersCreated++;
        maxAsk = Math.max(maxAsk, orderPrice);
      }

      return reply.send({
        message: `Generated ${ordersCreated} limit orders for ${pair}`,
        ordersGenerated: ordersCreated,
        pair,
        basePrice,
        priceRange: {
          minBid: minBid.toFixed(8),
          maxAsk: maxAsk.toFixed(8)
        }
      });

    } catch (error) {
      fastify.log.error('Error generating liquidity:', error);
      return reply.code(500).send({ error: 'Failed to generate liquidity' });
    }
  });
}