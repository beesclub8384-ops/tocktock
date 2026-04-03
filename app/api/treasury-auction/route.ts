import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const CACHE_KEY = "treasury:auctions";
const CACHE_TTL = 1800; // 30분
const VERIFY_KEY = "treasury:auctions:lastVerified";
const VERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6시간

const PICK_FIELDS = [
  "cusip",
  "securityType",
  "term",
  "auctionDate",
  "maturityDate",
  "offeringAmount",
  "highYield",
  "highDiscountRate",
  "highInvestmentRate",
  "bidToCoverRatio",
  "totalTendered",
  "totalAccepted",
  "indirectBidderAccepted",
  "interestRate",
  "tips",
  "floatingRate",
] as const;

type AuctionItem = Record<(typeof PICK_FIELDS)[number], string>;

interface CachedData {
  upcoming: AuctionItem[];
  results: AuctionItem[];
  updatedAt: string;
}

function pick(raw: Record<string, string>): AuctionItem {
  const out = {} as Record<string, string>;
  for (const k of PICK_FIELDS) out[k] = raw[k] ?? "";
  return out as AuctionItem;
}

async function fetchFreshData(): Promise<CachedData> {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const past = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);
  const startDate = past.toISOString().slice(0, 10);

  const [upcomingRes, resultsRes] = await Promise.allSettled([
    fetch(
      "https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json",
      { signal: AbortSignal.timeout(10000) },
    ),
    fetch(
      `https://www.treasurydirect.gov/TA_WS/securities/search?startDate=${startDate}&endDate=${endDate}&dateFieldName=auctionDate&format=json`,
      { signal: AbortSignal.timeout(10000) },
    ),
  ]);

  const upcomingRaw: Record<string, string>[] =
    upcomingRes.status === "fulfilled" ? await upcomingRes.value.json() : [];
  const resultsRaw: Record<string, string>[] =
    resultsRes.status === "fulfilled" ? await resultsRes.value.json() : [];

  const upcoming = upcomingRaw.map(pick);
  const results = resultsRaw
    .filter((r) => r.bidToCoverRatio && r.bidToCoverRatio !== "")
    .map(pick);

  return { upcoming, results, updatedAt: now.toISOString() };
}

// 백그라운드 검증 (await 없이 호출)
function backgroundVerify(cached: CachedData) {
  (async () => {
    try {
      // 마지막 검증 시각 확인
      const lastVerified = await redis.get<string>(VERIFY_KEY);
      if (lastVerified) {
        const elapsed = Date.now() - new Date(lastVerified).getTime();
        if (elapsed < VERIFY_INTERVAL_MS) return; // 6시간 이내면 스킵
      }

      // 원본 데이터 가져오기
      const fresh = await fetchFreshData();

      // 최근 10개 결과 비교
      const cachedRecent = cached.results
        .sort((a, b) => new Date(b.auctionDate).getTime() - new Date(a.auctionDate).getTime())
        .slice(0, 10);
      const freshRecent = fresh.results
        .sort((a, b) => new Date(b.auctionDate).getTime() - new Date(a.auctionDate).getTime())
        .slice(0, 10);

      let mismatch = false;
      for (const cr of cachedRecent) {
        const fr = freshRecent.find(
          (f) => f.cusip === cr.cusip && f.auctionDate === cr.auctionDate
        );
        if (!fr) { mismatch = true; break; }
        if (cr.highYield !== fr.highYield || cr.highDiscountRate !== fr.highDiscountRate) {
          mismatch = true;
          break;
        }
      }

      if (mismatch) {
        console.log("[treasury-auction] ⚠️ 불일치 감지, 캐시 갱신");
        await redis.set(CACHE_KEY, fresh, { ex: CACHE_TTL });
      } else {
        console.log("[treasury-auction] ✅ 데이터 일치");
      }

      // 검증 시각 기록
      await redis.set(VERIFY_KEY, new Date().toISOString(), { ex: VERIFY_INTERVAL_MS / 1000 });
    } catch (err) {
      console.error("[treasury-auction] 백그라운드 검증 오류:", err);
    }
  })();
}

export async function GET() {
  try {
    const cached = await redis.get<CachedData>(CACHE_KEY);

    if (cached) {
      // 사용자에게 즉시 반환, 백그라운드로 검증 시작
      backgroundVerify(cached);
      return NextResponse.json(cached);
    }

    // 캐시 미스: 원본에서 가져오기
    const data = await fetchFreshData();

    try {
      await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });
    } catch { /* cache write fail ok */ }

    return NextResponse.json(data);
  } catch (e) {
    console.error("treasury-auction API error:", e);
    return NextResponse.json(
      { error: "Failed to fetch treasury auction data" },
      { status: 500 },
    );
  }
}
