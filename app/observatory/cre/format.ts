/**
 * CRE 익스포저 표기.
 *
 * ⚠ "use client" 를 넣지 않는다. 서버 컴포넌트인 page.tsx 와 클라이언트인
 *   차트가 같이 쓰는 파일이기 때문이다.
 *   "use client" 파일의 함수를 서버에서 부르면 클라이언트 참조 프록시가 잡혀
 *   런타임 예외가 난다.
 */

/** 연체율 — 1.42 → "1.42%" (소수 둘째 자리까지 봐야 움직임이 보인다) */
export function formatDelinq(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

/** 집중도 — 34.43 → "34.4%" */
export function formatConcentration(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** 변화량 (%p) — +0.91%p / −0.30%p / 없으면 "—" */
export function formatPp(pp: number | null): string {
  if (pp === null) return "—";
  const sign = pp >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pp).toFixed(2)}%p`;
}

/** "2026Q2" → "2026년 2분기" */
export function formatQuarter(quarter: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  return m ? `${m[1]}년 ${m[2]}분기` : quarter;
}

/**
 * 자산 규모 구간 라벨을 한국어로 줄인다.
 *
 * 워크북 원문은 "Assets $1 Billion - $10 Billion" 처럼 길어 차트 축에
 * 안 들어간다. 원문을 그대로 두고 표시만 바꾼다.
 */
export function formatBucket(label: string): string {
  const map: Record<string, string> = {
    "Assets > $250 Billion": "2,500억$ 초과",
    "Assets  $10 Billion - $250 Billion": "100억~2,500억$",
    "Assets $1 Billion - $10 Billion": "10억~100억$",
    "Assets $100 Million - $1 Billion": "1억~10억$",
    "Assets < $100 Million": "1억$ 미만",
    "All Insured Institutions": "전체",
  };
  return map[label] ?? label;
}
