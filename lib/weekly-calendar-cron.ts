import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { buildWeeklyCalendar, indicatorNamesByAgency, type WeeklyCalendarBlob } from "@/lib/weekly-calendar";

/**
 * weekly-calendar 수집 cron 공용 핸들러.
 * 여러 스케줄(새벽/아침/밤) 경로가 동일한 수집 로직·Redis 키·CRON_SECRET 인증을 재사용한다.
 * 모두 같은 weekly-calendar:data 키를 덮어쓰므로 팝업·페이지는 변경 없이 그 키만 읽으면 된다.
 */
export const WEEKLY_CALENDAR_CACHE_KEY = "weekly-calendar:data";

export async function handleWeeklyCalendarCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { diagnostics, ...data } = await buildWeeklyCalendar();

    // 미션 9 (독립 검증 지적 2): 어떤 기관의 일정표를 하나도 못 읽었으면, 그 기관의 지표 일정을 빈 채로 덮어쓰지 않고
    // 직전 저장분에서 오늘 이후 일정을 가져와 남긴다(응답 warnings 에 남김). Vercel cron 은 응답 본문을 보지 않아,
    // errors 만으로는 화면에서 일정이 조용히 사라지기 때문.
    if (diagnostics) {
      const failed = Object.entries(diagnostics.sourceCounts)
        .filter(([, c]) => c.datesRead === 0)
        .map(([agency]) => agency as keyof ReturnType<typeof indicatorNamesByAgency>);
      if (failed.length > 0) {
        const prev = await redis.get<WeeklyCalendarBlob>(WEEKLY_CALENDAR_CACHE_KEY);
        const names = new Set(failed.flatMap((a) => indicatorNamesByAgency()[a]));
        const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST (일정 날짜와 같은 기준)
        const kept = (prev?.events ?? []).filter(
          (e) => e.category === "indicator" && e.market === "US" && names.has(e.name) && e.date >= today && e.date <= data.rangeEnd
        );
        if (kept.length > 0) {
          // buildWeeklyCalendar 와 같은 순서: 날짜 → 시장(KR 먼저) → 종류(지표 먼저) → 이름
          data.events = [...data.events, ...kept].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.market !== b.market) return a.market === "KR" ? -1 : 1;
            if (a.category !== b.category) return a.category === "indicator" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        }
        diagnostics.warnings.push(`${failed.join("·")} 일정표를 읽지 못해 직전 수집분의 지표 일정 ${kept.length}건을 남겼습니다.`);
      }
    }

    // Upstash Redis는 자동 직렬화 → 객체 그대로 저장 (진단은 저장하지 않고 응답에만 싣는다)
    await redis.set(WEEKLY_CALENDAR_CACHE_KEY, data);
    return NextResponse.json({
      success: true,
      count: data.events.length,
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      updatedAt: data.updatedAt,
      // 미션 9: 공식 일정표(BLS·BEA·인구조사국) 수집 실패·빈 일정을 응답에 드러낸다. 기관별 읽은 수 포함
      ...(diagnostics
        ? {
            ...(diagnostics.errors.length > 0 ? { errors: diagnostics.errors } : {}),
            ...(diagnostics.warnings.length > 0 ? { warnings: diagnostics.warnings } : {}),
            sourceCounts: diagnostics.sourceCounts,
          }
        : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
