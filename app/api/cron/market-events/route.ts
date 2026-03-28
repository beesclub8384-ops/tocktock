import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import YahooFinance from "yahoo-finance2";
import { redis } from "@/lib/redis";
import {
  type MarketEvent,
  type MarketEventsStore,
  MARKET_EVENT_THRESHOLD,
  WATCHED_SYMBOLS,
} from "@/lib/types/market-events";

const yahooFinance = new YahooFinance();
const REDIS_KEY = "market-events:v1";
const MAX_EVENTS = 90;

export async function GET(request: NextRequest) {
  // CRON_SECRET 인증
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date()
      .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
      .replace(/\. /g, "-")
      .replace(/\./g, "");
    // ISO 형식으로 변환: YYYY-MM-DD
    const now = new Date();
    const kstDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 1. 각 지수의 당일 등락률 조회
    const quoteResults = await Promise.allSettled(
      WATCHED_SYMBOLS.map(async (idx) => {
        const result = await yahooFinance.quote(idx.symbol);
        const quote = result as unknown as {
          regularMarketChangePercent?: number;
        };
        return {
          ...idx,
          changePercent: quote.regularMarketChangePercent ?? 0,
        };
      })
    );

    // 2. ±1.5% 이상인 지수만 필터링
    const fulfilled = quoteResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ symbol: string; name: string; market: string; changePercent: number }>).value);
    const significant = fulfilled.filter(
      (q) => Math.abs(q.changePercent) >= MARKET_EVENT_THRESHOLD
    );

    if (significant.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        events: [],
        message: "No significant moves today",
      });
    }

    // 3. Anthropic API로 원인 요약 생성
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const newEvents: MarketEvent[] = [];

    for (const item of significant) {
      const direction = item.changePercent > 0 ? "상승" : "하락";
      const pct = Math.abs(item.changePercent).toFixed(2);

      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [
            {
              role: "user",
              content: `오늘(${kstDate}) ${item.name}이 ${pct}% ${direction}한 이유를 검색해서 한국어로 3줄 이���로 요약해줘. 핵��� 원인만 간결하게. 불필요한 말 없이 팩트만.`,
            },
          ],
        });

        // content 블록에서 type:"text"인 것만 추출
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === "text"
        );
        const summary =
          textBlocks.map((b) => b.text).join("\n") ||
          "요약을 생성하지 ���했습니다.";

        newEvents.push({
          date: kstDate,
          symbol: item.symbol,
          name: item.name,
          changePercent: Number(item.changePercent.toFixed(2)),
          direction,
          summary,
          searchedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(
          `[market-events] Anthropic API error for ${item.name}:`,
          err
        );
        newEvents.push({
          date: kstDate,
          symbol: item.symbol,
          name: item.name,
          changePercent: Number(item.changePercent.toFixed(2)),
          direction,
          summary: "AI 요약 생성 중 오류가 발생했습니다.",
          searchedAt: new Date().toISOString(),
        });
      }
    }

    // 4. Redis에서 기존 데이터 읽기 + 새 이벤트 병합
    const existing =
      await redis.get<MarketEventsStore>(REDIS_KEY);
    const existingEvents = existing?.events ?? [];

    // 같은 날짜+symbol 중복이면 덮어쓰기
    const merged = [...existingEvents];
    for (const newEvt of newEvents) {
      const idx = merged.findIndex(
        (e) => e.date === newEvt.date && e.symbol === newEvt.symbol
      );
      if (idx >= 0) {
        merged[idx] = newEvt;
      } else {
        merged.push(newEvt);
      }
    }

    // 날짜 내림차순 정렬 후 최대 90개만 유지
    merged.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const trimmed = merged.slice(0, MAX_EVENTS);

    const store: MarketEventsStore = {
      events: trimmed,
      lastUpdated: new Date().toISOString(),
    };

    await redis.set(REDIS_KEY, store);

    return NextResponse.json({
      success: true,
      processed: newEvents.length,
      events: newEvents,
    });
  } catch (error) {
    console.error("[market-events] Cron error:", error);
    return NextResponse.json(
      { error: "Failed to process market events" },
      { status: 500 }
    );
  }
}
