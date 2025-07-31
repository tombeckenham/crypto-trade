import React, { useEffect, useState, useRef } from "react";
import { OrderBook } from "../components/order-book";
import { TradeForm } from "../components/trade-form";
import { PriceChart } from "../components/price-chart";
import { SimulationControls } from "../components/simulation-controls";
import { VolumeMetrics } from "../components/volume-metrics";
import { LiquidityGenerator } from "../components/liquidity-generator";
import {
	useOrderBook,
	usePlaceOrder,
	useTradingPairs,
} from "../hooks/use-trading-queries";
import { useTradingStore } from "../store/trading-store";
import { wsService } from "../services/websocket";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { MarketDepth } from "../types/trading";

export const TradingView: React.FC = () => {
	const {
		selectedPair,
		userId,
		connectionStatus,
		setSelectedPair,
		setConnectionStatus,
	} = useTradingStore();
	const [wsOrderBook, setWsOrderBook] = useState<MarketDepth | null>(null);
	const [isSimulating, setIsSimulating] = useState(false);
	const [lastSimulationId, setLastSimulationId] = useState<string | null>(null);
	const isConnecting = useRef(false);

	const { data: orderBook } = useOrderBook(selectedPair);
	const { data: pairsData } = useTradingPairs();
	const placeOrder = usePlaceOrder();

	useEffect(() => {
		// Prevent double connection in StrictMode
		// TB Jul 30 2025 - don't love this... but it will do for now
		if (isConnecting.current) return;
		isConnecting.current = true;

		setConnectionStatus("connecting");

		const connectWebSocket = async () => {
			try {
				await wsService.connect();
				setConnectionStatus("connected");
			} catch (error) {
				console.error("Failed to connect WebSocket:", error);
				setConnectionStatus("disconnected");
			} finally {
				isConnecting.current = false;
			}
		};

		connectWebSocket();

		return () => {
			// Only disconnect if we're not already trying to connect
			if (!isConnecting.current) {
				wsService.disconnect();
				setConnectionStatus("disconnected");
			}
		};
	}, [setConnectionStatus]);

	useEffect(() => {
		if (connectionStatus !== "connected") return;

		const handleOrderBookUpdate = (data: MarketDepth) => {
			setWsOrderBook(data);
		};

		console.log("Setting up WebSocket subscription for:", selectedPair);
		wsService.subscribe("orderbook", selectedPair, handleOrderBookUpdate);

		return () => {
			wsService.unsubscribe("orderbook", selectedPair, handleOrderBookUpdate);
		};
	}, [selectedPair, connectionStatus]);

	const currentOrderBook = wsOrderBook || orderBook;

	return (
		<div className="flex flex-col bg-background text-foreground dark">
			<header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 md:p-6 border-b gap-4 sm:gap-0">
				<h1 className="text-xl md:text-2xl font-bold">CryptoTrade</h1>

				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
					<Select value={selectedPair} onValueChange={setSelectedPair}>
						<SelectTrigger className="w-full sm:w-[180px]">
							<SelectValue placeholder="Select trading pair" />
						</SelectTrigger>
						<SelectContent>
							{pairsData?.pairs.map((pair) => (
								<SelectItem key={pair.symbol} value={pair.symbol}>
									{pair.symbol}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="flex items-center gap-2">
						<div
							className={`w-2 h-2 rounded-full ${
								connectionStatus === "connected"
									? "bg-green-500"
									: connectionStatus === "connecting"
									? "bg-yellow-500"
									: "bg-red-500"
							}`}
						/>
						<span className="text-sm">
							{connectionStatus === "connected"
								? "Connected"
								: connectionStatus === "connecting"
								? "Connecting..."
								: "Disconnected"}
						</span>
					</div>
				</div>
			</header>

			<main className="flex-1 flex flex-col md:flex-row p-4 md:p-6 gap-4 md:gap-6 min-h-0">
				<div className="flex-[2] flex flex-col gap-4 md:gap-6 w-full">
					<Card className="flex-1">
						<CardContent className="p-4 md:p-6 h-full">
							<PriceChart trades={[]} pair={selectedPair} />
						</CardContent>
					</Card>

					{/* Order book on mobile - between chart and trading controls */}
					{currentOrderBook && (
						<Card className="md:hidden">
							<CardContent className="p-4">
								<OrderBook
									bids={currentOrderBook.bids}
									asks={currentOrderBook.asks}
									pair={selectedPair}
								/>
							</CardContent>
						</Card>
					)}

					<div className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1">
						<div className="flex-1 max-w-lg space-y-4 md:space-y-6">
							<LiquidityGenerator pair={selectedPair} />

							<TradeForm
								pair={selectedPair}
								userId={userId}
								onSubmit={(order) => placeOrder.mutate(order)}
							/>

							<SimulationControls
								selectedPair={selectedPair}
								onSimulationStateChange={setIsSimulating}
								lastSimulationId={lastSimulationId}
								setLastSimulationId={setLastSimulationId}
							/>
						</div>

						<div className="flex-1 space-y-4 md:space-y-6">
							{/* Order book on desktop - in right column */}
							{currentOrderBook && (
								<Card className="hidden md:block">
									<CardContent className="p-4 md:p-6">
										<OrderBook
											bids={currentOrderBook.bids}
											asks={currentOrderBook.asks}
											pair={selectedPair}
										/>
									</CardContent>
								</Card>
							)}

							<VolumeMetrics pair={selectedPair} isSimulating={isSimulating} />
						</div>
					</div>
				</div>
			</main>
		</div>
	);
};
