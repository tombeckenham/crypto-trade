import { OrderBook } from './src/core/order-book.js';

const orderBook = new OrderBook('BTC-USDT');

// Add the same orders as the test
orderBook.addOrder({
  id: 'bid1', pair: 'BTC-USDT', side: 'buy', price: 50000, amount: 1.0,
  type: 'limit', timestamp: Date.now(), userId: 'test', status: 'pending', filledAmount: 0
});

orderBook.addOrder({
  id: 'bid2', pair: 'BTC-USDT', side: 'buy', price: 49500, amount: 2.0,
  type: 'limit', timestamp: Date.now(), userId: 'test', status: 'pending', filledAmount: 0
});

orderBook.addOrder({
  id: 'bid3', pair: 'BTC-USDT', side: 'buy', price: 50500, amount: 0.5,
  type: 'limit', timestamp: Date.now(), userId: 'test', status: 'pending', filledAmount: 0
});

orderBook.addOrder({
  id: 'ask1', pair: 'BTC-USDT', side: 'sell', price: 51000, amount: 1.0,
  type: 'limit', timestamp: Date.now(), userId: 'test', status: 'pending', filledAmount: 0
});

orderBook.addOrder({
  id: 'ask2', pair: 'BTC-USDT', side: 'sell', price: 51500, amount: 1.5,
  type: 'limit', timestamp: Date.now(), userId: 'test', status: 'pending', filledAmount: 0
});

orderBook.addOrder({
  id: 'ask3', pair: 'BTC-USDT', side: 'sell', price: 50800, amount: 0.8,
  type: 'limit', timestamp: Date.now(), userId: 'test', status: 'pending', filledAmount: 0
});

console.log('Best bid:', orderBook.getBestBid()?.price);
console.log('Best ask:', orderBook.getBestAsk()?.price);
console.log('Spread:', orderBook.getSpread());