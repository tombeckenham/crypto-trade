import { SimulationRequest, SimulationStatus, CryptoOrder } from './types.js';
import { marketDataService } from './market-data.js';
import { createPooledOrder, releaseOrder, orderPool } from './object-pool.js';
import { nanoid } from 'nanoid';

export class SimulationService {
  private activeSimulations = new Map<string, SimulationStatus>();
  private simulationTimeouts = new Map<string, NodeJS.Timeout>();

  async startSimulation(request: SimulationRequest): Promise<{ simulationId: string; message: string }> {
    const simulationId = nanoid();
    
    // Fetch market data
    const marketPrice = await marketDataService.getCurrentPrice(request.pair);
    if (!marketPrice) {
      throw new Error('Failed to fetch market data');
    }

    const params = marketDataService.generateRealisticOrderParams(marketPrice);
    
    // Create simulation status
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

    // Start simulation in background
    this.runSimulation(simulationId, request, params).catch(error => {
      console.error(`Simulation ${simulationId} failed:`, error);
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
    
    // Optimized batch processing for high volumes
    const batchSize = Math.min(50, Math.max(5, ordersPerSecond / 100));
    const batchDelay = (1000 / ordersPerSecond) * batchSize;

    let currentPrice = params.basePrice;
    let orderCount = 0;
    let successfulSends = 0;

    const processBatch = async () => {
      if (status.status !== 'running' || orderCount >= targetOrders) {
        return;
      }

      const batch: CryptoOrder[] = [];
      
      // Generate batch of orders
      for (let i = 0; i < batchSize && orderCount < targetOrders; i++) {
        const isMarketOrder = Math.random() < params.marketOrderRatio;
        const isBuy = Math.random() < 0.5;
        
        // Realistic price variation
        const volatilityFactor = params.volatility * (Math.random() - 0.5) * 2;
        const meanReversion = (params.basePrice - currentPrice) * 0.05;
        const priceChange = currentPrice * (volatilityFactor * 0.05 + meanReversion * 0.01);
        
        let orderPrice: number;
        if (isMarketOrder) {
          orderPrice = 0;
        } else {
          const spreadMultiplier = (Math.random() - 0.5) * 6;
          const spreadOffset = params.spread * spreadMultiplier;
          orderPrice = Math.max(0.01, currentPrice + priceChange + spreadOffset);
        }

        // Realistic order sizes
        let orderSize: number;
        const sizeRandom = Math.random();
        if (sizeRandom < 0.7) {
          orderSize = params.avgOrderSize * (0.1 + Math.random() * 0.4);
        } else if (sizeRandom < 0.95) {
          orderSize = params.avgOrderSize * (0.5 + Math.random() * 2);
        } else {
          orderSize = params.avgOrderSize * (5 + Math.random() * 20);
        }
        
        const order = createPooledOrder(
          pair,
          isBuy ? 'buy' : 'sell',
          isMarketOrder ? 'market' : 'limit',
          orderPrice,
          orderSize,
          `sim-user-${Math.floor(Math.random() * 1000)}`
        );

        batch.push(order);
        orderCount++;
      }

      // Send batch to main trading server
      try {
        const results = await Promise.allSettled(
          batch.map(order => this.sendOrderToMainServer(order, targetEndpoint))
        );
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulSends++;
          } else {
            console.warn(`Failed to send order ${batch[index].id}:`, result.reason);
          }
          // Release order back to pool
          releaseOrder(batch[index]);
        });

        // Update status
        status.ordersProcessed = orderCount;
        status.ordersSent = successfulSends;
        status.memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

        // Memory monitoring
        if (status.memoryUsage > 1000) { // 1GB warning for simulation server
          console.warn(`Simulation ${simulationId}: High memory usage ${status.memoryUsage}MB`);
          if (global.gc) {
            global.gc();
          }
        }

      } catch (error) {
        console.error(`Batch processing failed for simulation ${simulationId}:`, error);
      }

      // Schedule next batch
      if (orderCount < targetOrders && status.status === 'running') {
        const timeout = setTimeout(processBatch, batchDelay);
        this.simulationTimeouts.set(simulationId, timeout);
      } else {
        // Simulation completed
        status.status = 'completed';
        status.endTime = Date.now();
        
        const duration = (status.endTime - status.startTime) / 1000;
        const actualRate = status.ordersSent / duration;
        
        console.log(`Simulation ${simulationId} completed:`);
        console.log(`- Orders processed: ${status.ordersProcessed}`);
        console.log(`- Orders sent: ${status.ordersSent}`);
        console.log(`- Duration: ${duration.toFixed(1)}s`);
        console.log(`- Actual rate: ${actualRate.toFixed(0)} orders/sec`);
        console.log(`- Success rate: ${((status.ordersSent / status.ordersProcessed) * 100).toFixed(1)}%`);
        
        // Cleanup
        this.simulationTimeouts.delete(simulationId);
        
        // Final memory cleanup
        if (global.gc) {
          global.gc();
        }
      }
    };

    // Start processing
    processBatch();
  }

  private async sendOrderToMainServer(order: CryptoOrder, endpoint: string): Promise<void> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CryptoTrade-Simulation-Server'
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

  stopSimulation(simulationId: string): boolean {
    const status = this.activeSimulations.get(simulationId);
    if (!status || status.status !== 'running') {
      return false;
    }

    status.status = 'completed';
    status.endTime = Date.now();
    
    // Clear timeout
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

  // Cleanup completed simulations older than 1 hour
  cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [id, status] of this.activeSimulations.entries()) {
      if (status.status !== 'running' && status.endTime && status.endTime < oneHourAgo) {
        this.activeSimulations.delete(id);
        console.log(`Cleaned up old simulation ${id}`);
      }
    }
  }
}

export const simulationService = new SimulationService();

// Cleanup every 30 minutes
setInterval(() => {
  simulationService.cleanup();
}, 30 * 60 * 1000);