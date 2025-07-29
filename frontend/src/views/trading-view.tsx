import React, { useEffect, useState, useRef } from "react";
import { OrderBook } from "../components/order-book";
import { TradeForm } from "../components/trade-form";
import { PriceChart } from "../components/price-chart";
import {
	useOrderBook,
	usePlaceOrder,
	useTradingPairs,
} from "../hooks/use-trading-queries";
import { useTradingStore } from "../store/trading-store";
import { wsService } from "../services/websocket";
import { type MarketDepth } from "../types/trading";

export const TradingView: React.FC = () => {
	const {
		selectedPair,
		userId,
		connectionStatus,
		setSelectedPair,
		setConnectionStatus,
	} = useTradingStore();
	const [wsOrderBook, setWsOrderBook] = useState<MarketDepth | null>(null);
	const isConnecting = useRef(false);

	const { data: orderBook } = useOrderBook(selectedPair);
	const { data: pairsData } = useTradingPairs();
	const placeOrder = usePlaceOrder();

	useEffect(() => {
		// Prevent double connection in StrictMode
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

		wsService.subscribe("orderbook", selectedPair, handleOrderBookUpdate);

		return () => {
			wsService.unsubscribe("orderbook", selectedPair, handleOrderBookUpdate);
		};
	}, [selectedPair, connectionStatus]);

	const currentOrderBook = wsOrderBook || orderBook;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100vh",
				background: "#0d0d0d",
				color: "#e0e0e0",
			}}
		>
			<header
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "16px 24px",
					borderBottom: "1px solid #333",
				}}
			>
				<h1 style={{ margin: 0, fontSize: "24px" }}>FluxTrade</h1>

				<div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
					<select
						value={selectedPair}
						onChange={(e) => setSelectedPair(e.target.value)}
						style={{
							padding: "8px 12px",
							background: "#1a1a1a",
							border: "1px solid #444",
							borderRadius: "4px",
							color: "#fff",
						}}
					>
						{pairsData?.pairs.map((pair) => (
							<option key={pair.symbol} value={pair.symbol}>
								{pair.symbol}
							</option>
						))}
					</select>

					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
					>
						<div
							style={{
								width: "8px",
								height: "8px",
								borderRadius: "50%",
								background:
									connectionStatus === "connected"
										? "#26a69a"
										: connectionStatus === "connecting"
										? "#ffa726"
										: "#ef5350",
							}}
						/>
						<span style={{ fontSize: "14px" }}>
							{connectionStatus === "connected"
								? "Connected"
								: connectionStatus === "connecting"
								? "Connecting..."
								: "Disconnected"}
						</span>
					</div>
				</div>
			</header>

			<main
				style={{
					flex: 1,
					display: "flex",
					padding: "24px",
					gap: "24px",
					minHeight: 0,
				}}
			>
				<div
					style={{
						flex: 2,
						display: "flex",
						flexDirection: "column",
						gap: "24px",
					}}
				>
					<PriceChart trades={[]} pair={selectedPair} />

					<div
						style={{
							display: "flex",
							gap: "24px",
							flex: 1,
						}}
					>
						<div style={{ flex: 1 }}>
							<TradeForm
								pair={selectedPair}
								userId={userId}
								onSubmit={(order) => placeOrder.mutate(order)}
							/>
						</div>

						<div style={{ flex: 1 }}>
							{currentOrderBook && (
								<OrderBook
									bids={currentOrderBook.bids}
									asks={currentOrderBook.asks}
									pair={selectedPair}
								/>
							)}
						</div>
					</div>
				</div>
			</main>
		</div>
	);
};