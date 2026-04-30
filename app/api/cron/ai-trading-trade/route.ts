import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
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

// ── KIS API: 시가 조회용 (lib/kis-client.ts와 동일 토큰 캐시 키 공유) ──
const KIS_BASE = "https://openapi.koreainvestment.com:9443";
const KIS_TOKEN_KEY = "futures-trading:kis-token";

interface KisTokenCache {
  access_token: string;
  expires_at: number;
}

async function getKisAccessToken(): Promise<string | null> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return null;
  try {
    const cached = await redis.get<KisTokenCache>(KIS_TOKEN_KEY);
    if (cached?.access_token && cached.expires_at - Date.now() > 10 * 60 * 1000) {
      return cached.access_token;
    }
    const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: appKey,
        appsecret: appSecret,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as {
      access_token?: string;
      access_token_token_expired?: string;
    };
    if (!data.access_token || !data.access_token_token_expired) return null;
    const expiresAt = new Date(
      data.access_token_token_expired.replace(" ", "T") + "+09:00"
    ).getTime();
    await redis.set(KIS_TOKEN_KEY, {
      access_token: data.access_token,
      expires_at: expiresAt,
    });
    return data.access_token;
  } catch (err) {
    console.error("[kis-token] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** KIS 실시간 시세 조회 — 매수 시 시가(stck_oprc) 확보용 */
async function fetchKisPrice(
  code: string
): Promise<{ open: number; high: number; low: number; close: number } | null> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return null;
  const token = await getKisAccessToken();
  if (!token) return null;
  try {
    const url = `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`;
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST01010100",
        custtype: "P",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      rt_cd?: string;
      output?: {
        stck_oprc?: string;
        stck_hgpr?: string;
        stck_lwpr?: string;
        stck_prpr?: string;
      };
    };
    if (data.rt_cd !== "0" || !data.output) return null;
    const open = Number(data.output.stck_oprc ?? "0");
    const high = Number(data.output.stck_hgpr ?? "0");
    const low = Number(data.output.stck_lwpr ?? "0");
    const close = Number(data.output.stck_prpr ?? "0");
    if (open <= 0) return null;
    return {
      open,
      high: high > 0 ? high : open,
      low: low > 0 ? low : open,
      close: close > 0 ? close : open,
    };
  } catch (err) {
    console.error("[kis-price] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** 개별 종목 현재가 + 고가 + 저가 조회 (todayDate가 주어지면 당일 데이터만 반환) */
async function fetchCurrentPrice(
  code: string,
  todayDate?: string
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

    // 당일 날짜 검증: localTradedAt(YYYY-MM-DD)을 YYYYMMDD로 변환 후 비교
    if (todayDate && item.localTradedAt) {
      const itemDate = String(item.localTradedAt).replace(/-/g, "");
      if (itemDate !== todayDate) {
        console.log(`[fetchCurrentPrice] ${code}: 오늘(${todayDate}) 데이터 없음 (최신: ${itemDate})`);
        return null;
      }
    }

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
  const LOCK_KEY = "lock:cron:ai-trading-trade";
  const locked = await redis.set(LOCK_KEY, "1", { ex: 600, nx: true });
  if (!locked) {
    return NextResponse.json({ message: "이미 실행 중 (lock)" });
  }
  try {
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

    // D+3 시가에 매수: KIS 우선, 실패 시 네이버 fallback
    let price = await fetchKisPrice(candidate.code);
    if (!price || price.open <= 0) {
      price = await fetchCurrentPrice(candidate.code, todayDate);
    }
    if (!price || price.open <= 0) {
      console.log(`[trade] ${candidate.name}: 당일 시가 조회 실패 (KIS+네이버 모두)`);
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

  // cron 실행 시각 업데이트 (lastScanTime은 보존)
  const existingCronStatusRaw = await redis.get("ai-trading:cron-status");
  const existingCronStatus =
    typeof existingCronStatusRaw === "string"
      ? JSON.parse(existingCronStatusRaw)
      : existingCronStatusRaw ?? {};
  await redis.set(
    "ai-trading:cron-status",
    JSON.stringify({
      ...existingCronStatus,
      lastTradeCheckTime: new Date().toISOString(),
    })
  );

  return NextResponse.json({
    message: "매매 체크 완료",
    date: todayDate,
    trades: newTrades,
    positions: state.positions.length,
    cash: state.cash,
  });
  } catch (error) {
    console.error("[ai-trading-trade] 매매 체크 중 에러:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await redis.del(LOCK_KEY).catch(() => {});
  }
}
