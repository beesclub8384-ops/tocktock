import type { CreditBalanceItem } from "@/lib/types/credit-balance";

// ── 공공데이터포털 API ──

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

/** 백만원 → 억원 변환 (FreeSIS 데이터용) */
function millionsToEok(val: number): number {
  return Math.round(val / 100);
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

// ── FreeSIS 직접 조회 (최신 데이터 보완용) ──

interface FreeSISItem {
  TMPV1?: string; // 날짜 YYYYMMDD
  TMPV2?: string; // 신용거래융자 전체 (백만원)
  TMPV3?: string; // 유가증권 융자 (백만원)
  TMPV4?: string; // 코스닥 융자 (백만원)
}

interface FreeSISResponse {
  ds1?: FreeSISItem[];
}

/**
 * FreeSIS(금융투자협회)에서 최근 신용융자잔고 데이터를 직접 조회합니다.
 * 공공데이터포털보다 1일 빠르게 반영됩니다.
 */
export async function fetchFreeSISRecentData(
  days: number = 14
): Promise<CreditBalanceItem[]> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const res = await fetch("https://freesis.kofia.or.kr/meta/getMetaDataList.do", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json",
    },
    body: JSON.stringify({
      dmSearch: {
        tmpV40: "1000000", // 백만원 단위
        tmpV41: "1",
        tmpV1: "D",        // 일간
        tmpV45: fmt(start),
        tmpV46: fmt(now),
        OBJ_NM: "STATSCU0100000070BO",
      },
    }),
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    console.warn(`FreeSIS API responded with ${res.status}`);
    return [];
  }

  const json: FreeSISResponse = await res.json();
  const list = json?.ds1 ?? [];

  return list
    .filter((item) => item.TMPV1?.match(/^\d{8}$/) && Number(item.TMPV2) > 0)
    .map((item) => ({
      date: formatDate(item.TMPV1!),
      totalLoan: millionsToEok(Number(item.TMPV2 || 0)),
      kospiLoan: millionsToEok(Number(item.TMPV3 || 0)),
      kosdaqLoan: millionsToEok(Number(item.TMPV4 || 0)),
      totalShortSell: 0,
      depositLoan: 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
