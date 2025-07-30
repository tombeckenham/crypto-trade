import React, { useEffect, useRef, useState } from "react";
import {
	createChart,
	ColorType,
	type IChartApi,
	type ISeriesApi,
	CandlestickSeries,
	type Time,
} from "lightweight-charts";
import { type CryptoTrade } from "../types/trading";
import { binanceAPI, type CandlestickData } from "../services/binance-api";

interface PriceChartProps {
	trades: CryptoTrade[];
	pair: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({ trades, pair }) => {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

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
		if (!candleSeriesRef.current || !pair) return;

		const loadBinanceData = async () => {
			setIsLoading(true);
			setError(null);

			try {
				const binanceSymbol = binanceAPI.convertPairToBinanceSymbol(pair);
				const candlestickData = await binanceAPI.getKlines(binanceSymbol, '1m', 100);
				
				const formattedData = candlestickData.map(candle => ({
					time: candle.time as Time,
					open: candle.open,
					high: candle.high,
					low: candle.low,
					close: candle.close,
				}));

				candleSeriesRef.current?.setData(formattedData);
			} catch (err) {
				console.error('Failed to load Binance data:', err);
				setError('Failed to load price data');
				
				// Fallback to mock data
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

				candleSeriesRef.current?.setData(generateMockCandles());
			} finally {
				setIsLoading(false);
			}
		};

		loadBinanceData();
	}, [pair]);

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
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<span>{pair} Price Chart</span>
				{isLoading && (
					<span style={{ fontSize: "12px", color: "#ffa726" }}>
						Loading...
					</span>
				)}
				{error && (
					<span style={{ fontSize: "12px", color: "#ef5350" }}>
						{error} (using mock data)
					</span>
				)}
			</div>
			<div ref={chartContainerRef} />
		</div>
	);
};
