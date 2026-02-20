import type { CreditBalanceItem } from "@/lib/types/credit-balance";

interface ApiItem {
  basDt?: string;
  crdTrFingWhl?: string;
  crdTrFingScrs?: string;
  crdTrFingKosdaq?: string;
  crdTrLndrWhl?: string;
  dpsgScrtMogFing?: string;
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

function toEok(val?: string): number {
  if (!val) return 0;
  const n = Number(val.replace(/,/g, ""));
  if (isNaN(n)) return 0;
  return Math.round(n / 100_000_000);
}

export interface FetchCreditBalanceOptions {
  beginBasDt?: string;  // YYYYMMDD, default: 6개월 전
  numOfRows?: number;   // default: 200
}

export async function fetchCreditBalanceData(
  options?: FetchCreditBalanceOptions
): Promise<CreditBalanceItem[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  let beginBasDt = options?.beginBasDt;
  if (!beginBasDt) {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    beginBasDt = sixMonthsAgo.toISOString().slice(0, 10).replace(/-/g, "");
  }
  const numOfRows = options?.numOfRows ?? 200;

  const url = new URL(
    "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService/getGrantingOfCreditBalanceInfo"
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("beginBasDt", beginBasDt);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }

  const json: ApiResponse = await res.json();

  const header = json.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(header?.resultMsg ?? "Unknown API error");
  }

  const items = json.response?.body?.items?.item ?? [];

  return items
    .filter((item) => item.basDt)
    .map((item) => ({
      date: formatDate(item.basDt!),
      totalLoan: toEok(item.crdTrFingWhl),
      kospiLoan: toEok(item.crdTrFingScrs),
      kosdaqLoan: toEok(item.crdTrFingKosdaq),
      totalShortSell: toEok(item.crdTrLndrWhl),
      depositLoan: toEok(item.dpsgScrtMogFing),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
