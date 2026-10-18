/**
 * 관측소 수집기 공용 검사 — 받은 시계열로 저장분을 덮어써도 되는지 확인한다.
 *
 * 출처가 중간이 빠지거나 잘린 파일을 내놓은 적이 있다(연준 GZ CSV, 2018-07-06 게시본에
 * 2017-10~2018-03 결측). 그런 파일로 덮어쓰면 판정이 조용히 틀린다. 통과 못 하면 던져서
 * 기존 저장분을 지키고 cron errors 에 남긴다. 과거 값의 개정은 막지 않는다.
 */

/** "2026-09" → 그다음 달 */
export function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** "2026Q2" → 그다음 분기 */
export function nextQuarter(q: string): string {
  const y = Number(q.slice(0, 4));
  const n = Number(q.slice(5));
  return n === 4 ? `${y + 1}Q1` : `${y}Q${n + 1}`;
}

/**
 *  - 중간이 빠지지 않았는가 (연속)
 *  - 최신 시점이 저장된 것보다 뒤로 가지 않았는가
 *  - 개수가 저장된 것보다 줄지 않았는가 (앞이나 끝이 잘린 파일)
 */
export function assertReplaceable(
  what: string,
  labels: string[],
  existing: string[],
  next: (l: string) => string
): void {
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] !== next(labels[i - 1])) throw new Error(`${what}: ${labels[i - 1]} 다음이 ${labels[i]} — 중간이 빠짐`);
  }
  if (existing.length === 0) return;
  const last = labels[labels.length - 1];
  const prevLast = existing[existing.length - 1];
  if (last < prevLast) throw new Error(`${what}: 최신 ${last} 가 저장된 ${prevLast} 보다 앞섬`);
  if (labels.length < existing.length) throw new Error(`${what}: ${labels.length}개 — 저장된 ${existing.length}개보다 적음`);
}

/**
 * 간격이 불규칙한 시계열(영업일·입찰)용 — 연속 검사 없이 최신 시점 후퇴와 개수 감소만 막는다.
 * (2026-10-18 독립 검증 지적: 잘린 응답이 저장분을 덮어쓸 수 있었다)
 */
export function assertNotShrunk(what: string, labels: string[], existing: string[]): void {
  if (existing.length === 0 || labels.length === 0) return;
  const last = labels[labels.length - 1];
  const prevLast = existing[existing.length - 1];
  if (last < prevLast) throw new Error(`${what}: 최신 ${last} 가 저장된 ${prevLast} 보다 앞섬`);
  if (labels.length < existing.length) throw new Error(`${what}: ${labels.length}개 — 저장된 ${existing.length}개보다 적음`);
}
