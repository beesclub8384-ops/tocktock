// 분기 문자열("Q2 2026") → 분기말 날짜·표시 문구·오늘까지 경과일

export interface QuarterInfo {
  /** 태그용: "Q2 2026" 또는 "최근 공시 분기" */
  label: string;
  /** 문장용: "6월 30일" 또는 "최근 공시 분기" (quarter 가 비면 날짜를 모름) */
  endLabel: string;
  /** 분기말부터 오늘(한국시간)까지 지난 날 수. quarter 가 비면 null */
  daysSince: number | null;
}

const QUARTER_END: Record<string, [month: number, day: number]> = {
  "1": [3, 31],
  "2": [6, 30],
  "3": [9, 30],
  "4": [12, 31],
};

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function parseQuarter(quarter: string, now: Date = new Date()): QuarterInfo {
  const m = quarter.trim().match(/^Q([1-4])\s+(\d{4})$/);
  if (!m) {
    return { label: "최근 공시 분기", endLabel: "최근 공시 분기", daysSince: null };
  }
  const [month, day] = QUARTER_END[m[1]];
  const year = parseInt(m[2], 10);
  // 날짜 차이만 필요하므로 둘 다 UTC 자정 기준 날짜로 맞춘다 (오늘은 한국시간 날짜)
  const endUtc = Date.UTC(year, month - 1, day);
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const todayUtc = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
  return {
    label: quarter.trim(),
    endLabel: `${month}월 ${day}일`,
    daysSince: Math.max(0, Math.round((todayUtc - endUtc) / DAY_MS)),
  };
}
