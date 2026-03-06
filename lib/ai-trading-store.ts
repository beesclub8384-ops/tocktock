import { redis } from "@/lib/redis";
import {
  AiTradingState,
  INITIAL_CAPITAL,
} from "@/lib/types/ai-trading";

const STATE_KEY = "ai-trading:state";
const STATE_TTL = 365 * 86400; // 1년

export async function loadState(): Promise<AiTradingState> {
  try {
    const data = await redis.get<AiTradingState>(STATE_KEY);
    if (data) return data;
  } catch {
    /* miss */
  }

  // 초기 상태
  return {
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
}

export async function saveState(state: AiTradingState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await redis.set(STATE_KEY, state, { ex: STATE_TTL });
}
