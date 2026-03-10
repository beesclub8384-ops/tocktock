import { NextResponse } from "next/server";
import { loadState, saveState } from "@/lib/ai-trading-store";
import {
  Position,
  TradeRecord,
  MAX_POSITIONS,
  POSITION_SIZE_RATIO,
  MIN_CASH_RATIO,
  MIN_CASH_FOR_BUY,
  TARGET_PROFIT_PCT,
  STOP_LOSS_PCT,
} from "@/lib/types/ai-trading";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

function parseNum(s: string): number {
  return Number(s.replace(/,/g, "")) || 0;
}

/** 개별 종목 현재가 + 고가 + 저가 조회 */
async function fetchCurrentPrice(
  code: string
): Promise<{ close: number; high: number; low: number; open: number } | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/price`,
      { headers: NAVER_HEADERS, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : data;
    if (!item) return null;
    return {
      close: parseNum(String(item.closePrice || item.currentPrice || 0)),
      high: parseNum(String(item.highPrice || item.highestPrice || 0)),
      low: parseNum(String(item.lowPrice || item.lowestPrice || 0)),
      open: parseNum(String(item.openPrice || 0)),
    };
  } catch {
    return null;
  }
}

function getKSTDate(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  return `${kst.getFullYear()}${String(kst.getMonth() + 1).padStart(2, "0")}${String(kst.getDate()).padStart(2, "0")}`;
}

/**
 * 매일 KST 09:05에 실행 — 매수/매도 체크
 *
 * 1. 보유 종목 매도 체크 (+5% 목표가 or -3% 손절)
 * 2. D3_BUY_READY 종목 시가 매수
 */
export async function GET() {
  const todayDate = getKSTDate();
  const state = await loadState();

  if (state.lastTradeCheckDate === todayDate) {
    return NextResponse.json({
      message: "이미 오늘 매매 체크 완료",
      date: todayDate,
    });
  }

  console.log(`[ai-trading-trade] 매매 체크 시작: ${todayDate}`);

  const newTrades: TradeRecord[] = [];

  // 1. 매도 체크 — 보유 종목
  const remainingPositions: Position[] = [];

  for (const pos of state.positions) {
    const price = await fetchCurrentPrice(pos.code);
    if (!price) {
      remainingPositions.push(pos);
      continue;
    }

    let sellReason = "";
    let sellPrice = 0;

    // 장중 고가가 목표가에 도달했는지 확인
    if (price.high >= pos.targetPrice) {
      sellReason = `목표가 도달 (+${(TARGET_PROFIT_PCT * 100).toFixed(0)}%)`;
      sellPrice = pos.targetPrice;
    }
    // 장중 저가가 손절가에 도달했는지 확인
    else if (price.low <= pos.stopLossPrice) {
      sellReason = `손절 (-${(STOP_LOSS_PCT * 100).toFixed(0)}%)`;
      sellPrice = pos.stopLossPrice;
    }

    if (sellReason) {
      const sellAmount = sellPrice * pos.quantity;
      const buyAmount = pos.buyPrice * pos.quantity;
      const pnl = sellAmount - buyAmount;
      const pnlRate = ((sellPrice - pos.buyPrice) / pos.buyPrice) * 100;

      console.log(
        `[trade] 매도: ${pos.name} @${sellPrice} (${sellReason}), 수익=${pnl.toLocaleString()}원 (${pnlRate.toFixed(1)}%)`
      );

      state.cash += sellAmount;
      newTrades.push({
        date: todayDate,
        code: pos.code,
        name: pos.name,
        type: "SELL",
        price: sellPrice,
        quantity: pos.quantity,
        amount: sellAmount,
        pnl,
        pnlRate: Math.round(pnlRate * 100) / 100,
        reason: sellReason,
      });
    } else {
      // 유지
      remainingPositions.push(pos);
    }
  }

  state.positions = remainingPositions;

  // 2. 매수 체크 — D3_BUY_READY 종목
  const buyReadyCandidates = state.candidates.filter(
    (c) => c.stage === "D3_BUY_READY"
  );
  const otherCandidates = state.candidates.filter(
    (c) => c.stage !== "D3_BUY_READY"
  );

  for (const candidate of buyReadyCandidates) {
    // 매수 가능 조건 확인
    if (state.positions.length >= MAX_POSITIONS) {
      console.log(`[trade] 매수 불가 (보유 ${MAX_POSITIONS}종목 한도)`);
      break;
    }

    const totalAsset =
      state.cash +
      state.positions.reduce((s, p) => s + p.buyPrice * p.quantity, 0);
    const minCash = totalAsset * MIN_CASH_RATIO;

    if (state.cash < MIN_CASH_FOR_BUY) {
      console.log(`[trade] 매수 불가 (현금 ${state.cash.toLocaleString()}원 < 100만원)`);
      break;
    }

    // 매수 금액: 전체 자금의 10%
    const buyBudget = Math.min(
      Math.round(totalAsset * POSITION_SIZE_RATIO),
      state.cash - minCash
    );

    if (buyBudget < 100_000) {
      console.log(`[trade] 매수 불가 (매수 가능 금액 부족)`);
      break;
    }

    // D+3 시가에 매수
    const price = await fetchCurrentPrice(candidate.code);
    if (!price || price.open <= 0) {
      console.log(`[trade] ${candidate.name}: 시가 조회 실패`);
      continue;
    }

    const buyPrice = price.open;
    const quantity = Math.floor(buyBudget / buyPrice);
    if (quantity <= 0) continue;

    const buyAmount = buyPrice * quantity;

    // 현금 50% 유지 확인
    if (state.cash - buyAmount < minCash) {
      console.log(
        `[trade] ${candidate.name}: 현금 비율 부족으로 매수 불가`
      );
      continue;
    }

    state.cash -= buyAmount;

    const newPos: Position = {
      code: candidate.code,
      name: candidate.name,
      market: candidate.market,
      buyPrice,
      buyDate: todayDate,
      quantity,
      targetPrice: Math.round(buyPrice * (1 + TARGET_PROFIT_PCT)),
      stopLossPrice: Math.round(buyPrice * (1 - STOP_LOSS_PCT)),
    };

    state.positions.push(newPos);

    console.log(
      `[trade] 매수: ${candidate.name} @${buyPrice} × ${quantity}주 = ${buyAmount.toLocaleString()}원 (목표가 ${newPos.targetPrice}, 손절가 ${newPos.stopLossPrice})`
    );

    newTrades.push({
      date: todayDate,
      code: candidate.code,
      name: candidate.name,
      type: "BUY",
      price: buyPrice,
      quantity,
      amount: buyAmount,
    });
  }

  // 매수 완료된 candidates 제거, 나머지만 유지
  state.candidates = otherCandidates;
  state.trades = [...state.trades, ...newTrades];
  state.lastTradeCheckDate = todayDate;

  await saveState(state);

  return NextResponse.json({
    message: "매매 체크 완료",
    date: todayDate,
    trades: newTrades,
    positions: state.positions.length,
    cash: state.cash,
  });
}
