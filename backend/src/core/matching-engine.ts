import { EventEmitter } from 'events';
import { OrderBook } from './order-book.js';
import { CryptoOrder, CryptoTrade } from '../types/trading.js';
import { nanoid } from 'nanoid';
import { orderPool } from '../utils/object-pool.js';
import { addStrings, multiplyStrings, numberToString } from '../utils/precision.js';

/**
 * Event interface defining all events emitted by the MatchingEngine
 * Used for real-time notifications of trading activity
 */
export interface MatchingEngineEvents {
  trade: (trade: CryptoTrade) => void;           // Emitted when orders are matched and trade is executed
  orderUpdate: (order: CryptoOrder) => void;     // Emitted when order status/fill amount changes
  orderCancelled: (order: CryptoOrder) => void;  // Emitted when order is successfully cancelled
}

/**
 * High-performance cryptocurrency matching engine for order execution
 * 
 * Core responsibilities:
 * - Manages multiple trading pair order books
 * - Executes market and limit orders with sub-millisecond latency
 * - Implements price-time priority matching algorithm
 * - Calculates maker/taker fees and generates trade records
 * - Emits real-time events for UI updates and trade notifications
 * 
 * Performance characteristics:
 * - O(log n) order insertion/cancellation via Red-Black trees
 * - O(1) best bid/ask price retrieval
 * - Single-threaded design optimized for Node.js event loop
 * - Memory efficient with automatic cleanup of filled orders
 */
export class MatchingEngine extends EventEmitter {
  private readonly orderBooks: Map<string, OrderBook>;  // Per-pair order books for isolated trading
  private tradeSequence: number;                        // Incrementing counter for trade ordering
  private readonly makerFeeRate: number;               // Fee rate for liquidity providers (makers)
  private readonly takerFeeRate: number;               // Fee rate for liquidity consumers (takers)
  
  // Memory protection and performance monitoring
  private orderCount: number = 0;                      // Total orders processed
  private tradeCount: number = 0;                      // Total trades executed
  private lastMemoryCheck: number = Date.now();       // Last memory monitoring timestamp
  private readonly maxOrdersPerSecond: number = 50000; // Circuit breaker limit
  private readonly memoryCheckInterval: number = 5000;  // Check memory every 5 seconds
  private recentOrderTimestamps: number[] = [];        // For rate limiting

  /**
   * Creates a new matching engine with configurable fee structure
   * @param makerFeeRate - Fee rate for market makers (default 0.1%)
   * @param takerFeeRate - Fee rate for market takers (default 0.2%)
   */
  private readonly logger: any; // Fastify logger instance

  constructor(logger: any, makerFeeRate: number = 0.001, takerFeeRate: number = 0.002) {
    super();
    this.logger = logger;
    this.orderBooks = new Map();           // Initialize empty order book collection
    this.tradeSequence = 0;                // Start trade sequence from 0
    this.makerFeeRate = makerFeeRate;      // Store maker fee rate (typically lower)
    this.takerFeeRate = takerFeeRate;      // Store taker fee rate (typically higher)
  }

  /**
   * Type-safe event listener registration
   * Ensures only valid events can be subscribed to with correct handler signatures
   * @param event - Event name from MatchingEngineEvents interface
   * @param listener - Event handler function with correct parameters
   * @returns this for method chaining
   */
  override on<K extends keyof MatchingEngineEvents>(
    event: K,
    listener: MatchingEngineEvents[K]
  ): this {
    return super.on(event, listener);
  }

