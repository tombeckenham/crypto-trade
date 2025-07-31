import { CryptoOrder } from './trading.js';
import { nanoid } from 'nanoid';

export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn: (obj: T) => void, maxSize: number = 10000) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  preWarm(count: number): void {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.createFn());
    }
  }
}

// Order object pool for simulation
export const orderPool = new ObjectPool<CryptoOrder>(
  () => ({
    id: '',
    pair: '',
    side: 'buy',
    price: '0',
    amount: '0',
    type: 'limit',
    timestamp: 0,
    userId: '',
    status: 'pending',
    filledAmount: '0'
  }),
  (order) => {
    order.id = '';
    order.pair = '';
    order.side = 'buy';
    order.price = '0';
    order.amount = '0';
    order.type = 'limit';
    order.timestamp = 0;
    order.userId = '';
    order.status = 'pending';
    order.filledAmount = '0';
  },
  10000 // Larger pool for simulation server
);

// Pre-warm the pool
orderPool.preWarm(5000);

export function createPooledOrder(
  pair: string,
  side: 'buy' | 'sell',
  type: 'market' | 'limit',
  price: string,
  amount: string,
  userId: string
): CryptoOrder {
  const order = orderPool.acquire();

  order.id = nanoid();
  order.pair = pair;
  order.side = side;
  order.type = type;
  order.price = price.toString();
  order.amount = amount.toString();
  order.timestamp = Date.now();
  order.userId = userId;
  order.status = 'pending';
  order.filledAmount = '0';

  return order;
}

export function releaseOrder(order: CryptoOrder): void {
  orderPool.release(order);
}