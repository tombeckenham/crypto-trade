import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { api } from "../services/api";

interface SimulationControlsProps {
  selectedPair: string;
  onSimulationStateChange?: (isSimulating: boolean) => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({ selectedPair, onSimulationStateChange }) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [ordersPerSecond, setOrdersPerSecond] = useState("1000");
  const [duration, setDuration] = useState("10");
  const [preset, setPreset] = useState("moderate");
  const [marketData, setMarketData] = useState<any>(null);

  const presets = {
    light: { ordersPerSecond: 100, duration: 5, label: "Light (100/sec)" },
    moderate: { ordersPerSecond: 1000, duration: 10, label: "Moderate (1K/sec)" },
    heavy: { ordersPerSecond: 10000, duration: 10, label: "Heavy (10K/sec)" },
    extreme: { ordersPerSecond: 50000, duration: 5, label: "Extreme (50K/sec)" },
    maximum: { ordersPerSecond: 100000, duration: 3, label: "Maximum (100K/sec)" }
  };

  const handlePresetChange = (presetKey: string) => {
    setPreset(presetKey);
    const presetConfig = presets[presetKey as keyof typeof presets];
    setOrdersPerSecond(presetConfig.ordersPerSecond.toString());
    setDuration(presetConfig.duration.toString());
  };

  const startSimulation = async () => {
    setIsSimulating(true);
    onSimulationStateChange?.(true);
    
    try {
      const response = await api.startSimulation(
        parseInt(ordersPerSecond),
        parseInt(duration),
        selectedPair
      );
      
      setMarketData(response.marketData);
      
      // Auto-stop simulation after duration
      setTimeout(() => {
        setIsSimulating(false);
        onSimulationStateChange?.(false);
      }, parseInt(duration) * 1000);
      
    } catch (error) {
      console.error('Simulation failed:', error);
      setIsSimulating(false);
      onSimulationStateChange?.(false);
    }
  };

  const stopSimulation = () => {
    setIsSimulating(false);
    onSimulationStateChange?.(false);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Volume Simulation</h3>
            <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-orange-500 animate-pulse' : 'bg-gray-400'}`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Preset</label>
              <Select value={preset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(presets).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Duration (seconds)</label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                min="1"
                max="60"
                disabled={isSimulating}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Orders per Second</label>
            <Input
              type="number"
              value={ordersPerSecond}
              onChange={(e) => setOrdersPerSecond(e.target.value)}
              min="1"
              max="100000"
              disabled={isSimulating}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={startSimulation}
              disabled={isSimulating}
              className="flex-1"
            >
              {isSimulating ? 'Simulating...' : 'Start Simulation'}
            </Button>
            
            {isSimulating && (
              <Button
                onClick={stopSimulation}
                variant="outline"
              >
                Stop
              </Button>
            )}
          </div>

          {marketData && (
            <div className="bg-gray-800 p-3 rounded-lg text-xs space-y-2">
              <div className="text-sm font-medium text-blue-400">Live Market Data</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-400">Price:</span> ${marketData.currentPrice?.toFixed(2)}
                </div>
                <div>
                  <span className="text-gray-400">Spread:</span> ${marketData.spread?.toFixed(4)}
                </div>
                <div>
                  <span className="text-gray-400">Volatility:</span> {marketData.volatility}
                </div>
                <div>
                  <span className="text-gray-400">Market Orders:</span> {marketData.marketOrderRatio}
                </div>
              </div>
              <div className="text-xs text-green-400">
                ✓ Using real {selectedPair} market conditions
              </div>
            </div>
          )}

          <div className="text-xs text-gray-400 space-y-1">
            <p>• Generates realistic orders based on live market data</p>
            <p>• Order sizes and prices match {selectedPair} trading patterns</p>
            <p>• Simulates market maker/taker behavior</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};