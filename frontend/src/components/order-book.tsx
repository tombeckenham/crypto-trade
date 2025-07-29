import React from 'react';
import type { OrderBookLevel } from '../types/trading';

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
      <div key={level.price} style={{ 
        display: 'flex', 
        height: '24px',
        position: 'relative',
        fontSize: '13px',
        fontFamily: 'monospace'
      }}>
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: `${percentage}%`,
          backgroundColor: isAsk ? 'rgba(239, 83, 80, 0.15)' : 'rgba(38, 166, 154, 0.15)',
          zIndex: 0
        }} />
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          justifyContent: 'space-between',
          padding: '2px 8px',
          zIndex: 1,
          position: 'relative'
        }}>
          <span style={{ color: isAsk ? '#ef5350' : '#26a69a' }}>
            {level.price.toFixed(2)}
          </span>
          <span>{level.amount.toFixed(6)}</span>
          <span style={{ opacity: 0.7 }}>{level.total.toFixed(6)}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      background: '#1a1a1a',
      color: '#e0e0e0',
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      <div style={{ 
        padding: '12px', 
        borderBottom: '1px solid #333',
        fontWeight: 'bold'
      }}>
        Order Book - {pair}
      </div>
      
      <div style={{ 
        display: 'flex', 
        padding: '8px',
        fontSize: '12px',
        opacity: 0.7,
        borderBottom: '1px solid #333'
      }}>
        <span style={{ flex: 1 }}>Price</span>
        <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
        <span style={{ flex: 1, textAlign: 'right' }}>Total</span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
          {asks.slice(0, maxLevels).reverse().map(ask => renderLevel(ask, 'ask'))}
        </div>
        
        <div style={{ 
          height: '40px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          borderTop: '1px solid #333',
          borderBottom: '1px solid #333',
          fontWeight: 'bold',
          fontSize: '16px'
        }}>
          Spread: {((asks[0]?.price || 0) - (bids[0]?.price || 0)).toFixed(2)}
        </div>
        
        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
          {bids.slice(0, maxLevels).map(bid => renderLevel(bid, 'bid'))}
        </div>
      </div>
    </div>
  );
};