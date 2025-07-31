import React, { useReducer } from "react";
import { type PlaceOrderRequest } from "../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TradeFormProps {
	pair: string;
	userId: string;
	onSubmit: (order: PlaceOrderRequest) => void;
}

interface FormState {
	side: "buy" | "sell";
	type: "market" | "limit";
	price: string;
	amount: string;
}

type FormAction =
	| { type: "SET_SIDE"; side: "buy" | "sell" }
	| { type: "SET_ORDER_TYPE"; orderType: "market" | "limit" }
	| { type: "SET_PRICE"; price: string }
	| { type: "SET_AMOUNT"; amount: string }
	| { type: "RESET" };

const formReducer = (state: FormState, action: FormAction): FormState => {
	switch (action.type) {
		case "SET_SIDE":
			return { ...state, side: action.side };
		case "SET_ORDER_TYPE":
			return { ...state, type: action.orderType };
		case "SET_PRICE":
			if (action.price === "" || /^\d*\.?\d*$/.test(action.price)) {
				return { ...state, price: action.price };
			}
			return state;
		case "SET_AMOUNT":
			if (action.amount === "" || /^\d*\.?\d*$/.test(action.amount)) {
				return { ...state, amount: action.amount };
			}
			return state;
		case "RESET":
			return { side: "buy", type: "market", price: "", amount: "" };
		default:
			return state;
	}
};

export const TradeForm: React.FC<TradeFormProps> = ({
	pair,
	userId,
	onSubmit,
}) => {
	const [state, dispatch] = useReducer(formReducer, {
		side: "buy",
		type: "market",
		price: "",
		amount: "",
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		// Validate amount as string without converting to number to preserve precision
		if (!state.amount || !/^\d*\.?\d+$/.test(state.amount) || parseFloat(state.amount) <= 0) {
			alert("Please enter a valid amount");
			return;
		}

		// Validate price as string for limit orders
		if (
			state.type === "limit" &&
			(!state.price || !/^\d*\.?\d+$/.test(state.price) || parseFloat(state.price) <= 0)
		) {
			alert("Please enter a valid price");
			return;
		}

		onSubmit({
			pair,
			side: state.side,
			type: state.type,
			price: state.type === "limit" ? state.price : undefined,
			amount: state.amount,
			userId,
		});

		dispatch({ type: "RESET" });
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Place Order</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex gap-2">
						<Button
							type="button"
							variant={state.side === "buy" ? "buy" : "outline"}
							className="flex-1"
							onClick={() => dispatch({ type: "SET_SIDE", side: "buy" })}
						>
							Buy
						</Button>
						<Button
							type="button"
							variant={state.side === "sell" ? "sell" : "outline"}
							className="flex-1"
							onClick={() => dispatch({ type: "SET_SIDE", side: "sell" })}
						>
							Sell
						</Button>
					</div>

					<div className="flex gap-2">
						<Button
							type="button"
							variant={state.type === "market" ? "secondary" : "outline"}
							className="flex-1"
							onClick={() =>
								dispatch({ type: "SET_ORDER_TYPE", orderType: "market" })
							}
						>
							Market
						</Button>
						<Button
							type="button"
							variant={state.type === "limit" ? "secondary" : "outline"}
							className="flex-1"
							onClick={() =>
								dispatch({ type: "SET_ORDER_TYPE", orderType: "limit" })
							}
						>
							Limit
						</Button>
					</div>

					{state.type === "limit" && (
						<Input
							type="text"
							placeholder="Price"
							value={state.price}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								dispatch({ type: "SET_PRICE", price: e.target.value })
							}
						/>
					)}

					<Input
						type="text"
						placeholder="Amount"
						value={state.amount}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							dispatch({ type: "SET_AMOUNT", amount: e.target.value })
						}
					/>

					<Button
						type="submit"
						variant={state.side === "buy" ? "buy" : "sell"}
						size="lg"
					>
						{state.side === "buy" ? "Buy" : "Sell"} {pair.split("-")[0]}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
};
