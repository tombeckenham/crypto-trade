import { RedBlackTree } from './red-black-tree';
import { CryptoOrder, OrderBookLevel, MarketDepth, OrderSide } from '../types/trading';

export class OrderBook {
  private readonly pair: string;
  private readonly bids: RedBlackTree<number, OrderBookLevel>;
  private readonly asks: RedBlackTree<number, OrderBookLevel>;
  private readonly orderMap: Map<string, CryptoOrder>;
  private lastUpdateTime: number;

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
    const best = this.bids.findMax();
    return best ? best.value : null;
  }

  getBestAsk(): OrderBookLevel | null {
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
    this.bids.constructor.call(this.bids, (a: number, b: number) => b - a);
    this.asks.constructor.call(this.asks, (a: number, b: number) => a - b);
    this.orderMap.clear();
    this.lastUpdateTime = Date.now();
  }

  getPair(): string {
    return this.pair;
  }
}