import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { redis } from "@/lib/redis";
import { getProvider } from "@/lib/investor-flow-engine";
import type {
  InvestorFlowApiResponse,
  NormalizedTrend,
} from "@/lib/types/investor-flow";

export const dynamic = "force-dynamic";

const CACHE_TTL_SEC = 24 * 60 * 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365 * 3; // 한 번 조회 최대 3년

interface StockNameEntry {
  symbol: string;
  code: string;
  name: string;
  market: string;
}

let stockNamesCache: Map<string, string> | null = null;

async function lookupStockName(code: string): Promise<string | null> {
  if (!stockNamesCache) {
    try {
      const filePath = path.join(process.cwd(), "data", "stock-names.json");
      const raw = await fs.readFile(filePath, "utf-8");
      const list = JSON.parse(raw) as StockNameEntry[];
      stockNamesCache = new Map(list.map((s) => [s.code, s.name]));
    } catch {
      stockNamesCache = new Map();
    }
  }
  return stockNamesCache.get(code) ?? null;
}

function ymdYesterdayKst(): string {
  const now = new Date();
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayDiff(a: string, b: string): number {
  const ad = new Date(`${a}T00:00:00Z`).getTime();
  const bd = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((bd - ad) / 86400000);
}

function err(msg: string, status = 400): NextResponse<InvestorFlowApiResponse> {
  return NextResponse.json({ data: null, error: msg }, { status });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolRaw = (searchParams.get("symbol") ?? "").trim();
  const start = (searchParams.get("start") ?? "").trim();
  const endParam = (searchParams.get("end") ?? "").trim();

  if (!/^\d{6}$/.test(symbolRaw)) {
    return err("종목 코드는 6자리 숫자여야 합니다 (예: 005930)");
  }
  if (!DATE_RE.test(start)) {
    return err("start 날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)");
  }
  const end = endParam && DATE_RE.test(endParam) ? endParam : ymdYesterdayKst();

  if (start > end) {
    return err("start가 end보다 늦을 수 없습니다");
  }
  const span = dayDiff(start, end);
  if (span > MAX_RANGE_DAYS) {
    return err(
      `조회 기간이 너무 깁니다 (최대 ${MAX_RANGE_DAYS}일). 시작일을 더 최근으로 조정해 주세요.`
    );
  }

  const name = await lookupStockName(symbolRaw);

  const cacheKey = `investor-flow:v1:${symbolRaw}:${start}:${end}`;
  try {
    const cached = await redis.get<NormalizedTrend>(cacheKey);
    if (cached) {
      const withName = cached.name === name ? cached : { ...cached, name };
      return NextResponse.json<InvestorFlowApiResponse>({
        data: withName,
        cached: true,
      });
    }
  } catch {
    // Redis 실패해도 진행
  }

  let trend: NormalizedTrend;
  try {
    const provider = getProvider();
    trend = await provider.fetchTrend(symbolRaw, start, end);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return err(`데이터 수집 실패: ${msg}`, 502);
  }
  trend = { ...trend, name };

  try {
    await redis.set(cacheKey, trend, { ex: CACHE_TTL_SEC });
  } catch {
    // Redis 실패해도 응답은 정상 반환
  }

  return NextResponse.json<InvestorFlowApiResponse>({
    data: trend,
    cached: false,
  });
}
