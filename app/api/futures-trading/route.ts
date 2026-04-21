import { NextRequest, NextResponse } from "next/server";
import {
  loadRecords,
  addRecord,
  deleteRecord,
  updateMemo,
  loadQuantified,
  appendThreadsToRecord,
  saveMarketData,
  loadMarketData,
  listMarketDataDates,
  addQuantifiedCondition,
} from "@/lib/futures-trading-store";
import type { FuturesRecord, QAThread, QuantifiedCondition } from "@/lib/types/futures-trading";
import { analyzeWithMarketData } from "@/lib/futures-claude-analyzer";
import { fetchMarketDataForDate, hasAnyData } from "@/lib/futures-market-data";

const PASSWORD = "8384";

// Vercel Hobby: 최대 300초. Yahoo fetch + Claude 분석이 넉넉히 들어갈 60초로 설정
export const maxDuration = 120;

function checkAuth(request: NextRequest): boolean {
  const pw = request.headers.get("x-password");
  return pw === PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [records, marketDataDates] = await Promise.all([loadRecords(), listMarketDataDates()]);
    return NextResponse.json({ records, marketDataDates });
  } catch (error) {
    console.error("[futures-trading] GET error:", error);
    return NextResponse.json(
      { error: "데이터를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const record: FuturesRecord = {
      id: crypto.randomUUID(),
      date: body.date,
      direction: body.direction,
      entryTime: body.entryTime,
      entryPoint: Number(body.entryPoint),
      exitTime: body.exitTime,
      exitPoint: Number(body.exitPoint),
      contracts: Number(body.contracts),
      pnl: Number(body.pnl),
      memo: body.memo || "",
      createdAt: new Date().toISOString(),
    };

    await addRecord(record);
    console.log("[futures-trading] record saved", { id: record.id, date: record.date });

    // 시장 데이터 수집 (실패해도 record 저장은 유지)
    let marketDataOk = false;
    try {
      // 기존 데이터가 있으면 재사용, 없으면 Yahoo에서 수집
      let marketData = await loadMarketData(record.date);
      if (!marketData || !hasAnyData(marketData)) {
        marketData = await fetchMarketDataForDate(record.date);
        await saveMarketData(record.date, marketData);
      }
      marketDataOk = hasAnyData(marketData);
      console.log("[futures-trading] market data", {
        date: record.date,
        hasData: marketDataOk,
      });

      // analyzeWithMarketData로 패턴 추출
      const quantifiedList = await loadQuantified();
      const analysis = await analyzeWithMarketData(record, marketData, quantifiedList);
      console.log("[futures-trading] analysis done", {
        confirmed: analysis.confirmedConditions.length,
        questions: analysis.questions.length,
      });

      // confirmedConditions → quantified에 추가
      const now = new Date().toISOString();
      for (const c of analysis.confirmedConditions) {
        const q: QuantifiedCondition = {
          id: crypto.randomUUID(),
          condition: c.condition,
          value: c.value,
          status: "completed",
          reason: c.dataEvidence,
          sourceRecordId: record.id,
          sourceThreadId: "",
          createdAt: now,
        };
        await addQuantifiedCondition(q);
      }

      // questions → qaThreads (status: open)
      if (analysis.questions.length) {
        const threads: QAThread[] = analysis.questions.map((q) => ({
          id: crypto.randomUUID(),
          title: q.title,
          status: "open",
          createdAt: now,
          replies: [],
        }));
        await appendThreadsToRecord(record.id, threads);
      }

      return NextResponse.json({
        success: true,
        record,
        marketDataAvailable: marketDataOk,
        patternFound: analysis.patternFound,
        confirmedCount: analysis.confirmedConditions.length,
        questionCount: analysis.questions.length,
      });
    } catch (err) {
      console.error("[futures-trading] market-data analysis failed:", err);
      // 분석 실패해도 record는 이미 저장됨
      return NextResponse.json({
        success: true,
        record,
        marketDataAvailable: marketDataOk,
        analysisError: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (error) {
    console.error("[futures-trading] POST error:", error);
    return NextResponse.json(
      { error: "기록 추가에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, memo } = await request.json();
    if (!id || typeof memo !== "string") {
      return NextResponse.json(
        { error: "id와 memo가 필요합니다." },
        { status: 400 }
      );
    }
    const updated = await updateMemo(id, memo);
    if (!updated) {
      return NextResponse.json(
        { error: "해당 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[futures-trading] PATCH error:", error);
    return NextResponse.json(
      { error: "메모 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    const deleted = await deleteRecord(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "해당 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[futures-trading] DELETE error:", error);
    return NextResponse.json(
      { error: "삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
