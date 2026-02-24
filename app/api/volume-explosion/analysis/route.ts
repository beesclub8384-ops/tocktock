import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

// --- 상수 ---
const ANALYSIS_PREFIX = "volume-analysis";
const ANALYSIS_TTL = 3 * 86400; // 3일
const THEME_MAP_PREFIX = "naver-themes";
const THEME_MAP_TTL = 86400; // 1일
const CACHE_PREFIX = "volume-explosion";

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

// --- 타입 ---
interface ExplosionStock {
  code: string;
  name: string;
  yesterdayValue: number;
  todayValue: number;
  closePrice: number;
  changeRate: number;
  market: string;
}

interface VolumeExplosionResponse {
  todayDate: string;
  yesterdayDate: string;
  marketOpen: boolean;
  yesterdayStocks: unknown[];
  explosionStocks: ExplosionStock[];
  updatedAt: string;
}

interface ThemeInfo {
  no: string;
  name: string;
}

// --- 유틸 ---
function getKSTNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 3600000);
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function isMarketOpen(kstNow: Date): boolean {
  const day = kstNow.getDay();
  if (day === 0 || day === 6) return false;
  const hhmm = kstNow.getHours() * 100 + kstNow.getMinutes();
  return hhmm >= 900 && hhmm < 1530;
}

// --- 네이버 테마 스크래핑 ---

