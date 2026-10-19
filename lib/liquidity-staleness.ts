/**
 * 미국 유동성 점수의 "낡은 입력" 규칙 (2026-10-19 미션 9, 결정 로그 21-1 — 계산 전에 선언, 한 번만 적용).
 *
 * 평가 시점에서 구성 요소의 마지막 관측일(자료 날짜)이 갱신 주기의 3배보다 오래되면 그 시점 점수에서 뺀다.
 *  - 영업일(bday): 마지막 관측일 다음 날부터 평가일까지의 평일 수가 3 초과
 *  - 주간(weekly): 21일 초과
 *  - 월간(monthly): 93일(3×31) 초과
 * 남은 구성 요소의 결합 점수를 단순 평균한다(빼기 전과 같은 방식).
 */

export type Cadence = "bday" | "weekly" | "monthly";

export const STALE_LIMIT = { bday: 3, weekly: 21, monthly: 93 } as const;

const DAY = 86_400_000;
const toMs = (ymd: string) => Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);

/** a 다음 날부터 b 까지(b 포함) 평일 수 */
export function weekdaysAfter(a: string, b: string): number {
  let n = 0;
  for (let t = toMs(a) + DAY; t <= toMs(b); t += DAY) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** 마지막 관측일이 없거나(자료 없음) 기준보다 오래되면 true */
export function isStale(lastObs: string | null | undefined, asOf: string, cadence: Cadence): boolean {
  if (!lastObs) return true;
  if (cadence === "bday") return weekdaysAfter(lastObs, asOf) > STALE_LIMIT.bday;
  return (toMs(asOf) - toMs(lastObs)) / DAY > STALE_LIMIT[cadence];
}

/** 정렬된 날짜 목록에서 asOf 이하의 마지막 날짜 (없으면 null) */
export function lastOnOrBefore(sortedAsc: string[], asOf: string): string | null {
  let lo = 0;
  let hi = sortedAsc.length - 1;
  let ans: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= asOf) {
      ans = sortedAsc[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

const CADENCE_LABEL: Record<Cadence, string> = {
  bday: "영업일마다 갱신되는 자료인데 3영업일",
  weekly: "매주 갱신되는 자료인데 21일",
  monthly: "매달 갱신되는 자료인데 93일",
};

/** 화면에 보여 줄 사유 (존댓말) */
export function staleReason(lastObs: string | null | undefined, cadence: Cadence): string {
  if (!lastObs) return "받은 자료가 없어 뺐습니다.";
  return `마지막 관측일이 ${lastObs.slice(0, 10)}입니다. ${CADENCE_LABEL[cadence]}보다 오래되어 낡은 값으로 보고 뺐습니다.`;
}

export interface ExcludedComponent {
  id: string;
  name: string;
  lastDate: string | null;
  reason: string;
  /** 점수 아래 한 줄 표시용 짧은 사유 (미션 12: "중단", "재게시 허락 필요", "낡은 값") */
  short?: string;
}
