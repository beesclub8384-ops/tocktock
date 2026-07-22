import { redis } from "@/lib/redis";
import { getKisToken } from "@/lib/kis-client";

/* 코스피/코스닥 시장 일별 거래대금 (KRX 정규장 기준, NXT 미포함)
 * 데이터 출처: KIS 국내업종 시세 API
 *   - 기간별시세: inquire-daily-indexchartprice (tr_id=FHPUP02120000)
 *   - 현재가:     inquire-index-price          (tr_id=FHPUP02100000)
 * 단위: KIS acml_tr_pbmn / prdy_tr_pbmn 은 "백만원" → 저장 시 원 단위로 환산
 * Redis 키: market-tradevalue:history
 */

const KIS_BASE = "https://openapi.koreainvestment.com:9443";
const HISTORY_KEY = "market-tradevalue:history";

// 국내업종 코드
export const KOSPI = "0001";
export const KOSDAQ = "1001";

/** 시장 일별 거래대금 한 점 (모든 금액은 원 단위) */
export interface TradeValuePoint {
  date: string; // YYYY-MM-DD
  kospi: number; // 코스피 거래대금 (원)
  kosdaq: number; // 코스닥 거래대금 (원)
  total: number; // kospi + kosdaq (원)
}

/** fetchIndexHistory 반환 한 점 */
export interface IndexTradeValue {
  date: string; // YYYY-MM-DD
  tradeValue: number; // 거래대금 (원)
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

/** "YYYYMMDD" → "YYYY-MM-DD" */
function toDashDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** "YYYYMMDD" 기준 daysBefore 일 전의 "YYYYMMDD" */
function shiftYmd(yyyymmdd: string, daysBefore: number): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - daysBefore);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

interface DailyChartRow {
  stck_bsop_date?: string;
  acml_tr_pbmn?: string;
}

/**
 * 국내업종 기간별시세 조회. endDate("YYYYMMDD") 이하의 최근 약 100거래일 일별 거래대금.
 * 더 과거는 endDate 를 당겨가며 반복 호출한다.
 *
 * ⚠ KIS 파라미터 실측(scripts/probe-kis-daterange.mjs 로 확인):
 *   - FID_INPUT_DATE_1 = 조회 "종료일(최신)" 앵커. 응답은 이 날짜 이하 100거래일.
 *   - FID_INPUT_DATE_2 는 사실상 무시됨(값을 바꿔도 결과 동일).
 *   따라서 endDate 를 DATE_1 에 넣는다. (KIS 문서/명칭과 반대이므로 주의)
 * @param iscd 업종코드 (KOSPI="0001" | KOSDAQ="1001")
 * @param endDate 조회 종료일 "YYYYMMDD"
 */
export async function fetchIndexHistory(
  iscd: string,
  endDate: string
): Promise<IndexTradeValue[]> {
  const token = await getKisToken();
  const beginDate = shiftYmd(endDate, 150); // DATE_2용(무시되지만 구간 의도 명시)

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: iscd,
    FID_INPUT_DATE_1: endDate, // 종료일(최신) 앵커
    FID_INPUT_DATE_2: beginDate,
    FID_PERIOD_DIV_CODE: "D",
  });
  const url = `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: requireEnv("KIS_APP_KEY"),
      appsecret: requireEnv("KIS_APP_SECRET"),
      tr_id: "FHPUP02120000",
      custtype: "P",
    },
  });
  if (!res.ok) {
    throw new Error(`KIS index history HTTP ${res.status}`);
  }
  const j = (await res.json()) as {
    rt_cd?: string;
    msg1?: string;
    output2?: DailyChartRow[];
  };
  if (j.rt_cd !== "0") {
    throw new Error(`KIS index history failed: rt_cd=${j.rt_cd} msg=${j.msg1}`);
  }

  const rows = Array.isArray(j.output2) ? j.output2 : [];
  const out: IndexTradeValue[] = [];
  for (const r of rows) {
    const ymd = r.stck_bsop_date;
    if (!ymd || ymd.length !== 8) continue;
    const pbmn = Number(r.acml_tr_pbmn); // 단위: 백만원
    if (!Number.isFinite(pbmn)) continue;
    out.push({
      date: toDashDate(ymd),
      tradeValue: pbmn * 1_000_000, // 백만원 → 원
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

interface IndexPriceOutput {
  prdy_tr_pbmn?: string;
}

/**
 * 국내업종 현재가 조회 → 전일 확정 거래대금(원) 반환.
 * Cron 이 매 영업일 전일 확정 거래대금을 붙일 때 사용할 용도. (단위: 백만원 → 원)
 * @param iscd 업종코드 (KOSPI="0001" | KOSDAQ="1001")
 */
export async function fetchIndexToday(iscd: string): Promise<number> {
  const token = await getKisToken();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: iscd,
  });
  const url = `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-index-price?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: requireEnv("KIS_APP_KEY"),
      appsecret: requireEnv("KIS_APP_SECRET"),
      tr_id: "FHPUP02100000",
      custtype: "P",
    },
  });
  if (!res.ok) {
    throw new Error(`KIS index price HTTP ${res.status}`);
  }
  const j = (await res.json()) as { rt_cd?: string; msg1?: string; output?: IndexPriceOutput };
  if (j.rt_cd !== "0" || !j.output) {
    throw new Error(`KIS index price failed: rt_cd=${j.rt_cd} msg=${j.msg1}`);
  }
  const pbmn = Number(j.output.prdy_tr_pbmn); // 단위: 백만원 (전일 확정)
  if (!Number.isFinite(pbmn)) return 0;
  return pbmn * 1_000_000; // 백만원 → 원
}

/**
 * 거래대금 히스토리 저장. 기존 데이터와 날짜 기준으로 병합(같은 날짜는 덮어쓰기) 후
 * 날짜 오름차순 정렬해 저장한다. (Upstash 자동 직렬화 — JSON.stringify 금지)
 */
export async function saveTradeValueHistory(records: TradeValuePoint[]): Promise<void> {
  const existing = (await redis.get<TradeValuePoint[]>(HISTORY_KEY)) ?? [];
  const byDate = new Map<string, TradeValuePoint>();
  for (const p of existing) byDate.set(p.date, p);
  for (const p of records) byDate.set(p.date, p); // 새 데이터가 덮어쓰기
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  await redis.set(HISTORY_KEY, merged);
}

/** 거래대금 히스토리 로드. (Upstash 자동 역직렬화 — JSON.parse 금지) */
export async function loadTradeValueHistory(): Promise<TradeValuePoint[]> {
  const data = await redis.get<TradeValuePoint[]>(HISTORY_KEY);
  return data ?? [];
}
