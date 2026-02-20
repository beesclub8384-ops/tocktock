/**
 * data.go.kr GetMarketIndexInfoService — KOSPI/KOSDAQ 상장시가총액 조회
 * 활용신청: https://www.data.go.kr/data/15094807/openapi.do
 */

export interface MarketIndexItem {
  date: string;           // YYYY-MM-DD
  marketCap: number;      // 상장시가총액 (조원)
}

interface ApiItem {
  basDt?: string;
  idxNm?: string;
  lstgMrktTotAmt?: string;  // 상장시가총액 (원)
}

interface ApiResponse {
  response?: {
    body?: {
      items?: {
        item?: ApiItem[];
      };
      totalCount?: number;
    };
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
  };
}

function formatDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function toJoWon(val?: string): number {
  if (!val) return 0;
  const n = Number(val.replace(/,/g, ""));
  if (isNaN(n)) return 0;
  return Math.round(n / 1_000_000_000_000 * 10) / 10; // 원 → 조원 (소수점 1자리)
}

/**
 * 특정 지수의 일별 상장시가총액을 조회
 * @param idxNm "코스피" 또는 "코스닥"
 */
export async function fetchMarketCap(
  idxNm: "코스피" | "코스닥"
): Promise<MarketIndexItem[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const beginBasDt = sixMonthsAgo.toISOString().slice(0, 10).replace(/-/g, "");

  const url = new URL(
    "https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService/getStockMarketIndex"
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", "200");
  url.searchParams.set("beginBasDt", beginBasDt);
  url.searchParams.set("idxNm", idxNm);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Market index API responded with ${res.status}`);
  }

  const json: ApiResponse = await res.json();

  const header = json.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(header?.resultMsg ?? "Unknown API error");
  }

  const items = json.response?.body?.items?.item ?? [];

  return items
    .filter((item) => item.basDt && item.lstgMrktTotAmt)
    .map((item) => ({
      date: formatDate(item.basDt!),
      marketCap: toJoWon(item.lstgMrktTotAmt),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
