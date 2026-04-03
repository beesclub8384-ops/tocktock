import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const BASE_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query";

const CACHE_TTL = 86400; // 24시간

// Bill은 high_discnt_rate, 나머지는 high_yield
const FIELDS_BILL =
  "auction_date,security_type,security_term,high_discnt_rate,bid_to_cover_ratio";
const FIELDS_OTHER =
  "auction_date,security_type,security_term,high_yield,bid_to_cover_ratio";

// TIPS → security_type=Note + inflation_index_security=Yes
// FRN  → security_type=Note + floating_rate=Yes
type SecurityCategory = "Bill" | "Note" | "Bond" | "TIPS" | "FRN";

function buildFilter(
  category: SecurityCategory,
  term: string,
  startDate?: string,
): string {
  const parts: string[] = [];

  if (category === "TIPS") {
    parts.push("inflation_index_security:eq:Yes");
  } else if (category === "FRN") {
    parts.push("floating_rate:eq:Yes");
  } else {
    parts.push(`security_type:eq:${category}`);
    // Note/Bond에서 TIPS, FRN 제외
    if (category === "Note" || category === "Bond") {
      parts.push("inflation_index_security:eq:No");
      parts.push("floating_rate:eq:No");
    }
  }

  parts.push(`security_term:eq:${term}`);

  if (startDate) {
    parts.push(`auction_date:gte:${startDate}`);
  }

  return parts.join(",");
}

function getStartDate(period: string): string | undefined {
  if (period === "all") return undefined;
  const now = new Date();
  const years = period === "1y" ? 1 : period === "3y" ? 3 : 5;
  now.setFullYear(now.getFullYear() - years);
  return now.toISOString().slice(0, 10);
}

interface RawRecord {
  auction_date: string;
  high_yield?: string | null;
  high_discnt_rate?: string | null;
  bid_to_cover_ratio?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const securityType = (searchParams.get("security_type") || "Bill") as SecurityCategory;
    const securityTerm = searchParams.get("security_term") || "4-Week";
    const period = searchParams.get("period") || "1y";

    // 캐시 확인
    const cacheKey = `treasury-history:v1:${securityType}:${securityTerm}:${period}`;
    const cached = await redis.get<{ data: { date: string; rate: number | null; bidToCover: number | null }[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const isBill = securityType === "Bill";
    const fields = isBill
      ? FIELDS_BILL
      : `${FIELDS_OTHER}${securityType === "TIPS" ? ",inflation_index_security" : ""}${securityType === "FRN" ? ",floating_rate" : ""}`;

    const startDate = getStartDate(period);
    const filter = buildFilter(securityType, securityTerm, startDate);

    // 페이지네이션: 최대 10000건
    const url = `${BASE_URL}?fields=${fields}&filter=${filter}&sort=auction_date&page[size]=10000&format=json`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      throw new Error(`FiscalData API error: ${res.status}`);
    }

    const json = await res.json();
    const records: RawRecord[] = json.data || [];

    const data = records.map((r) => {
      const rateRaw = isBill ? r.high_discnt_rate : r.high_yield;
      const rate = rateRaw ? parseFloat(rateRaw) : null;
      const btc = r.bid_to_cover_ratio ? parseFloat(r.bid_to_cover_ratio) : null;
      return {
        date: r.auction_date,
        rate: rate !== null && !isNaN(rate) ? rate : null,
        bidToCover: btc !== null && !isNaN(btc) ? btc : null,
      };
    });

    const result = { data };

    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL });
    } catch {
      /* cache write fail ok */
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("treasury-bill-history API error:", e);
    return NextResponse.json(
      { error: "Failed to fetch treasury history data" },
      { status: 500 },
    );
  }
}
