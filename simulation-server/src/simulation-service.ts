/**
 * SimulationService - Core service for managing high-performance trading simulations
 * 
 * This service orchestrates the entire simulation lifecycle including:
 * - Market data fetching and price discovery
 * - Initial liquidity seeding for realistic market conditions
 * - High-frequency order generation with realistic market dynamics
 * - Performance monitoring and logging
 * - Resource management and cleanup
 */

import { SimulationRequest, SimulationStatus, MarketPrice } from './types';
import { CryptoOrder, MarketDepth } from '@shared/types/trading';
import { marketDataService } from './market-data';
import { createPooledOrder, releaseOrder, orderPool } from './object-pool';
import { nanoid } from 'nanoid';
import { SimulationLogger } from './simulation-logger';

/**
 * Main simulation service class that handles all simulation operations
 */
export class SimulationService {
  // Map of active simulation IDs to their current status
  private activeSimulations = new Map<string, SimulationStatus>();
  // Map of simulation IDs to their batch processing timeouts for cleanup
  private simulationTimeouts = new Map<string, NodeJS.Timeout>();
  // Centralized logger for all simulation events
  private logger = new SimulationLogger();

  /**
   * Starts a new trading simulation with the specified parameters
   * 
   * @param request - Configuration for the simulation including rate, duration, pair, and target
   * @returns Simulation ID and status message
   * 
   * Flow:
   * 1. Fetches current market state from the target server
   * 2. Seeds initial liquidity to create realistic order book depth
   * 3. Begins continuous order generation at the specified rate
   */
  async startSimulation(request: SimulationRequest): Promise<{ simulationId: string; message: string }> {
    // Generate unique simulation ID
    const simulationId = nanoid();
    this.logger.log(simulationId, 'SimulationStart', { ...request });

    try {
      // Extract base endpoint from the orders endpoint
      const baseEndpoint = request.targetEndpoint.replace('/api/orders', '');
      // Attempt to fetch current order book state from target server
      const orderBook = await this.getCurrentOrderBook(request.pair, baseEndpoint);
      let marketPrice: MarketPrice;
      let params;

      // Use order book data if available for more realistic pricing
      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        // Calculate market metrics from order book
        const bestBid = parseFloat(orderBook.bids[0].price);
        const bestAsk = parseFloat(orderBook.asks[0].price);
        const midPrice = (bestBid + bestAsk) / 2;

        this.logger.log(simulationId, 'MarketState', { source: 'orderbook', midPrice, bestBid, bestAsk });

        // Construct market price object from order book data
        marketPrice = {
          symbol: request.pair,
          price: midPrice,
          bid: bestBid,
          ask: bestAsk,
          high24h: midPrice * 1.05, // Estimated 5% daily high
          low24h: midPrice * 0.95, // Estimated 5% daily low
          volume24h: 0,
          change24h: 0,
          changePercent24h: 0
        };

        params = marketDataService.generateRealisticOrderParams(marketPrice);
      } else {
        // Fallback to external market data if order book is unavailable
        const fetchedMarketPrice = await marketDataService.getCurrentPrice(request.pair);
        if (!fetchedMarketPrice) {
          throw new Error('Failed to fetch market data');
        }
        marketPrice = fetchedMarketPrice;
        this.logger.log(simulationId, 'MarketState', { source: 'external', price: marketPrice.price });
        params = marketDataService.generateRealisticOrderParams(marketPrice);
      }

      // Initialize simulation status tracking object
      const status: SimulationStatus = {
        id: simulationId,
        status: 'running',
        ordersProcessed: 0,
        ordersSent: 0,
        startTime: Date.now(),
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        parameters: request
      };

      // Register simulation as active
      this.activeSimulations.set(simulationId, status);
      // Seed initial orders to create realistic market depth
      await this.seedInitialLiquidity(simulationId, request, params);
      // Start the main simulation loop asynchronously
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

  /**
   * Fetches the current order book state from the target server
   * 
   * @param pair - Trading pair symbol
   * @param baseEndpoint - Base URL of the target server
   * @returns Order book data or null if unavailable
   */
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

  /**
   * Seeds initial liquidity by placing limit orders on both sides of the order book
   * 
   * Creates 20 bid and 20 ask orders at different price levels to establish
   * realistic market depth before starting the main simulation.
   * 
   * @param simulationId - ID of the current simulation
   * @param request - Original simulation request parameters
   * @param params - Market parameters for order generation
   */
  private async seedInitialLiquidity(
    simulationId: string,
    request: SimulationRequest,
    params: { basePrice: number; spread: number; volatility: number; avgOrderSize: number; marketOrderRatio: number }
  ): Promise<void> {
    const { pair, targetEndpoint } = request;
    const seedOrders: CryptoOrder[] = [];

    this.logger.log(simulationId, 'SeedingLiquidity', { count: 20, basePrice: params.basePrice, spread: params.spread });

    // Generate 20 levels of bids and asks
    for (let i = 1; i <= 20; i++) {
      // Place bids below the base price with increasing distance
      const bidPrice = params.basePrice - (params.spread * i * 0.5);
      const bidSize = params.avgOrderSize * (1 + Math.random() * 2);
      const bidOrder = createPooledOrder(pair, 'buy', 'limit', bidPrice.toString(), bidSize.toString(), `seed-user-${Math.floor(Math.random() * 1000)}`);
      seedOrders.push(bidOrder);

      // Place asks above the base price with increasing distance
      const askPrice = params.basePrice + (params.spread * i * 0.5);
      const askSize = params.avgOrderSize * (1 + Math.random() * 2);
      const askOrder = createPooledOrder(pair, 'sell', 'limit', askPrice.toString(), askSize.toString(), `seed-user-${Math.floor(Math.random() * 1000)}`);
      seedOrders.push(askOrder);
    }

    try {
      // Send all seed orders in parallel for efficiency
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
      this.logger.log(simulationId, 'SeedingError', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Main simulation loop that generates and sends orders at the specified rate
   * 
   * This method implements sophisticated market dynamics including:
   * - Adaptive pricing based on order book state
   * - Market imbalance detection and correction
   * - Realistic order size distribution
   * - Dynamic market/limit order ratios
   * 
   * @param simulationId - ID of the current simulation
   * @param request - Original simulation request parameters
   * @param params - Market parameters for order generation
   */
  private async runSimulation(
    simulationId: string,
    request: SimulationRequest,
    params: { basePrice: number; spread: number; volatility: number; avgOrderSize: number; marketOrderRatio: number }
  ): Promise<void> {
    const status = this.activeSimulations.get(simulationId);
    if (!status) return;

    const { ordersPerSecond, durationSeconds, pair, targetEndpoint } = request;
    const targetOrders = ordersPerSecond * durationSeconds;

    // Calculate optimal batch size based on order rate
    // Batch processing improves efficiency for high-frequency simulations
    const batchSize = Math.min(50, Math.max(5, ordersPerSecond / 100));
    const batchDelay = (1000 / ordersPerSecond) * batchSize;

    let currentPrice = params.basePrice;
    let orderCount = 0;
    let successfulSends = 0;

    /**
     * Process a batch of orders and schedule the next batch
     * This recursive function drives the simulation forward
     */
    const processBatch = async () => {
      // Check if simulation should continue
      if (status.status !== 'running' || orderCount >= targetOrders) {
        return;
      }

      // Fetch current market state for adaptive order generation
      const baseEndpoint = targetEndpoint.replace('/api/orders', '');
      const orderBook = await this.getCurrentOrderBook(pair, baseEndpoint);

      // Default slightly bullish market (52% buy vs 48% sell)
      let buyProbability = 0.52;
      let isWideSpread = false;

      // Adapt order generation based on current order book state
      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBid = parseFloat(orderBook.bids[0].price);
        const bestAsk = parseFloat(orderBook.asks[0].price);

        if (bestBid > 0 && bestAsk > 0) {
          const midPrice = (bestBid + bestAsk) / 2;
          const spread = bestAsk - bestBid;

          // Handle crossed market (bid >= ask) - unusual market condition
          if (bestBid >= bestAsk) {
            this.logger.log(simulationId, 'MarketCorrection', { type: 'crossed', bestBid, bestAsk });
            // Use only market orders to resolve crossed market
            params.marketOrderRatio = 1.0;
            buyProbability = 0.5;
          } else {
            params.marketOrderRatio = Math.max(0.1, Math.min(0.25, params.volatility * 20));
            // Calculate total volume on each side of the order book
            const bidVolume = orderBook.bids.reduce((sum, level) => sum + parseFloat(level.amount), 0);
            const askVolume = orderBook.asks.reduce((sum, level) => sum + parseFloat(level.amount), 0);

            // Detect and correct order book imbalances
            if (askVolume > 0) {
              const bookImbalance = bidVolume / askVolume;
              const imbalanceThreshold = 1.5;

              // Too many bids - increase selling pressure
              if (bookImbalance > imbalanceThreshold) {
                buyProbability = 0.25;
                this.logger.log(simulationId, 'MarketCorrection', { type: 'imbalance', imbalance: bookImbalance, newBuyProb: buyProbability });
              }
              // Too many asks - increase buying pressure
              else if (bookImbalance < 1 / imbalanceThreshold) {
                buyProbability = 0.75;
                this.logger.log(simulationId, 'MarketCorrection', { type: 'imbalance', imbalance: bookImbalance, newBuyProb: buyProbability });
              }
            }

            // Detect abnormally wide spreads (>2% of price)
            const spreadRatio = spread / midPrice;
            const maxSpreadRatio = 0.02;
            if (spreadRatio > maxSpreadRatio) {
              isWideSpread = true;
              this.logger.log(simulationId, 'MarketCorrection', { type: 'widespread', spreadRatio, midPrice });
              // Place orders inside the spread to tighten it
              buyProbability = 0.5;
            }
          }

          params.basePrice = midPrice;
          currentPrice = midPrice;
          params.spread = Math.max(0.01, spread);
        }
      }

      // Generate a batch of orders
      const batch: CryptoOrder[] = [];
      for (let i = 0; i < batchSize && orderCount < targetOrders; i++) {
        // Determine order type and side based on probabilities
        const isMarketOrder = Math.random() < params.marketOrderRatio;
        const isBuy = Math.random() < buyProbability;

        // Calculate order price
        let orderPrice: number;
        if (isMarketOrder) {
          // Market orders don't specify price
          orderPrice = 0;
        } else {
          if (isWideSpread) {
            // Place orders inside the spread to tighten it
            const priceOffset = (params.spread / 2) * Math.random();
            orderPrice = isBuy ? params.basePrice - priceOffset : params.basePrice + priceOffset;
          } else {
            // Normal market conditions - add volatility and spread
            const priceChange = currentPrice * (params.volatility * (Math.random() - 0.5) * 0.1);
            const spreadOffset = (params.spread / 2) * (1 + Math.random());
            orderPrice = isBuy ? currentPrice + priceChange - spreadOffset : currentPrice + priceChange + spreadOffset;
          }
        }

        // Generate realistic order size distribution
        let orderSize: number;
        const sizeRandom = Math.random();
        if (sizeRandom < 0.7) {
          // 70% small orders (10-50% of average)
          orderSize = params.avgOrderSize * (0.1 + Math.random() * 0.4);
        } else if (sizeRandom < 0.95) {
          // 25% medium orders (50-250% of average)
          orderSize = params.avgOrderSize * (0.5 + Math.random() * 2);
        } else {
          // 5% large orders (5-25x average) - whale trades
          orderSize = params.avgOrderSize * (5 + Math.random() * 20);
        }

        // Create order using object pool for efficiency
        const order = createPooledOrder(
          pair,
          isBuy ? 'buy' : 'sell',
          isMarketOrder ? 'market' : 'limit',
          orderPrice.toString(),
          orderSize.toString(),
          `sim-user-${Math.floor(Math.random() * 1000)}`
        );
        this.logger.log(simulationId, 'OrderCreated', { ...order });
        batch.push(order);
        orderCount++;
      }

      try {
        // Send all orders in the batch concurrently
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
        this.logger.log(simulationId, 'BatchError', { error: error.message, stack: error.stack });
      }

      // Schedule next batch or complete simulation
      if (orderCount < targetOrders && status.status === 'running') {
        // Schedule next batch processing
        const timeout = setTimeout(processBatch, batchDelay);
        this.simulationTimeouts.set(simulationId, timeout);
      } else {
        // Simulation complete
        status.status = 'completed';
        status.endTime = Date.now();
        this.logger.log(simulationId, 'SimulationEnd', { ...status });
        this.simulationTimeouts.delete(simulationId);
      }
    };

    processBatch();
  }

  /**
   * Sends an order to the target trading server
   * 
   * @param order - Order to send
   * @param endpoint - Target server endpoint URL
   * @throws Error if the order submission fails
   */
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
      const errorBody = await response.text();
      console.error(`Failed to send order. Status: ${response.status}, Body: ${errorBody}`);
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }
  }

  /**
   * Retrieves the current status of a simulation
   * 
   * @param simulationId - ID of the simulation to query
   * @returns Current simulation status or null if not found
   */
  getSimulationStatus(simulationId: string): SimulationStatus | null {
    return this.activeSimulations.get(simulationId) || null;
  }

  /**
   * Exports simulation logs in CSV format for analysis
   * 
   * @param simulationId - ID of the simulation
   * @returns CSV formatted logs or null if not found
   */
  getSimulationLogsCSV(simulationId: string): string | null {
    return this.logger.getLogsForSimulationAsCSV(simulationId);
  }

  /**
   * Stops a running simulation gracefully
   * 
   * @param simulationId - ID of the simulation to stop
   * @returns true if successfully stopped, false if not found or already stopped
   */
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

  /**
   * Lists all currently running simulations
   * 
   * @returns Array of active simulation statuses
   */
  listActiveSimulations(): SimulationStatus[] {
    return Array.from(this.activeSimulations.values())
      .filter(status => status.status === 'running');
  }

  /**
   * Lists all simulations regardless of status
   * 
   * @returns Array of all simulation statuses
   */
  getAllSimulations(): SimulationStatus[] {
    return Array.from(this.activeSimulations.values());
  }

  /**
   * Collects system-wide statistics for monitoring
   * 
   * @returns Object containing memory usage, pool stats, and simulation counts
   */
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

  /**
   * Cleans up resources for completed simulations
   * 
   * @param simulationId - Optional specific simulation to clean up
   * 
   * If no ID provided, removes all simulations that completed over an hour ago
   * to prevent memory leaks while keeping recent history available.
   */
  cleanup(simulationId?: string): void {
    if (simulationId) {
      // Clean up specific simulation
      this.activeSimulations.delete(simulationId);
      this.logger.cleanup(simulationId);
      const timeout = this.simulationTimeouts.get(simulationId);
      if (timeout) {
        clearTimeout(timeout);
        this.simulationTimeouts.delete(simulationId);
      }
    } else {
      // Clean up old completed simulations (>1 hour)
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

// Export singleton instance
export const simulationService = new SimulationService();

// Schedule periodic cleanup every 30 minutes to prevent memory leaks
setInterval(() => {
  simulationService.cleanup();
}, 30 * 60 * 1000);
