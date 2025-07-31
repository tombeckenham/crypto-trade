import React, { useEffect, useRef, useState } from "react";
import {
	createChart,
	ColorType,
	type IChartApi,
	type ISeriesApi,
	CandlestickSeries,
	type TimeScaleOptions,
} from "lightweight-charts";
import { type CryptoTrade } from "@shared/types/trading.js";
import { useBinanceKlines } from "../hooks/use-trading-queries";

interface PriceChartProps {
	trades: CryptoTrade[];
	pair: string;
}

type TimeInterval = "1m" | "1h" | "1d";

const intervalLabels: Record<TimeInterval, string> = {
	"1m": "Minute",
	"1h": "Hour",
	"1d": "Day",
};

const intervalLimits: Record<TimeInterval, number> = {
	"1m": 288, // 24 hours of minutes
	"1h": 168, // 1 week of hours
	"1d": 30, // 30 days
};

export const PriceChart: React.FC<PriceChartProps> = ({ pair }) => {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const [interval, setInterval] = useState<TimeInterval>("1m");

	const { data: candleData, error } = useBinanceKlines(
		pair,
		interval,
		intervalLimits[interval]
	);

	useEffect(() => {
		if (!chartContainerRef.current) return;

		const container = chartContainerRef.current;

		const timeScaleOptions: Partial<TimeScaleOptions> = {
			borderColor: "#444",
			timeVisible: true,
			secondsVisible: interval === "1m",
			minBarSpacing: 0.5,
			barSpacing: interval === "1m" ? 6 : interval === "1h" ? 12 : 20,
			fixLeftEdge: false,
			fixRightEdge: false,
			lockVisibleTimeRangeOnResize: true,
		};

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
			timeScale: timeScaleOptions,
			rightPriceScale: {
				borderColor: "#444",
				scaleMargins: {
					top: 0.1,
					bottom: 0.1,
				},
				autoScale: true,
			},
			autoSize: false,
			handleScroll: {
				mouseWheel: true,
				pressedMouseMove: true,
				horzTouchDrag: true,
				vertTouchDrag: true,
			},
			handleScale: {
				axisPressedMouseMove: true,
				mouseWheel: true,
				pinch: true,
			},
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
	}, [interval]);

	useEffect(() => {
		if (!candleSeriesRef.current || !candleData || candleData.length === 0)
			return;

		// Clear existing data first
		candleSeriesRef.current.setData([]);

		// Sort data by time to ensure proper ordering
		const sortedData = [...candleData].sort(
			(a, b) => Number(a.time) - Number(b.time)
		);

		// Set the new data
		candleSeriesRef.current.setData(sortedData);

		// Auto-fit the visible range to show all data
		if (chartRef.current && sortedData.length > 0) {
			chartRef.current.timeScale().fitContent();
		}
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
				<div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
					<div style={{ display: "flex", gap: "8px" }}>
						{(["1m", "1h", "1d"] as TimeInterval[]).map((int) => (
							<button
								key={int}
								onClick={() => setInterval(int)}
								style={{
									background: interval === int ? "#2196f3" : "#333",
									color: "#e0e0e0",
									border: "none",
									padding: "4px 12px",
									borderRadius: "4px",
									cursor: "pointer",
									fontSize: "12px",
									transition: "background 0.2s",
								}}
								onMouseEnter={(e) => {
									if (interval !== int) {
										e.currentTarget.style.background = "#555";
									}
								}}
								onMouseLeave={(e) => {
									if (interval !== int) {
										e.currentTarget.style.background = "#333";
									}
								}}
							>
								{intervalLabels[int]}
							</button>
						))}
					</div>
					{error && (
						<span style={{ fontSize: "12px", color: "#ef5350" }}>
							Failed to load price data (using mock data)
						</span>
					)}
				</div>
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
