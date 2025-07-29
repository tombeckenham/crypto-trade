import React, { useEffect, useRef } from "react";
import {
	createChart,
	ColorType,
	type IChartApi,
	type ISeriesApi,
	CandlestickSeries,
	type Time,
} from "lightweight-charts";
import { type CryptoTrade } from "../types/trading";

interface PriceChartProps {
	trades: CryptoTrade[];
	pair: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({ trades, pair }) => {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

	useEffect(() => {
		if (!chartContainerRef.current) return;

		const chart = createChart(chartContainerRef.current, {
			layout: {
				background: { type: ColorType.Solid, color: "#1a1a1a" },
				textColor: "#e0e0e0",
			},
			grid: {
				vertLines: { color: "#333" },
				horzLines: { color: "#333" },
			},
			width: chartContainerRef.current.clientWidth,
			height: 400,
			timeScale: {
				borderColor: "#444",
			},
			rightPriceScale: {
				borderColor: "#444",
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

		const handleResize = () => {
			if (chartContainerRef.current) {
				chart.applyOptions({ width: chartContainerRef.current.clientWidth });
			}
		};

		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
			chart.remove();
		};
	}, []);

	useEffect(() => {
		if (!candleSeriesRef.current || trades.length === 0) return;

		const generateMockCandles = () => {
			const now = Date.now();
			const candles = [];
			let basePrice = 50000;

			for (let i = 0; i < 100; i++) {
				const time = Math.floor((now - (100 - i) * 60000) / 1000) as Time;
				const volatility = 0.002;
				const open = basePrice;
				const change = (Math.random() - 0.5) * basePrice * volatility;
				const high = basePrice + Math.abs(change) + Math.random() * 50;
				const low = basePrice - Math.abs(change) - Math.random() * 50;
				const close = basePrice + change;

				candles.push({ time, open, high, low, close });
				basePrice = close;
			}

			return candles;
		};

		candleSeriesRef.current.setData(generateMockCandles());
	}, [trades]);

	return (
		<div
			style={{
				background: "#1a1a1a",
				borderRadius: "4px",
				padding: "16px",
			}}
		>
			<div
				style={{
					marginBottom: "16px",
					color: "#e0e0e0",
					fontWeight: "bold",
				}}
			>
				{pair} Price Chart
			</div>
			<div ref={chartContainerRef} />
		</div>
	);
};
