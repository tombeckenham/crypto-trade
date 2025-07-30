import React, { useEffect, useRef } from "react";
import {
	createChart,
	ColorType,
	type IChartApi,
	type ISeriesApi,
	CandlestickSeries,
} from "lightweight-charts";
import { type CryptoTrade } from "../types/trading";
import { useBinanceKlines } from "../hooks/use-trading-queries";

interface PriceChartProps {
	trades: CryptoTrade[];
	pair: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({ pair }) => {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

	const { data: candleData, isLoading, error } = useBinanceKlines(pair);

	useEffect(() => {
		if (!chartContainerRef.current) return;

		const container = chartContainerRef.current;

		const chart = createChart(container, {
			layout: {
				background: { type: ColorType.Solid, color: "#1a1a1a" },
				textColor: "#e0e0e0",
			},
			grid: {
				vertLines: { color: "#333" },
				horzLines: { color: "#333" },
			},
			width: container.clientWidth,
			height: container.clientHeight,
			timeScale: {
				borderColor: "#444",
			},
			rightPriceScale: {
				borderColor: "#444",
			},
			autoSize: false,
		});

		const candleSeries = chart.addSeries(CandlestickSeries, {
			upColor: "#26a69a",
			downColor: "#ef5350",
			borderVisible: false,
			wickUpColor: "#26a69a",
			wickDownColor: "#ef5350",
		});

		chartRef.current = chart;
		candleSeriesRef.current = candleSeries;

		// Use ResizeObserver for better resize handling
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				// Only resize if dimensions are reasonable
				if (width > 200 && height > 200) {
					chart.applyOptions({
						width: Math.floor(width),
						height: Math.floor(height),
					});
				}
			}
		});

		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
			chart.remove();
		};
	}, []);

	useEffect(() => {
		if (!candleSeriesRef.current || !candleData) return;
		candleSeriesRef.current.setData(candleData);
	}, [candleData]);

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				minHeight: "400px",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					marginBottom: "16px",
					color: "#e0e0e0",
					fontWeight: "bold",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<span>{pair} Price Chart</span>
				{isLoading && (
					<span style={{ fontSize: "12px", color: "#ffa726" }}>Loading...</span>
				)}
				{error && (
					<span style={{ fontSize: "12px", color: "#ef5350" }}>
						Failed to load price data (using mock data)
					</span>
				)}
			</div>
			<div
				ref={chartContainerRef}
				style={{
					width: "100%",
					flex: 1,
				}}
			/>
		</div>
	);
};
