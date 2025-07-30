import { EventEmitter } from 'events';
import { OrderBook } from './order-book';
import { CryptoOrder, CryptoTrade } from '../types/trading';
import { nanoid } from 'nanoid';

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

  /**
   * Creates a new matching engine with configurable fee structure
   * @param makerFeeRate - Fee rate for market makers (default 0.1%)
   * @param takerFeeRate - Fee rate for market takers (default 0.2%)
   */
  constructor(makerFeeRate: number = 0.001, takerFeeRate: number = 0.002) {
    super();
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
    const orderBook = this.getOrCreateOrderBook(order.pair);

    // Route to specific execution logic based on order type
    if (order.type === 'market') {
      this.executeMarketOrder(order, orderBook);  // Execute immediately at market prices
    } else {
      this.executeLimitOrder(order, orderBook);   // Execute with price constraints
    }
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
    let remainingAmount = order.amount;            // Track unfilled portion
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
      const matchAmount = Math.min(
        remainingAmount,                                    // What we still need
        counterOrder.amount - counterOrder.filledAmount    // What's available in counter order
      );

      if (matchAmount > 0) {
        const volume = matchAmount * bestLevel.price;
        totalVolume += volume;
        
        this.createTrade(order, counterOrder, bestLevel.price, matchAmount, volume);
        
        order.filledAmount += matchAmount;
        remainingAmount -= matchAmount;
        
        orderBook.updateOrderAmount(counterOrder.id, counterOrder.filledAmount + matchAmount);
        
        this.emit('orderUpdate', order);
        this.emit('orderUpdate', counterOrder);
      }
    }

    // Determine final order status based on fill amount
    if (order.filledAmount >= order.amount) {
      order.status = 'filled';      // Completely executed
    } else if (order.filledAmount > 0) {
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
    let remainingAmount = order.amount - order.filledAmount; // Handle partial fills from previous attempts
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
      const canMatch = isBuy
        ? bestLevel.price <= order.price    // Buy order: can match if ask price <= our bid
        : bestLevel.price >= order.price;   // Sell order: can match if bid price >= our ask

      // Stop matching if price constraint violated
      if (!canMatch) {
        break;  // Add remaining amount to order book
      }

      const counterOrder = bestLevel.orders[0]!;
      const matchAmount = Math.min(
        remainingAmount,
        counterOrder.amount - counterOrder.filledAmount
      );

      if (matchAmount > 0) {
        const volume = matchAmount * bestLevel.price;
        totalVolume += volume;
        
        this.createTrade(order, counterOrder, bestLevel.price, matchAmount, volume);
        
        order.filledAmount += matchAmount;
        remainingAmount -= matchAmount;
        
        orderBook.updateOrderAmount(counterOrder.id, counterOrder.filledAmount + matchAmount);
        
        this.emit('orderUpdate', order);
        this.emit('orderUpdate', counterOrder);
      }
    }

    if (order.filledAmount >= order.amount) {
      order.status = 'filled';
    } else {
      if (order.filledAmount > 0) {
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
    price: number,
    amount: number,
    volume: number
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
      makerFee: volume * this.makerFeeRate,    // Lower fee for liquidity provider
      takerFee: volume * this.takerFeeRate     // Higher fee for liquidity consumer
    };

    // Increment sequence counter for trade ordering
    this.tradeSequence++;
    
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
}