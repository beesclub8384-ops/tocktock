/**
 * 보고서 수집기 공통 HTTP
 *
 * - User-Agent 에 연락처를 넣는다. BLS 약관은 "소유자 연락처가 없는 로봇은
 *   차단할 수 있다"고 명시한다 (설계서 5-2).
 * - 요청마다 20초 제한 + 1회 재시도 (설계서 9장). 404 같은 4xx 는 의미 있는
 *   응답이라 재시도하지 않고 그대로 돌려준다 (FOMC 는 404 = 아직 안 올라옴).
 */

export const REPORTS_USER_AGENT =
  "TockTock-ReportCollector/1.0 (contact: beesclub8384@gmail.com)";

const TIMEOUT_MS = 20_000;

/**
 * 오류 메시지에 쓸 주소. 쿼리스트링은 뺀다 — FRED 주소에 api_key 가 들어 있고,
 * 오류 메시지는 Redis 오류 목록과 /reports 화면에 그대로 남는다.
 */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(잘못된 주소)";
  }
}

export async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": REPORTS_USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status >= 500 && attempt === 0) {
        lastError = new Error(`${safeUrl(url)} → HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  // fetch 가 던지는 메시지에 원래 주소가 섞일 수 있어 safeUrl 로 다시 감싼다
  throw new Error(`${safeUrl(url)} 요청 실패: ${detail.replace(/https?:\/\/\S+/g, "(url)")}`);
}

/** 200 이 아니면 던진다 — 상태 코드가 의미를 갖지 않는 요청용 */
export async function fetchText(url: string): Promise<string> {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`${safeUrl(url)} → HTTP ${res.status}`);
  return res.text();
}

/** 오늘 날짜 (미 동부 기준) YYYY-MM-DD — 미국 발표물은 모두 이 기준으로 본다 */
export function todayEt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 임의 시각을 미 동부 날짜 YYYY-MM-DD 로 */
export function toEtDate(date: Date): string {
  return todayEt(date);
}

/** a → b 까지 일수 (YYYY-MM-DD, b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
