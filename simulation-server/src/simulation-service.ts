import { SimulationRequest, SimulationStatus, MarketPrice } from './types.js';
import { CryptoOrder, MarketDepth, OrderBookLevel } from './trading.js';
import { marketDataService } from './market-data.js';
import { createPooledOrder, releaseOrder, orderPool } from './object-pool.js';
import { nanoid } from 'nanoid';
import { SimulationLogger } from './simulation-logger.js';

export class SimulationService {
  private activeSimulations = new Map<string, SimulationStatus>();
  private simulationTimeouts = new Map<string, NodeJS.Timeout>();
  private logger = new SimulationLogger();

  async startSimulation(request: SimulationRequest): Promise<{ simulationId: string; message: string }> {
    const simulationId = nanoid();
    this.logger.log(simulationId, 'SimulationStart', { ...request });

    try {
      const baseEndpoint = request.targetEndpoint.replace('/api/orders', '');
      const orderBook = await this.getCurrentOrderBook(request.pair, baseEndpoint);
      let marketPrice: MarketPrice;
      let params;

      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBid = parseFloat(orderBook.bids[0].price);
        const bestAsk = parseFloat(orderBook.asks[0].price);
        const midPrice = (bestBid + bestAsk) / 2;

        this.logger.log(simulationId, 'MarketState', { source: 'orderbook', midPrice, bestBid, bestAsk });

        marketPrice = {
          symbol: request.pair,
          price: midPrice,
          bid: bestBid,
          ask: bestAsk,
          high24h: midPrice * 1.05, // Placeholder
          low24h: midPrice * 0.95, // Placeholder
          volume24h: 0,
          change24h: 0,
          changePercent24h: 0
        };

        params = marketDataService.generateRealisticOrderParams(marketPrice);
      } else {
        const fetchedMarketPrice = await marketDataService.getCurrentPrice(request.pair);
        if (!fetchedMarketPrice) {
          throw new Error('Failed to fetch market data');
        }
        marketPrice = fetchedMarketPrice;
        this.logger.log(simulationId, 'MarketState', { source: 'external', price: marketPrice.price });
        params = marketDataService.generateRealisticOrderParams(marketPrice);
      }

      const status: SimulationStatus = {
        id: simulationId,
        status: 'running',
        ordersProcessed: 0,
        ordersSent: 0,
        startTime: Date.now(),
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        parameters: request
      };

      this.activeSimulations.set(simulationId, status);
      await this.seedInitialLiquidity(simulationId, request, params);
      this.runSimulation(simulationId, request, params).catch(error => {
        this.logger.log(simulationId, 'SimulationError', { error: error.message });
        const failedStatus = this.activeSimulations.get(simulationId);
        if (failedStatus) {
          failedStatus.status = 'failed';
          failedStatus.error = error.message;
          failedStatus.endTime = Date.now();
        }
      });

      return {
        simulationId,
        message: `High-volume simulation started: ${request.ordersPerSecond} orders/sec for ${request.durationSeconds}s`
      };
    } catch (error) {
      this.logger.log(simulationId, 'SimulationError', { error: error.message });
      throw error;
    }
  }

  private async getCurrentOrderBook(pair: string, baseEndpoint: string): Promise<MarketDepth | null> {
    try {
      const response = await fetch(`${baseEndpoint}/api/orderbook/${pair}?levels=5`);
      if (!response.ok) {
        console.warn(`Failed to fetch order book: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('Error fetching order book:', error);
      return null;
    }
  }

  private async seedInitialLiquidity(
    simulationId: string,
    request: SimulationRequest,
    params: { basePrice: number; spread: number; volatility: number; avgOrderSize: number; marketOrderRatio: number }
  ): Promise<void> {
    const { pair, targetEndpoint } = request;
    const seedOrders: CryptoOrder[] = [];

    this.logger.log(simulationId, 'SeedingLiquidity', { count: 20, basePrice: params.basePrice, spread: params.spread });

    for (let i = 1; i <= 20; i++) {
      const bidPrice = params.basePrice - (params.spread * i * 0.5);
      const bidSize = params.avgOrderSize * (1 + Math.random() * 2);
      const bidOrder = createPooledOrder(pair, 'buy', 'limit', bidPrice.toString(), bidSize.toString(), `seed-user-${Math.floor(Math.random() * 1000)}`);
      seedOrders.push(bidOrder);

      const askPrice = params.basePrice + (params.spread * i * 0.5);
      const askSize = params.avgOrderSize * (1 + Math.random() * 2);
      const askOrder = createPooledOrder(pair, 'sell', 'limit', askPrice.toString(), askSize.toString(), `seed-user-${Math.floor(Math.random() * 1000)}`);
      seedOrders.push(askOrder);
    }

    try {
      const results = await Promise.allSettled(seedOrders.map(order => this.sendOrderToMainServer(order, targetEndpoint)));
      let successful = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successful++;
        } else {
          this.logger.log(simulationId, 'SeedOrderFailed', { orderId: seedOrders[index].id, reason: result.reason });
        }
        releaseOrder(seedOrders[index]);
      });
      this.logger.log(simulationId, 'SeedingComplete', { successful, total: seedOrders.length });
    } catch (error) {
      this.logger.log(simulationId, 'SeedingError', { error: error.message });
    }
  }

  private async runSimulation(
    simulationId: string,
    request: SimulationRequest,
    params: { basePrice: number; spread: number; volatility: number; avgOrderSize: number; marketOrderRatio: number }
  ): Promise<void> {
    const status = this.activeSimulations.get(simulationId);
    if (!status) return;

    const { ordersPerSecond, durationSeconds, pair, targetEndpoint } = request;
    const targetOrders = ordersPerSecond * durationSeconds;

    const batchSize = Math.min(50, Math.max(5, ordersPerSecond / 100));
    const batchDelay = (1000 / ordersPerSecond) * batchSize;

    let currentPrice = params.basePrice;
    let orderCount = 0;
    let successfulSends = 0;

    const processBatch = async () => {
      if (status.status !== 'running' || orderCount >= targetOrders) {
        return;
      }

      const baseEndpoint = targetEndpoint.replace('/api/orders', '');
      const orderBook = await this.getCurrentOrderBook(pair, baseEndpoint);

      let buyProbability = 0.52;
      let isWideSpread = false;

      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBid = parseFloat(orderBook.bids[0].price);
        const bestAsk = parseFloat(orderBook.asks[0].price);

        if (bestBid > 0 && bestAsk > 0) {
          const midPrice = (bestBid + bestAsk) / 2;
          const spread = bestAsk - bestBid;

          if (bestBid >= bestAsk) {
            this.logger.log(simulationId, 'MarketCorrection', { type: 'crossed', bestBid, bestAsk });
            params.marketOrderRatio = 1.0;
            buyProbability = 0.5;
          } else {
            params.marketOrderRatio = Math.max(0.1, Math.min(0.25, params.volatility * 20));
            const bidVolume = orderBook.bids.reduce((sum, level) => sum + parseFloat(level.amount), 0);
            const askVolume = orderBook.asks.reduce((sum, level) => sum + parseFloat(level.amount), 0);

            if (askVolume > 0) {
              const bookImbalance = bidVolume / askVolume;
              const imbalanceThreshold = 1.5;

              if (bookImbalance > imbalanceThreshold) {
                buyProbability = 0.25;
                this.logger.log(simulationId, 'MarketCorrection', { type: 'imbalance', imbalance: bookImbalance, newBuyProb: buyProbability });
              } else if (bookImbalance < 1 / imbalanceThreshold) {
                buyProbability = 0.75;
                this.logger.log(simulationId, 'MarketCorrection', { type: 'imbalance', imbalance: bookImbalance, newBuyProb: buyProbability });
              }
            }

            const spreadRatio = spread / midPrice;
            const maxSpreadRatio = 0.02;
            if (spreadRatio > maxSpreadRatio) {
              isWideSpread = true;
              this.logger.log(simulationId, 'MarketCorrection', { type: 'widespread', spreadRatio, midPrice });
              buyProbability = 0.5;
            }
          }

          params.basePrice = midPrice;
          currentPrice = midPrice;
          params.spread = Math.max(0.01, spread);
        }
      }

      const batch: CryptoOrder[] = [];
      for (let i = 0; i < batchSize && orderCount < targetOrders; i++) {
        const isMarketOrder = Math.random() < params.marketOrderRatio;
        const isBuy = Math.random() < buyProbability;

        let orderPrice: number;
        if (isMarketOrder) {
          orderPrice = 0;
        } else {
          if (isWideSpread) {
            const priceOffset = (params.spread / 2) * Math.random();
            orderPrice = isBuy ? params.basePrice - priceOffset : params.basePrice + priceOffset;
          } else {
            const priceChange = currentPrice * (params.volatility * (Math.random() - 0.5) * 0.1);
            const spreadOffset = (params.spread / 2) * (1 + Math.random());
            orderPrice = isBuy ? currentPrice + priceChange - spreadOffset : currentPrice + priceChange + spreadOffset;
          }
        }

        let orderSize: number;
        const sizeRandom = Math.random();
        if (sizeRandom < 0.7) {
          orderSize = params.avgOrderSize * (0.1 + Math.random() * 0.4);
        } else if (sizeRandom < 0.95) {
          orderSize = params.avgOrderSize * (0.5 + Math.random() * 2);
        } else {
          orderSize = params.avgOrderSize * (5 + Math.random() * 20);
        }

        const order = createPooledOrder(pair, isBuy ? 'buy' : 'sell', isMarketOrder ? 'market' : 'limit', orderPrice.toString(), orderSize.toString(), `sim-user-${Math.floor(Math.random() * 1000)}`);
        this.logger.log(simulationId, 'OrderCreated', { ...order });
        batch.push(order);
        orderCount++;
      }

      try {
        const results = await Promise.allSettled(batch.map(order => this.sendOrderToMainServer(order, targetEndpoint)));
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulSends++;
          } else {
            this.logger.log(simulationId, 'OrderSendFailed', { orderId: batch[index].id, reason: result.reason });
          }
          releaseOrder(batch[index]);
        });

        status.ordersProcessed = orderCount;
        status.ordersSent = successfulSends;
        status.memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      } catch (error) {
        this.logger.log(simulationId, 'BatchError', { error: error.message });
      }

      if (orderCount < targetOrders && status.status === 'running') {
        const timeout = setTimeout(processBatch, batchDelay);
        this.simulationTimeouts.set(simulationId, timeout);
      } else {
        status.status = 'completed';
        status.endTime = Date.now();
        this.logger.log(simulationId, 'SimulationEnd', { ...status });
        this.simulationTimeouts.delete(simulationId);
      }
    };

    processBatch();
  }

  private async sendOrderToMainServer(order: CryptoOrder, endpoint: string): Promise<void> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CryptoTrade-Simulation-Server',
        'X-API-Key': process.env.SIMULATION_API_KEY || 'sim-server-key'
      },
      body: JSON.stringify({
        pair: order.pair,
        side: order.side,
        type: order.type,
        price: order.price,
        amount: order.amount,
        userId: order.userId
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
  }

  getSimulationStatus(simulationId: string): SimulationStatus | null {
    return this.activeSimulations.get(simulationId) || null;
  }

  getSimulationLogsCSV(simulationId: string): string | null {
    return this.logger.getLogsForSimulationAsCSV(simulationId);
  }

  stopSimulation(simulationId: string): boolean {
    const status = this.activeSimulations.get(simulationId);
    if (!status || status.status !== 'running') {
      return false;
    }

    status.status = 'completed';
    status.endTime = Date.now();

    const timeout = this.simulationTimeouts.get(simulationId);
    if (timeout) {
      clearTimeout(timeout);
      this.simulationTimeouts.delete(simulationId);
    }

    return true;
  }

  listActiveSimulations(): SimulationStatus[] {
    return Array.from(this.activeSimulations.values())
      .filter(status => status.status === 'running');
  }

  getAllSimulations(): SimulationStatus[] {
    return Array.from(this.activeSimulations.values());
  }

  getSystemStats() {
    const memUsage = process.memoryUsage();
    return {
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      poolSize: orderPool.getPoolSize(),
      activeSimulations: this.listActiveSimulations().length,
      totalSimulations: this.activeSimulations.size,
      uptime: Math.round(process.uptime())
    };
  }

  cleanup(simulationId?: string): void {
    if (simulationId) {
      this.activeSimulations.delete(simulationId);
      this.logger.cleanup(simulationId);
      const timeout = this.simulationTimeouts.get(simulationId);
      if (timeout) {
        clearTimeout(timeout);
        this.simulationTimeouts.delete(simulationId);
      }
    } else {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const [id, status] of this.activeSimulations.entries()) {
        if (status.status !== 'running' && status.endTime && status.endTime < oneHourAgo) {
          this.activeSimulations.delete(id);
          this.logger.cleanup(id);
        }
      }
    }
  }
}

export const simulationService = new SimulationService();

setInterval(() => {
  simulationService.cleanup();
}, 30 * 60 * 1000);
