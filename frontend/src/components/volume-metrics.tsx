import React, { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { api } from "../services/api";
import { useRealtimeMetrics } from "../hooks/use-trading-queries";
import type { OrderBookStats } from "../types/trading";

interface VolumeMetricsProps {
	pair: string;
	isSimulating: boolean;
}

interface OrderBookData {
	spread: number;
	bidVolume: number;
	askVolume: number;
}

export const VolumeMetrics: React.FC<VolumeMetricsProps> = ({
	pair,
	isSimulating,
}) => {
	const { data: engineMetrics, isLoading } = useRealtimeMetrics();
	const [orderBookData, setOrderBookData] = useState<OrderBookData>({
		spread: 0,
		bidVolume: 0,
		askVolume: 0,
	});

	// Fetch order book data for spread and volume info
	useEffect(() => {
		if (!isSimulating) return;

		const interval = setInterval(async () => {
			try {
				const response = await api.getMetrics();
				const pairStats = response.pairs.find(
					(p: OrderBookStats) => p.pair === pair
				);

				if (pairStats) {
					setOrderBookData({
						spread: parseFloat(pairStats.spread) || 0,
						bidVolume: parseFloat(pairStats.bidVolume) || 0,
						askVolume: parseFloat(pairStats.askVolume) || 0,
					});
				}
			} catch (error) {
				console.error("Failed to fetch order book data:", error);
			}
		}, 2000);

		return () => clearInterval(interval);
	}, [isSimulating, pair]);

	const formatNumber = (num: number): string => {
		if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
		if (num >= 1000) return (num / 1000).toFixed(1) + "K";
		return num.toFixed(0);
	};

	const formatMemory = (bytes: number): string => {
		const mb = bytes / (1024 * 1024);
		return mb.toFixed(1) + "MB";
	};

	const getVolumeBarWidth = (volume: number, maxVolume: number): number => {
		if (maxVolume === 0) return 0;
		return Math.min(100, (volume / maxVolume) * 100);
	};

	const maxVolume = Math.max(orderBookData.bidVolume, orderBookData.askVolume);

	if (isLoading && !engineMetrics) return <div>Loading metrics...</div>;

	return (
		<Card>
			<CardContent className="p-6">
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="text-lg font-semibold">Live Metrics</h3>
						<div className="flex items-center gap-2">
							<div
								className={`w-2 h-2 rounded-full ${
									engineMetrics && engineMetrics.timestamp > Date.now() - 5000
										? "bg-green-500 animate-pulse"
										: "bg-gray-400"
								}`}
							/>
							<span className="text-xs text-gray-400">
								{engineMetrics ? "Real-time" : "Disconnected"}
							</span>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">
								Orders/Sec (10s)
							</div>
							<div className="text-2xl font-bold text-blue-400">
								{formatNumber(engineMetrics?.ordersPerSecond10s || 0)}
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">
								Trades/Sec (10s)
							</div>
							<div className="text-2xl font-bold text-green-400">
								{formatNumber(engineMetrics?.tradesPerSecond10s || 0)}
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">
								Orders (1h)
							</div>
							<div className="text-xl font-bold text-yellow-400">
								{formatNumber(engineMetrics?.ordersLast1h || 0)}
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">Match Rate</div>
							<div className="text-xl font-bold text-purple-400">
								{(engineMetrics?.matchEfficiency || 0).toFixed(1)}%
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">
								Total Orders
							</div>
							<div className="text-lg font-bold text-cyan-400">
								{formatNumber(engineMetrics?.orderCount || 0)}
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">
								Total Trades
							</div>
							<div className="text-lg font-bold text-indigo-400">
								{formatNumber(engineMetrics?.tradeCount || 0)}
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">Memory</div>
							<div className="text-lg font-bold text-orange-400">
								{formatMemory(engineMetrics?.memoryUsage?.heapUsed || 0)}
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium text-gray-400">Spread</div>
							<div className="text-lg font-bold text-pink-400">
								${orderBookData.spread.toFixed(2)}
							</div>
						</div>
					</div>

					<div className="space-y-3">
						<div className="text-sm font-medium text-gray-400">
							Order Book Volume
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between text-xs">
								<span className="text-green-400">Bids</span>
								<span>{formatNumber(orderBookData.bidVolume)}</span>
							</div>
							<div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
								<div
									className="h-full bg-green-500 transition-all duration-300"
									style={{
										width: `${getVolumeBarWidth(
											orderBookData.bidVolume,
											maxVolume
										)}%`,
									}}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between text-xs">
								<span className="text-red-400">Asks</span>
								<span>{formatNumber(orderBookData.askVolume)}</span>
							</div>
							<div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
								<div
									className="h-full bg-red-500 transition-all duration-300"
									style={{
										width: `${getVolumeBarWidth(
											orderBookData.askVolume,
											maxVolume
										)}%`,
									}}
								/>
							</div>
						</div>
					</div>

					{isSimulating && engineMetrics && (
						<div className="text-xs text-orange-400 animate-pulse">
							⚡ Real-time metrics: {engineMetrics.ordersPerSecond1m.toFixed(1)} orders/sec avg (1min)
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
};