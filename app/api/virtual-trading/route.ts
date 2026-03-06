import { NextResponse } from "next/server";
import { loadState, saveState } from "@/lib/virtual-trading-store";
import {
  INITIAL_CAPITAL,
  VirtualTradingState,
} from "@/lib/types/virtual-trading";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadState();

  // 요약 정보 계산
  const investedValue = state.positions.reduce(
    (sum, p) => sum + p.buyPrice * p.quantity,
    0
  );
  const totalAsset = state.cash + investedValue;
  const returnRate =
    ((totalAsset - state.initialCapital) / state.initialCapital) * 100;

  // 손익비 계산
  const sells = state.trades.filter((t) => t.type === "SELL");
  const wins = sells.filter((t) => (t.pnl || 0) > 0);
  const losses = sells.filter((t) => (t.pnl || 0) < 0);
  const avgWin =
    wins.length > 0
      ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length
      : 0;
  const avgLoss =
    losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length)
      : 0;
  const profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  const winRate = sells.length > 0 ? (wins.length / sells.length) * 100 : 0;

  return NextResponse.json({
    ...state,
    summary: {
      totalAsset,
      cash: state.cash,
      investedValue,
      returnRate: Math.round(returnRate * 100) / 100,
      profitLossRatio: Math.round(profitLossRatio * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      totalTrades: sells.length,
      wins: wins.length,
      losses: losses.length,
    },
  });
}

// 리셋 기능
export async function DELETE() {
  const freshState: VirtualTradingState = {
    cash: INITIAL_CAPITAL,
    initialCapital: INITIAL_CAPITAL,
    positions: [],
    trades: [],
    candidates: [],
    equityCurve: [
      {
        date: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
        totalAsset: INITIAL_CAPITAL,
        cash: INITIAL_CAPITAL,
        investedValue: 0,
        returnRate: 0,
      },
    ],
    lastScanDate: "",
    lastTradeCheckDate: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveState(freshState);
  return NextResponse.json({ message: "리셋 완료", state: freshState });
}
