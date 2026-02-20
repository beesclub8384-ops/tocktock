import { NextResponse } from "next/server";
import type { CreditBalanceItem } from "@/lib/types/credit-balance";

interface ApiItem {
  basDt?: string;
  crdtLnTotAmt?: string;
  stkmkCrdtLnAmt?: string;
  kosdaqCrdtLnAmt?: string;
  lrgscStckBrrwTotAmt?: string;
  dpstScrtsDpstLnAmt?: string;
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

function parseNumber(val?: string): number {
  if (!val) return 0;
  const n = Number(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export async function GET() {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  // 6개월 전 날짜 계산
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const beginBasDt = sixMonthsAgo.toISOString().slice(0, 10).replace(/-/g, "");

  const url = new URL(
    "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService/getGrantingOfCreditBalanceInfo"
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", "200");
  url.searchParams.set("beginBasDt", beginBasDt);

  try {
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

    const data: CreditBalanceItem[] = items
      .filter((item) => item.basDt)
      .map((item) => ({
        date: formatDate(item.basDt!),
        totalLoan: parseNumber(item.crdtLnTotAmt),
        kospiLoan: parseNumber(item.stkmkCrdtLnAmt),
        kosdaqLoan: parseNumber(item.kosdaqCrdtLnAmt),
        totalShortSell: parseNumber(item.lrgscStckBrrwTotAmt),
        depositLoan: parseNumber(item.dpstScrtsDpstLnAmt),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Credit balance API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit balance data" },
      { status: 500 }
    );
  }
}
