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
  // Filter out invalid levels and calculate maxTotal safely
  const validBids = bids.filter(b => b && typeof b.total === 'number' && !isNaN(b.total));
  const validAsks = asks.filter(a => a && typeof a.total === 'number' && !isNaN(a.total));
  
  const maxTotal = Math.max(
    0,
    ...validBids.map(b => b.total),
    ...validAsks.map(a => a.total)
  );

  const renderLevel = (level: OrderBookLevel, type: 'bid' | 'ask') => {
    // Skip invalid levels with null/undefined values
    if (!level || typeof level.price !== 'number' || typeof level.amount !== 'number' || typeof level.total !== 'number') {
      return null;
    }
    
    const percentage = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;
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
            {validAsks.slice(0, maxLevels).reverse().map(ask => renderLevel(ask, 'ask')).filter(Boolean)}
          </div>
          
          <div className="h-10 flex items-center justify-center border-t border-b font-bold text-base">
            Spread: {(() => {
              const bestAsk = validAsks[0]?.price;
              const bestBid = validBids[0]?.price;
              if (typeof bestAsk === 'number' && typeof bestBid === 'number') {
                return (bestAsk - bestBid).toFixed(2);
              }
              return 'N/A';
            })()}
          </div>
          
          <div className="max-h-[300px] overflow-auto">
            {validBids.slice(0, maxLevels).map(bid => renderLevel(bid, 'bid')).filter(Boolean)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};