/** 테마 목록 페이지에서 테마 ID·이름 추출 */
async function fetchThemeList(): Promise<ThemeInfo[]> {
  const themes: ThemeInfo[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 7; page++) {
    try {
      const res = await fetch(
        `https://finance.naver.com/sise/theme.naver?&page=${page}`,
        { headers: NAVER_HEADERS, signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const html = new TextDecoder("euc-kr").decode(buf);
      const regex =
        /sise_group_detail\.naver\?type=theme&no=(\d+)[^>]*>([^<]+)/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const no = match[1];
        if (!seen.has(no)) {
          seen.add(no);
          themes.push({ no, name: match[2].trim() });
        }
      }
    } catch {
      /* skip page */
    }
  }

  console.log(`[theme] 테마 목록: ${themes.length}개`);
  return themes;
}

/** 테마 상세 페이지에서 종목 코드 추출 */
async function fetchThemeStocks(themeNo: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${themeNo}`,
      { headers: NAVER_HEADERS, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("euc-kr").decode(buf);
    const regex = /main\.naver\?code=(\d{6})/g;
    const codes = new Set<string>();
    let match;
    while ((match = regex.exec(html)) !== null) {
      codes.add(match[1]);
    }
    return [...codes];
  } catch {
    return [];
  }
}

/** 전체 테마 → 종목코드 역매핑 생성 (종목코드 → 테마명[]) */
async function buildThemeMap(): Promise<Record<string, string[]>> {
  const themes = await fetchThemeList();
  const codeToThemes: Record<string, string[]> = {};

  // 배치로 테마 상세 페이지 조회 (10개씩, 200ms 딜레이)
  const BATCH = 10;
  for (let i = 0; i < themes.length; i += BATCH) {
    const batch = themes.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (theme) => {
        const codes = await fetchThemeStocks(theme.no);
        return { name: theme.name, codes };
      }),
    );
    for (const { name, codes } of results) {
      for (const code of codes) {
        if (!codeToThemes[code]) codeToThemes[code] = [];
        codeToThemes[code].push(name);
      }
    }
    if (i + BATCH < themes.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if ((i / BATCH) % 5 === 0) {
      console.log(
        `[theme] 진행: ${Math.min(i + BATCH, themes.length)}/${themes.length}`,
      );
    }
  }

  return codeToThemes;
}

/** Redis 캐시 포함 테마맵 조회 */
async function getThemeMap(date: string): Promise<Record<string, string[]>> {
  const cacheKey = `${THEME_MAP_PREFIX}:${date}`;

  try {
    const cached = await redis.get<Record<string, string[]>>(cacheKey);
    if (cached && Object.keys(cached).length > 0) {
      console.log(`[theme] 캐시 히트: ${cacheKey}`);
      return cached;
    }
  } catch {
    /* miss */
  }

  console.log(`[theme] 캐시 미스 — 네이버에서 테마 데이터 수집 시작`);
  const themeMap = await buildThemeMap();

  try {
    await redis.set(cacheKey, themeMap, { ex: THEME_MAP_TTL });
    console.log(
      `[theme] 캐시 저장: ${cacheKey}, ${Object.keys(themeMap).length}종목`,
    );
  } catch {
    /* */
  }

  return themeMap;
}

// --- Claude API ---
function formatBillion(value: number): string {
  const eok = Math.round(value / 100_000_000);
  if (eok >= 10000) return (eok / 10000).toFixed(1) + "조";
  return eok.toLocaleString() + "억";
}

function buildAnalysisPrompt(
  stocks: ExplosionStock[],
  themeMap: Record<string, string[]>,
  date: string,
): string {
  const dateStr = `${date.slice(0, 4)}년 ${parseInt(date.slice(4, 6))}월 ${parseInt(date.slice(6, 8))}일`;

  const stockSummary = stocks
    .map((s) => {
      const themes = themeMap[s.code] || [];
      const multiple =
        s.yesterdayValue > 0 ? (s.todayValue / s.yesterdayValue).toFixed(1) : "N/A";
      return `- ${s.name} (${s.code}, ${s.market}): 어제 ${formatBillion(s.yesterdayValue)} → 오늘 ${formatBillion(s.todayValue)} (${multiple}배), 등락률 ${s.changeRate >= 0 ? "+" : ""}${s.changeRate.toFixed(2)}%, 종가 ${s.closePrice.toLocaleString()}원${themes.length > 0 ? `\n  테마: ${themes.join(", ")}` : ""}`;
    })
    .join("\n");

  return `당신은 한국 주식시장 전문 분석가입니다. TockTock이라는 투자 분석 서비스에서 글을 씁니다.

## 글쓰기 스타일
- 존댓말 사용 (~합니다, ~입니다)
- 친근하고 쉽게, 하지만 가볍지 않게
- 어려운 개념은 비유나 예시로 설명
- 한 문장은 짧게, 핵심은 **볼드** 처리
- 근거 없는 예측 금지 ("반드시 오릅니다" X)

## 데이터

${dateStr} 거래대금 폭발 종목 (어제 300억 이하 → 오늘 1,000억 이상):

${stockSummary}

## 분석 요청

위 종목들을 분석하여 아래 4개 섹션을 작성하세요. **마크다운 형식**으로 출력합니다.

### 작성 규칙
1. 전체 길이는 400~800자 (간결하게)
2. 각 섹션 제목 앞에 이모지 하나 사용
3. "## " 제목은 사용하지 말고 "**제목**" 형태로 볼드 처리
4. 불릿(-) 사용하여 가독성 확보
5. 종목명을 언급할 때 볼드 처리

### 필수 섹션

**🔍 공통 테마**
이 종목들이 오늘 동시에 거래대금이 폭발한 공통적인 이유나 테마를 분석하세요. 네이버 금융 테마 데이터가 있다면 참고하세요.

**⚡ 종목별 포인트**
각 종목의 핵심 차이점을 한 줄씩 정리하세요.

**⚠️ 리스크 요인**
투자 시 주의해야 할 점을 2~3개 제시하세요.

**💡 한줄 요약**
오늘의 거래대금 폭발을 한 문장으로 정리하세요.`;
}

async function callClaudeAnalysis(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

// --- 메인 핸들러 ---
export async function GET() {
  const kstNow = getKSTNow();
  const todayKST = fmtDate(kstNow);
  const marketOpen = isMarketOpen(kstNow);

  // 장중이면 분석 없음
  if (marketOpen) {
    return NextResponse.json({ analysis: null, reason: "market_open" });
  }

  // 캐시 확인
  const analysisKey = `${ANALYSIS_PREFIX}:${todayKST}`;
  try {
    const cached = await redis.get<{
      analysis: string;
      generatedAt: string;
      stockCount: number;
    }>(analysisKey);
    if (cached) {
      console.log(`[analysis] 캐시 히트: ${analysisKey}`);
      return NextResponse.json(cached);
    }
  } catch {
    /* miss */
  }

  // 메인 API 캐시에서 폭발 종목 읽기
  const mainCacheKey = `${CACHE_PREFIX}:${todayKST}:closed`;
  let mainData: VolumeExplosionResponse | null = null;
  try {
    mainData = await redis.get<VolumeExplosionResponse>(mainCacheKey);
  } catch {
    /* */
  }

  if (!mainData || mainData.explosionStocks.length === 0) {
    return NextResponse.json({
      analysis: null,
      reason: "no_explosion_stocks",
    });
  }

  const explosionStocks = mainData.explosionStocks;
  const dataDate = mainData.todayDate;

  console.log(
    `[analysis] ${explosionStocks.length}종목 분석 시작 (date=${dataDate})`,
  );

  // 테마 데이터 수집
  const themeMap = await getThemeMap(dataDate);

  // 폭발 종목의 테마 확인
  for (const s of explosionStocks) {
    const themes = themeMap[s.code] || [];
    console.log(`[analysis] ${s.name}: ${themes.length > 0 ? themes.join(", ") : "(테마 없음)"}`);
  }

  // Claude API 호출
  const prompt = buildAnalysisPrompt(explosionStocks, themeMap, dataDate);
  let analysisText: string;
  try {
    analysisText = await callClaudeAnalysis(prompt);
  } catch (err) {
    console.error("[analysis] Claude API 에러:", err);
    return NextResponse.json(
      { error: "AI 분석 생성 실패" },
      { status: 500 },
    );
  }

  const result = {
    analysis: analysisText,
    generatedAt: new Date().toISOString(),
    stockCount: explosionStocks.length,
  };

  // 캐시 저장
  try {
    await redis.set(analysisKey, result, { ex: ANALYSIS_TTL });
    console.log(`[analysis] 캐시 저장: ${analysisKey}`);
  } catch {
    /* */
  }

  return NextResponse.json(result);
}
