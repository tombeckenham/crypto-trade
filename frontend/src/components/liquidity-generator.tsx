import React, { useReducer, useState, useEffect } from "react";
import { api } from "../services/api";
import { useBinanceCurrentPrice } from "../hooks/use-trading-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LiquidityGeneratorProps {
	pair: string;
}

interface FormState {
	basePrice: string;
	orderCount: string;
	spread: string;
	maxDepth: string;
}

type FormAction =
	| { type: "SET_BASE_PRICE"; price: string }
	| { type: "SET_ORDER_COUNT"; count: string }
	| { type: "SET_SPREAD"; spread: string }
	| { type: "SET_MAX_DEPTH"; depth: string }
	| { type: "RESET" };

const formReducer = (state: FormState, action: FormAction): FormState => {
	switch (action.type) {
		case "SET_BASE_PRICE":
			if (action.price === "" || /^\d*\.?\d*$/.test(action.price)) {
				return { ...state, basePrice: action.price };
			}
			return state;
		case "SET_ORDER_COUNT":
			if (action.count === "" || /^\d+$/.test(action.count)) {
				return { ...state, orderCount: action.count };
			}
			return state;
		case "SET_SPREAD":
			if (action.spread === "" || /^\d*\.?\d*$/.test(action.spread)) {
				return { ...state, spread: action.spread };
			}
			return state;
		case "SET_MAX_DEPTH":
			if (action.depth === "" || /^\d*\.?\d*$/.test(action.depth)) {
				return { ...state, maxDepth: action.depth };
			}
			return state;
		case "RESET":
			return {
				basePrice: "",
				orderCount: "100",
				spread: "0.01",
				maxDepth: "0.05",
			};
		default:
			return state;
	}
};

export const LiquidityGenerator: React.FC<LiquidityGeneratorProps> = ({
	pair,
}) => {
	const [state, dispatch] = useReducer(formReducer, {
		basePrice: "",
		orderCount: "100",
		spread: "0.01",
		maxDepth: "0.05",
	});

	const [isGenerating, setIsGenerating] = useState(false);
	const [lastResult, setLastResult] = useState<string>("");

	const {
		data: currentPrice,
		isLoading: isPriceLoading,
		error: priceError,
	} = useBinanceCurrentPrice(pair);

	// Update base price when current price loads
	useEffect(() => {
		if (currentPrice && !state.basePrice) {
			dispatch({ type: "SET_BASE_PRICE", price: currentPrice.toString() });
		}
	}, [currentPrice, state.basePrice]);

	const handleGenerate = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!state.basePrice || parseFloat(state.basePrice) <= 0) {
			alert("Please enter a valid base price");
			return;
		}

		if (!state.orderCount || parseInt(state.orderCount) < 10) {
			alert("Please enter at least 10 orders");
			return;
		}

		setIsGenerating(true);
		setLastResult("");

		try {
			const result = await api.generateLiquidity({
				pair,
				basePrice: state.basePrice,
				orderCount: parseInt(state.orderCount),
				spread: state.spread || "0.01",
				maxDepth: state.maxDepth || "0.05",
			});

			setLastResult(`✅ ${result.message}`);
		} catch (error) {
			setLastResult(
				`❌ Error: ${
					error instanceof Error
						? error.message
						: "Failed to generate liquidity"
				}`
			);
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Generate Liquidity</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleGenerate} className="flex flex-col gap-4">
					<div className="grid grid-cols-2 gap-2">
						<div>
							<label className="text-sm text-muted-foreground">
								Base Price
								{isPriceLoading && " (Loading...)"}
								{currentPrice && !isPriceLoading && (
									<span className="text-green-500">
										{" "}
										• Live: ${currentPrice.toLocaleString()}
									</span>
								)}
								{priceError && (
									<span className="text-red-500"> • Error loading price</span>
								)}
							</label>
							<div className="flex gap-1">
								<Input
									type="text"
									placeholder={
										currentPrice ? currentPrice.toString() : "Loading..."
									}
									value={state.basePrice}
									onChange={(e) =>
										dispatch({ type: "SET_BASE_PRICE", price: e.target.value })
									}
									disabled={isPriceLoading}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										if (currentPrice) {
											dispatch({
												type: "SET_BASE_PRICE",
												price: currentPrice.toString(),
											});
										}
									}}
									disabled={isPriceLoading || !currentPrice}
									className="px-2"
								>
									↻
								</Button>
							</div>
						</div>
						<div>
							<label className="text-sm text-muted-foreground">
								Order Count
							</label>
							<Input
								type="text"
								placeholder="100"
								value={state.orderCount}
								onChange={(e) =>
									dispatch({ type: "SET_ORDER_COUNT", count: e.target.value })
								}
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2">
						<div>
							<label className="text-sm text-muted-foreground">Spread %</label>
							<Input
								type="text"
								placeholder="0.01"
								value={state.spread}
								onChange={(e) =>
									dispatch({ type: "SET_SPREAD", spread: e.target.value })
								}
							/>
						</div>
						<div>
							<label className="text-sm text-muted-foreground">
								Max Depth %
							</label>
							<Input
								type="text"
								placeholder="0.05"
								value={state.maxDepth}
								onChange={(e) =>
									dispatch({ type: "SET_MAX_DEPTH", depth: e.target.value })
								}
							/>
						</div>
					</div>

					<Button
						type="submit"
						disabled={isGenerating}
						variant="secondary"
						size="sm"
					>
						{isGenerating ? "Generating..." : `Generate Liquidity for ${pair}`}
					</Button>

					{lastResult && (
						<div className="text-sm p-2 rounded bg-muted">{lastResult}</div>
					)}
				</form>
			</CardContent>
		</Card>
	);
};