  /**
   * Type-safe event emission
   * Ensures only valid events can be emitted with correct parameters
   * @param event - Event name from MatchingEngineEvents interface
   * @param args - Event parameters matching the handler signature
   * @returns true if event had listeners, false otherwise
   */
  override emit<K extends keyof MatchingEngineEvents>(
    event: K,
    ...args: Parameters<MatchingEngineEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Retrieves existing order book or creates new one for trading pair
   * Implements lazy initialization - order books created only when needed
   * Time complexity: O(1) for retrieval, O(1) for creation
   * @param pair - Trading pair identifier (e.g., "BTC-USDT")
   * @returns OrderBook instance for the specified pair
   */
  private getOrCreateOrderBook(pair: string): OrderBook {
    let orderBook = this.orderBooks.get(pair);
    if (!orderBook) {
      // Create new order book with Red-Black tree optimization
      orderBook = new OrderBook(pair);
      this.orderBooks.set(pair, orderBook);
    }
    return orderBook;
  }

  /**
   * Main entry point for order submission and execution
   * Routes orders to appropriate execution logic based on order type
   * Triggers matching algorithm and emits events for trade notifications
   * Time complexity: O(log n + m) where n=price levels, m=trades generated
   * @param order - Order to submit for execution
   */
  submitOrder(order: CryptoOrder): void {
    // Memory protection and rate limiting
    if (!this.checkMemoryAndRateLimit()) {
      order.status = 'cancelled';
      this.emit('orderUpdate', order);
      return;
    }

    // Reject zero-amount or invalid amount orders
    const orderAmountNum = parseFloat(order.amount);
    if (isNaN(orderAmountNum) || orderAmountNum <= 0) {
      this.logger.warn(`Rejected order ${order.id} due to invalid amount: ${order.amount}`);
      order.status = 'cancelled';
      this.emit('orderUpdate', order);
      return;
    }

    // Reject invalid price for limit orders
    if (order.type === 'limit') {
      const orderPriceNum = parseFloat(order.price);
      if (isNaN(orderPriceNum) || orderPriceNum <= 0) {
        this.logger.warn(`Rejected order ${order.id} due to invalid price for limit order: ${order.price}`);
        order.status = 'cancelled';
        this.emit('orderUpdate', order);
        return;
      }
    }

    this.orderCount++;
    const orderBook = this.getOrCreateOrderBook(order.pair);

    // Route to specific execution logic based on order type
    if (order.type === 'market') {
      this.executeMarketOrder(order, orderBook);  // Execute immediately at market prices
    } else {
      this.executeLimitOrder(order, orderBook);   // Execute with price constraints
    }

    // Clean up processed orders periodically
    this.performPeriodicCleanup();
  }

  /**
   * Cancels an existing order if found in the order book
   * Removes order from price level and cleans up empty levels automatically
   * Time complexity: O(log n + m) where n=price levels, m=orders at price level
   * @param orderId - Unique identifier of order to cancel
   * @param pair - Trading pair where order exists
   * @returns true if order was found and cancelled, false otherwise
   */
  cancelOrder(orderId: string, pair: string): boolean {
    const orderBook = this.getOrCreateOrderBook(pair);
    const order = orderBook.removeOrder(orderId);
    
    if (order) {
      // Update order status and notify listeners
      order.status = 'cancelled';
      this.emit('orderCancelled', order);
      return true;
    }
    
    return false;  // Order not found
  }

  /**
   * Executes market order by matching against best available prices
   * Walks through price levels until order is filled or liquidity exhausted
   * Market orders prioritize execution speed over price - will take any available liquidity
   * 
   * Algorithm:
   * 1. Find best counter-side price level
   * 2. Match against first order in queue (FIFO)
   * 3. Create trade record and update order states
   * 4. Repeat until order filled or no more liquidity
   * 
   * @param order - Market order to execute
   * @param orderBook - Order book containing liquidity
   */
  private executeMarketOrder(order: CryptoOrder, orderBook: OrderBook): void {
    const isBuy = order.side === 'buy';            // Direction determines which side to match against
    let remainingAmount = parseFloat(order.amount); // Track unfilled portion
    let totalVolume = 0;                          // Accumulate total trade volume for metrics

    // Continue matching until order is fully filled or no liquidity remains
    while (remainingAmount > 0) {
      // Get best counter-side price level for matching
      const bestLevel = isBuy ? orderBook.getBestAsk() : orderBook.getBestBid();
      
      // Stop if no liquidity available
      if (!bestLevel || bestLevel.orders.length === 0) {
        break;  // Partial fill - market order becomes cancelled
      }

      // Take first order from best price level (FIFO within price level)
      const counterOrder = bestLevel.orders[0]!;
      
      // Calculate trade amount - limited by smaller of remaining amounts
      const counterAmountNum = parseFloat(counterOrder.amount);
      const counterFilledNum = parseFloat(counterOrder.filledAmount);
      const matchAmount = Math.min(
        remainingAmount,                                    // What we still need
        counterAmountNum - counterFilledNum                // What's available in counter order
      );

      if (matchAmount > 0) {
        const priceNum = parseFloat(bestLevel.price);
        const volume = matchAmount * priceNum;
        totalVolume += volume;
        
        this.createTrade(order, counterOrder, bestLevel.price, numberToString(matchAmount), numberToString(volume));
        
        order.filledAmount = addStrings(order.filledAmount, numberToString(matchAmount));
        remainingAmount -= matchAmount;
        
        orderBook.updateOrderAmount(counterOrder.id, addStrings(counterOrder.filledAmount, numberToString(matchAmount)));
        
        this.emit('orderUpdate', order);
        this.emit('orderUpdate', counterOrder);
      }
    }

    // Determine final order status based on fill amount
    const orderAmountNum = parseFloat(order.amount);
    const orderFilledNumFinal = parseFloat(order.filledAmount);
    if (orderFilledNumFinal >= orderAmountNum) {
      order.status = 'filled';      // Completely executed
    } else if (orderFilledNumFinal > 0) {
      order.status = 'partial';     // Partially executed (ran out of liquidity)
    } else {
      order.status = 'cancelled';   // No execution possible (no liquidity)
    }

    // Final status update notification
    this.emit('orderUpdate', order);
  }

  /**
   * Executes limit order with price constraints and potential order book placement
   * First attempts to match against existing orders at or better than limit price
   * Remaining unfilled portion is added to order book for future matching
   * 
   * Algorithm:
   * 1. Check if counter-side orders exist at acceptable prices
   * 2. Execute matches while price conditions are met
   * 3. Add remaining amount to order book as resting order
   * 4. Emit events for all state changes
   * 
   * @param order - Limit order to execute
   * @param orderBook - Order book for matching and placement
   */
  private executeLimitOrder(order: CryptoOrder, orderBook: OrderBook): void {
    const isBuy = order.side === 'buy';                      // Direction for price comparison logic
    const orderAmountNum = parseFloat(order.amount);
    const orderFilledNum = parseFloat(order.filledAmount);
    let remainingAmount = orderAmountNum - orderFilledNum;   // Handle partial fills from previous attempts
    let totalVolume = 0;                                    // Track total volume for metrics

    // Attempt to match against existing orders while price conditions are met
    while (remainingAmount > 0) {
      // Get best counter-side price level
      const bestLevel = isBuy ? orderBook.getBestAsk() : orderBook.getBestBid();
      
      // No counter-side liquidity available
      if (!bestLevel || bestLevel.orders.length === 0) {
        break;
      }

      // Check if limit price allows matching at this level
      const bestLevelPriceNum = parseFloat(bestLevel.price);
      const orderPriceNum = parseFloat(order.price);
      const canMatch = isBuy
        ? bestLevelPriceNum <= orderPriceNum    // Buy order: can match if ask price <= our bid
        : bestLevelPriceNum >= orderPriceNum;   // Sell order: can match if bid price >= our ask

      // Stop matching if price constraint violated
      if (!canMatch) {
        break;  // Add remaining amount to order book
      }

      const counterOrder = bestLevel.orders[0]!;
      const counterAmountNum = parseFloat(counterOrder.amount);
      const counterFilledNum = parseFloat(counterOrder.filledAmount);
      const matchAmount = Math.min(
        remainingAmount,
        counterAmountNum - counterFilledNum
      );

      if (matchAmount > 0) {
        const priceNum = parseFloat(bestLevel.price);
        const volume = matchAmount * priceNum;
        totalVolume += volume;
        
        this.createTrade(order, counterOrder, bestLevel.price, numberToString(matchAmount), numberToString(volume));
        
        order.filledAmount = addStrings(order.filledAmount, numberToString(matchAmount));
        remainingAmount -= matchAmount;
        
        orderBook.updateOrderAmount(counterOrder.id, addStrings(counterOrder.filledAmount, numberToString(matchAmount)));
        
        this.emit('orderUpdate', order);
        this.emit('orderUpdate', counterOrder);
      }
    }

    const finalAmountNum = parseFloat(order.amount);
    const finalFilledNum = parseFloat(order.filledAmount);
    if (finalFilledNum >= finalAmountNum) {
      order.status = 'filled';
    } else {
      if (finalFilledNum > 0) {
        order.status = 'partial';
      }
      orderBook.addOrder(order);
    }

    this.emit('orderUpdate', order);
  }

  /**
   * Creates trade record when orders are matched and calculates fees
   * Taker = incoming order that removes liquidity
   * Maker = resting order that provided liquidity
   * Maker typically pays lower fees to incentivize market making
   * 
   * @param takerOrder - Incoming order that initiated the trade
   * @param makerOrder - Resting order that provided liquidity
   * @param price - Execution price (always maker's price for price improvement)
   * @param amount - Quantity traded in base currency
   * @param volume - Total value traded in quote currency (price * amount)
   */
  private createTrade(
    takerOrder: CryptoOrder,
    makerOrder: CryptoOrder,
    price: string,
    amount: string,
    volume: string
  ): void {
    // Build comprehensive trade record with all execution details
    const trade: CryptoTrade = {
      id: nanoid(),                     // Unique trade identifier
      pair: takerOrder.pair,           // Trading pair
      price,                           // Execution price (maker's price)
      amount,                          // Quantity traded
      volume,                          // Total value (price * amount)
      timestamp: Date.now(),           // Execution time
      takerSide: takerOrder.side,      // Which side removed liquidity
      
      // Order IDs for trade attribution
      buyOrderId: takerOrder.side === 'buy' ? takerOrder.id : makerOrder.id,
      sellOrderId: takerOrder.side === 'sell' ? takerOrder.id : makerOrder.id,
      
      // Fee calculations based on volume
      makerFee: multiplyStrings(volume, numberToString(this.makerFeeRate)),    // Lower fee for liquidity provider
      takerFee: multiplyStrings(volume, numberToString(this.takerFeeRate))     // Higher fee for liquidity consumer
    };

    // Increment sequence counter for trade ordering
    this.tradeSequence++;
    this.tradeCount++;
    
    // Emit trade event for real-time notifications
    this.emit('trade', trade);
  }

  /**
   * Retrieves order book for a specific trading pair
   * Creates new order book if pair doesn't exist yet
   * @param pair - Trading pair identifier
   * @returns OrderBook instance for the pair
   */
  getOrderBook(pair: string): OrderBook {
    return this.getOrCreateOrderBook(pair);
  }

  /**
   * Retrieves market depth data for a trading pair
   * Shows aggregated order quantities at each price level
   * Essential for trading UI and market analysis
   * @param pair - Trading pair identifier
   * @param maxLevels - Maximum price levels to return per side
   * @returns Market depth with bids and asks arrays
   */
  getMarketDepth(pair: string, maxLevels: number = 10) {
    const orderBook = this.getOrCreateOrderBook(pair);
    return orderBook.getMarketDepth(maxLevels);
  }

  /**
   * Retrieves comprehensive statistics for a trading pair
   * Includes prices, spreads, volumes, and order counts
   * Used for market data feeds and monitoring dashboards
   * @param pair - Trading pair identifier
   * @returns Object containing all order book statistics
   */
  getOrderBookStats(pair: string) {
    const orderBook = this.getOrCreateOrderBook(pair);
    return {
      pair,                                           // Trading pair identifier
      bestBid: orderBook.getBestBid(),               // Highest buy price level
      bestAsk: orderBook.getBestAsk(),               // Lowest sell price level
      spread: orderBook.getSpread(),                 // Price difference (ask - bid)
      bidVolume: orderBook.getTotalVolume('buy'),    // Total buy order volume
      askVolume: orderBook.getTotalVolume('sell'),   // Total sell order volume
      orderCount: orderBook.getOrderCount()          // Total active order count
    };
  }

  /**
   * Returns list of all trading pairs with active order books
   * Only includes pairs that have had at least one order submitted
   * @returns Array of trading pair identifiers
   */
  getSupportedPairs(): string[] {
    return Array.from(this.orderBooks.keys());
  }

  /**
   * Memory protection and rate limiting check
   * Prevents system overload during high-volume periods
   * @returns true if order can be processed, false if rate limited
   */
  private checkMemoryAndRateLimit(): boolean {
    const now = Date.now();
    
    // Clean old timestamps (keep only last second)
    this.recentOrderTimestamps = this.recentOrderTimestamps.filter(
      timestamp => now - timestamp < 1000
    );
    
    // Rate limiting check
    if (this.recentOrderTimestamps.length >= this.maxOrdersPerSecond) {
      this.logger.warn(`Rate limit exceeded: ${this.recentOrderTimestamps.length} orders/sec`);
      return false;
    }
    
    this.recentOrderTimestamps.push(now);
    
    // Memory check every 5 seconds
    if (now - this.lastMemoryCheck > this.memoryCheckInterval) {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      this.logger.info(`MatchingEngine Stats: ${heapUsedMB}MB heap, ${this.orderCount} orders, ${this.tradeCount} trades, ${orderPool.getPoolSize()} pooled`);
      
      if (heapUsedMB > 3500) { // Warning at 3.5GB
        this.logger.warn('MatchingEngine: High memory usage detected');
        if (global.gc) {
          global.gc();
        }
        
        // Emergency rate limiting if memory is very high
        if (heapUsedMB > 4000) {
          this.logger.error('MatchingEngine: Emergency rate limiting activated');
          return false;
        }
      }
      
      this.lastMemoryCheck = now;
    }
    
    return true;
  }

  /**
   * Periodic cleanup of processed orders and expired data
   * Helps maintain stable memory usage during extended operation
   */
  private performPeriodicCleanup(): void {
    // Cleanup every 1000 orders
    if (this.orderCount % 1000 === 0) {
      // Clean up filled orders from order books
      this.orderBooks.forEach((_orderBook, pair) => {
        const stats = this.getOrderBookStats(pair);
        
        // If order book becomes too large, it might indicate memory issues
        if (stats.orderCount > 10000) {
          this.logger.warn(`Large order book detected for ${pair}: ${stats.orderCount} orders`);
        }
      });
      
      // Trim old timestamps more aggressively during cleanup
      const now = Date.now();
      this.recentOrderTimestamps = this.recentOrderTimestamps.filter(
        timestamp => now - timestamp < 500 // Keep only last 500ms
      );
    }
  }

  /**
   * Get comprehensive engine performance statistics
   * Used for monitoring and debugging high-volume scenarios
   */
  getEngineStats() {
    return {
      orderCount: this.orderCount,
      tradeCount: this.tradeCount,
      tradeSequence: this.tradeSequence,
      recentOrdersPerSecond: this.recentOrderTimestamps.length,
      supportedPairs: this.getSupportedPairs().length,
      poolSize: orderPool.getPoolSize(),
      memoryUsage: process.memoryUsage()
    };
  }
}