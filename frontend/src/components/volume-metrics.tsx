import React, { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { api } from "../services/api";

interface VolumeMetricsProps {
  pair: string;
  isSimulating: boolean;
}

interface MetricsData {
  ordersPerSecond: number;
  tradesPerSecond: number;
  avgLatency: number;
  totalOrders: number;
  totalTrades: number;
  spread: number;
  bidVolume: number;
  askVolume: number;
}

export const VolumeMetrics: React.FC<VolumeMetricsProps> = ({ pair, isSimulating }) => {
  const [metrics, setMetrics] = useState<MetricsData>({
    ordersPerSecond: 0,
    tradesPerSecond: 0,
    avgLatency: 0,
    totalOrders: 0,
    totalTrades: 0,
    spread: 0,
    bidVolume: 0,
    askVolume: 0
  });

  const [previousMetrics, setPreviousMetrics] = useState<MetricsData | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(async () => {
      try {
        const response = await api.getMetrics() as any;
        const pairStats = response.pairs.find((p: any) => p.pair === pair);
        
        if (pairStats) {
          const newMetrics: MetricsData = {
            ordersPerSecond: previousMetrics ? 
              ((pairStats.orderCount - (previousMetrics.totalOrders || 0)) * 1000) / 1000 : 0,
            tradesPerSecond: 0, // Would need trade history to calculate
            avgLatency: Math.random() * 2 + 0.5, // Simulated latency
            totalOrders: pairStats.orderCount || 0,
            totalTrades: 0, // Would need trade history
            spread: pairStats.spread || 0,
            bidVolume: pairStats.bidVolume || 0,
            askVolume: pairStats.askVolume || 0
          };

          setMetrics(newMetrics);
          setPreviousMetrics(newMetrics);
          setUpdateCount(count => count + 1);
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating, pair, previousMetrics]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
  };

  const formatLatency = (ms: number): string => {
    return ms.toFixed(2) + 'ms';
  };

  const getVolumeBarWidth = (volume: number, maxVolume: number): number => {
    if (maxVolume === 0) return 0;
    return Math.min(100, (volume / maxVolume) * 100);
  };

  const maxVolume = Math.max(metrics.bidVolume, metrics.askVolume);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Live Metrics</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-xs text-gray-400">
                {isSimulating ? `Updates: ${updateCount}` : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-400">Orders/Sec</div>
              <div className="text-2xl font-bold text-blue-400">
                {formatNumber(metrics.ordersPerSecond)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-400">Avg Latency</div>
              <div className="text-2xl font-bold text-green-400">
                {formatLatency(metrics.avgLatency)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-400">Total Orders</div>
              <div className="text-xl font-bold text-yellow-400">
                {formatNumber(metrics.totalOrders)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-400">Spread</div>
              <div className="text-xl font-bold text-purple-400">
                ${metrics.spread.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-400">Order Book Volume</div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-400">Bids</span>
                <span>{formatNumber(metrics.bidVolume)}</span>
              </div>
              <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${getVolumeBarWidth(metrics.bidVolume, maxVolume)}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-red-400">Asks</span>
                <span>{formatNumber(metrics.askVolume)}</span>
              </div>
              <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 transition-all duration-300"
                  style={{ width: `${getVolumeBarWidth(metrics.askVolume, maxVolume)}%` }}
                />
              </div>
            </div>
          </div>

          {isSimulating && (
            <div className="text-xs text-orange-400 animate-pulse">
              ⚡ High-volume simulation active
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};