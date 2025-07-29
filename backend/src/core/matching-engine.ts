import { EventEmitter } from 'events';
import { OrderBook } from './order-book';
import { CryptoOrder, CryptoTrade } from '../types/trading';
import { nanoid } from 'nanoid';

export interface MatchingEngineEvents {
  trade: (trade: CryptoTrade) => void;
  orderUpdate: (order: CryptoOrder) => void;
  orderCancelled: (order: CryptoOrder) => void;
}

export class MatchingEngine extends EventEmitter {
  private readonly orderBooks: Map<string, OrderBook>;
  private tradeSequence: number;
  private readonly makerFeeRate: number;
  private readonly takerFeeRate: number;

  constructor(makerFeeRate: number = 0.001, takerFeeRate: number = 0.002) {
    super();
    this.orderBooks = new Map();
    this.tradeSequence = 0;
    this.makerFeeRate = makerFeeRate;
    this.takerFeeRate = takerFeeRate;
  }

  override on<K extends keyof MatchingEngineEvents>(
    event: K,
    listener: MatchingEngineEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof MatchingEngineEvents>(
    event: K,
    ...args: Parameters<MatchingEngineEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  private getOrCreateOrderBook(pair: string): OrderBook {
    let orderBook = this.orderBooks.get(pair);
    if (!orderBook) {
      orderBook = new OrderBook(pair);
      this.orderBooks.set(pair, orderBook);
    }
    return orderBook;
  }

  submitOrder(order: CryptoOrder): void {
    const orderBook = this.getOrCreateOrderBook(order.pair);

    if (order.type === 'market') {
      this.executeMarketOrder(order, orderBook);
    } else {
      this.executeLimitOrder(order, orderBook);
    }
  }

  cancelOrder(orderId: string, pair: string): boolean {
    const orderBook = this.getOrCreateOrderBook(pair);
    const order = orderBook.removeOrder(orderId);
    
    if (order) {
      order.status = 'cancelled';
      this.emit('orderCancelled', order);
      return true;
    }
    
    return false;
  }

  private executeMarketOrder(order: CryptoOrder, orderBook: OrderBook): void {
    const isBuy = order.side === 'buy';
    let remainingAmount = order.amount;
    let totalVolume = 0;

    while (remainingAmount > 0) {
      const bestLevel = isBuy ? orderBook.getBestAsk() : orderBook.getBestBid();
      
      if (!bestLevel || bestLevel.orders.length === 0) {
        break;
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
    } else if (order.filledAmount > 0) {
      order.status = 'partial';
    } else {
      order.status = 'cancelled';
    }

    this.emit('orderUpdate', order);
  }

  private executeLimitOrder(order: CryptoOrder, orderBook: OrderBook): void {
    const isBuy = order.side === 'buy';
    let remainingAmount = order.amount - order.filledAmount;
    let totalVolume = 0;

    while (remainingAmount > 0) {
      const bestLevel = isBuy ? orderBook.getBestAsk() : orderBook.getBestBid();
      
      if (!bestLevel || bestLevel.orders.length === 0) {
        break;
      }

      const canMatch = isBuy
        ? bestLevel.price <= order.price
        : bestLevel.price >= order.price;

      if (!canMatch) {
        break;
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

  private createTrade(
    takerOrder: CryptoOrder,
    makerOrder: CryptoOrder,
    price: number,
    amount: number,
    volume: number
  ): void {
    const trade: CryptoTrade = {
      id: nanoid(),
      pair: takerOrder.pair,
      price,
      amount,
      volume,
      timestamp: Date.now(),
      takerSide: takerOrder.side,
      buyOrderId: takerOrder.side === 'buy' ? takerOrder.id : makerOrder.id,
      sellOrderId: takerOrder.side === 'sell' ? takerOrder.id : makerOrder.id,
      makerFee: volume * this.makerFeeRate,
      takerFee: volume * this.takerFeeRate
    };

    this.tradeSequence++;
    this.emit('trade', trade);
  }

  getOrderBook(pair: string): OrderBook {
    return this.getOrCreateOrderBook(pair);
  }

  getMarketDepth(pair: string, maxLevels: number = 10) {
    const orderBook = this.getOrCreateOrderBook(pair);
    return orderBook.getMarketDepth(maxLevels);
  }

  getOrderBookStats(pair: string) {
    const orderBook = this.getOrCreateOrderBook(pair);
    return {
      pair,
      bestBid: orderBook.getBestBid(),
      bestAsk: orderBook.getBestAsk(),
      spread: orderBook.getSpread(),
      bidVolume: orderBook.getTotalVolume('buy'),
      askVolume: orderBook.getTotalVolume('sell'),
      orderCount: orderBook.getOrderCount()
    };
  }

  getSupportedPairs(): string[] {
    return Array.from(this.orderBooks.keys());
  }
}