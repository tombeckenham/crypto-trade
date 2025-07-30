import React from 'react';
import type { OrderBookLevel } from '../types/trading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OrderBookProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  pair: string;
  maxLevels?: number;
}

export const OrderBook: React.FC<OrderBookProps> = ({ bids, asks, pair, maxLevels = 15 }) => {
  const maxTotal = Math.max(
    ...bids.map(b => b.total),
    ...asks.map(a => a.total)
  );

  const renderLevel = (level: OrderBookLevel, type: 'bid' | 'ask') => {
    const percentage = (level.total / maxTotal) * 100;
    const isAsk = type === 'ask';
    
    return (
      <div key={level.price} className="flex h-6 relative text-xs font-mono">
        <div 
          className={`absolute right-0 top-0 bottom-0 z-0 ${
            isAsk ? 'bg-red-500/15' : 'bg-green-500/15'
          }`}
          style={{ width: `${percentage}%` }}
        />
        <div className="flex-1 flex justify-between px-2 py-0.5 z-10 relative">
          <span className={isAsk ? 'text-red-500' : 'text-green-500'}>
            {level.price.toFixed(2)}
          </span>
          <span>{level.amount.toFixed(6)}</span>
          <span className="opacity-70">{level.total.toFixed(6)}</span>
        </div>
      </div>
    );
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>Order Book - {pair}</CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 min-h-0 p-0">
        <div className="flex px-2 py-1 text-xs opacity-70 border-b">
          <span className="flex-1">Price</span>
          <span className="flex-1 text-right">Amount</span>
          <span className="flex-1 text-right">Total</span>
        </div>

        <div className="flex-1 min-h-0">
          <div className="max-h-[300px] overflow-auto">
            {asks.slice(0, maxLevels).reverse().map(ask => renderLevel(ask, 'ask'))}
          </div>
          
          <div className="h-10 flex items-center justify-center border-t border-b font-bold text-base">
            Spread: {((asks[0]?.price || 0) - (bids[0]?.price || 0)).toFixed(2)}
          </div>
          
          <div className="max-h-[300px] overflow-auto">
            {bids.slice(0, maxLevels).map(bid => renderLevel(bid, 'bid'))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};