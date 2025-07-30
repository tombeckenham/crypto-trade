import { RedBlackTree } from './red-black-tree.js';
import { CryptoOrder, OrderBookLevel, MarketDepth, OrderSide } from '../types/trading.js';

/**
 * High-performance order book implementation for cryptocurrency trading
 * Uses Red-Black trees for O(log n) price level operations and maintains
 * separate bid/ask sides with efficient order matching capabilities
 * 
 * Key features:
 * - Sub-millisecond order insertion/removal
 * - Efficient best bid/ask price retrieval
 * - Real-time market depth calculation
 * - Automatic order status management
 */
export class OrderBook {
  private readonly pair: string;                                    // Trading pair (e.g., "BTC-USDT")
  private readonly bids: RedBlackTree<number, OrderBookLevel>;     // Buy orders (descending price order)
  private readonly asks: RedBlackTree<number, OrderBookLevel>;     // Sell orders (ascending price order)
  private readonly orderMap: Map<string, CryptoOrder>;             // Fast O(1) order lookup by ID
  private lastUpdateTime: number;                                   // Timestamp of last modification

  constructor(pair: string) {
    this.pair = pair;
    this.bids = new RedBlackTree<number, OrderBookLevel>((a, b) => b - a);
    this.asks = new RedBlackTree<number, OrderBookLevel>((a, b) => a - b);
    this.orderMap = new Map();
    this.lastUpdateTime = Date.now();
  }

  addOrder(order: CryptoOrder): void {
    if (this.orderMap.has(order.id)) {
      throw new Error(`Order ${order.id} already exists`);
    }

    const tree = order.side === 'buy' ? this.bids : this.asks;
    let level = tree.find(order.price);

    if (!level) {
      level = {
        price: order.price,
        amount: 0,
        total: 0,
        orders: []
      };
      tree.insert(order.price, level);
    }

    level.orders.push(order);
    level.amount += order.amount - order.filledAmount;
    this.orderMap.set(order.id, order);
    this.lastUpdateTime = Date.now();
  }

  removeOrder(orderId: string): CryptoOrder | null {
    const order = this.orderMap.get(orderId);
    if (!order) return null;

    const tree = order.side === 'buy' ? this.bids : this.asks;
    const level = tree.find(order.price);

    if (level) {
      const orderIndex = level.orders.findIndex(o => o.id === orderId);
      if (orderIndex !== -1) {
        level.orders.splice(orderIndex, 1);
        level.amount -= (order.amount - order.filledAmount);

        if (level.orders.length === 0) {
          tree.remove(order.price);
        }
      }
    }

    this.orderMap.delete(orderId);
    this.lastUpdateTime = Date.now();
    return order;
  }

  updateOrderAmount(orderId: string, filledAmount: number): void {
    const order = this.orderMap.get(orderId);
    if (!order) return;

    const tree = order.side === 'buy' ? this.bids : this.asks;
    const level = tree.find(order.price);

    if (level) {
      const previousUnfilled = order.amount - order.filledAmount;
      order.filledAmount = filledAmount;
      const newUnfilled = order.amount - order.filledAmount;
      level.amount += newUnfilled - previousUnfilled;

      if (order.filledAmount >= order.amount) {
        order.status = 'filled';
        this.removeOrder(orderId);
      } else if (order.filledAmount > 0) {
        order.status = 'partial';
      }
    }

    this.lastUpdateTime = Date.now();
  }

  getBestBid(): OrderBookLevel | null {
    // For bids with descending comparator (b-a), findMin returns the highest actual price
    const best = this.bids.findMin();
    return best ? best.value : null;
  }

  getBestAsk(): OrderBookLevel | null {
    // For asks with ascending comparator (a-b), findMin returns the lowest actual price
    const best = this.asks.findMin();
    return best ? best.value : null;
  }

  getSpread(): number {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    if (!bestBid || !bestAsk) return Infinity;
    return bestAsk.price - bestBid.price;
  }

  getMarketDepth(maxLevels: number = 10): MarketDepth {
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    let count = 0;
    let cumulativeBidAmount = 0;
    for (const { value } of this.bids.inOrderTraversal()) {
      if (count >= maxLevels) break;
      cumulativeBidAmount += value.amount;
      bids.push({
        price: value.price,
        amount: value.amount,
        total: cumulativeBidAmount,
        orders: [...value.orders]
      });
      count++;
    }

    count = 0;
    let cumulativeAskAmount = 0;
    for (const { value } of this.asks.inOrderTraversal()) {
      if (count >= maxLevels) break;
      cumulativeAskAmount += value.amount;
      asks.push({
        price: value.price,
        amount: value.amount,
        total: cumulativeAskAmount,
        orders: [...value.orders]
      });
      count++;
    }

    return {
      pair: this.pair,
      bids,
      asks,
      lastUpdateTime: this.lastUpdateTime
    };
  }

  getOrder(orderId: string): CryptoOrder | undefined {
    return this.orderMap.get(orderId);
  }

  getOrderCount(): number {
    return this.orderMap.size;
  }

  getTotalVolume(side: OrderSide): number {
    const tree = side === 'buy' ? this.bids : this.asks;
    let totalVolume = 0;

    for (const { value } of tree.inOrderTraversal()) {
      totalVolume += value.amount;
    }

    return totalVolume;
  }

  clear(): void {
    // Clear all nodes from the trees by removing them individually
    const bidKeys = Array.from(this.bids.inOrderTraversal()).map(item => item.key);
    const askKeys = Array.from(this.asks.inOrderTraversal()).map(item => item.key);
    
    bidKeys.forEach(key => this.bids.remove(key));
    askKeys.forEach(key => this.asks.remove(key));
    
    this.orderMap.clear();
    this.lastUpdateTime = Date.now();
  }

  getPair(): string {
    return this.pair;
  }
}