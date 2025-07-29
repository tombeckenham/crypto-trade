import React, { useReducer } from "react";
import { type PlaceOrderRequest } from "../services/api";

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
			return { ...state, price: action.price };
		case "SET_AMOUNT":
			return { ...state, amount: action.amount };
		case "RESET":
			return { side: "buy", type: "limit", price: "", amount: "" };
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
		type: "limit",
		price: "",
		amount: "",
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const amount = parseFloat(state.amount);
		const price = state.type === "limit" ? parseFloat(state.price) : undefined;

		if (isNaN(amount) || amount <= 0) {
			alert("Please enter a valid amount");
			return;
		}

		if (state.type === "limit" && (!price || isNaN(price) || price <= 0)) {
			alert("Please enter a valid price");
			return;
		}

		onSubmit({
			pair,
			side: state.side,
			type: state.type,
			price,
			amount,
			userId,
		});

		dispatch({ type: "RESET" });
	};

	return (
		<form
			onSubmit={handleSubmit}
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "16px",
				padding: "16px",
				background: "#1a1a1a",
				borderRadius: "4px",
				color: "#e0e0e0",
			}}
		>
			<div style={{ display: "flex", gap: "8px" }}>
				<button
					type="button"
					onClick={() => dispatch({ type: "SET_SIDE", side: "buy" })}
					style={{
						flex: 1,
						padding: "8px",
						border: "none",
						borderRadius: "4px",
						background: state.side === "buy" ? "#26a69a" : "#333",
						color: "#fff",
						cursor: "pointer",
					}}
				>
					Buy
				</button>
				<button
					type="button"
					onClick={() => dispatch({ type: "SET_SIDE", side: "sell" })}
					style={{
						flex: 1,
						padding: "8px",
						border: "none",
						borderRadius: "4px",
						background: state.side === "sell" ? "#ef5350" : "#333",
						color: "#fff",
						cursor: "pointer",
					}}
				>
					Sell
				</button>
			</div>

			<div style={{ display: "flex", gap: "8px" }}>
				<button
					type="button"
					onClick={() =>
						dispatch({ type: "SET_ORDER_TYPE", orderType: "limit" })
					}
					style={{
						flex: 1,
						padding: "8px",
						border: "1px solid #444",
						borderRadius: "4px",
						background: state.type === "limit" ? "#444" : "transparent",
						color: "#fff",
						cursor: "pointer",
					}}
				>
					Limit
				</button>
				<button
					type="button"
					onClick={() =>
						dispatch({ type: "SET_ORDER_TYPE", orderType: "market" })
					}
					style={{
						flex: 1,
						padding: "8px",
						border: "1px solid #444",
						borderRadius: "4px",
						background: state.type === "market" ? "#444" : "transparent",
						color: "#fff",
						cursor: "pointer",
					}}
				>
					Market
				</button>
			</div>

			{state.type === "limit" && (
				<input
					type="number"
					step="0.01"
					placeholder="Price"
					value={state.price}
					onChange={(e) =>
						dispatch({ type: "SET_PRICE", price: e.target.value })
					}
					style={{
						padding: "8px",
						border: "1px solid #444",
						borderRadius: "4px",
						background: "#222",
						color: "#fff",
					}}
				/>
			)}

			<input
				type="number"
				step="0.000001"
				placeholder="Amount"
				value={state.amount}
				onChange={(e) =>
					dispatch({ type: "SET_AMOUNT", amount: e.target.value })
				}
				style={{
					padding: "8px",
					border: "1px solid #444",
					borderRadius: "4px",
					background: "#222",
					color: "#fff",
				}}
			/>

			<button
				type="submit"
				style={{
					padding: "12px",
					border: "none",
					borderRadius: "4px",
					background: state.side === "buy" ? "#26a69a" : "#ef5350",
					color: "#fff",
					fontWeight: "bold",
					cursor: "pointer",
				}}
			>
				{state.side === "buy" ? "Buy" : "Sell"} {pair.split("-")[0]}
			</button>
		</form>
	);
};
