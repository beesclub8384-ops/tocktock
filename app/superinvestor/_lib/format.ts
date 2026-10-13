// 금액·숫자 표시 (단위: 달러)

export const MONO = { fontFamily: "'DM Mono', monospace" } as const;

export function formatUSD(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatLargeUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

/** 소수점 아래 0 은 떼고 최대 2자리: 723 → "$723", 507.03 → "$507.03" */
export function formatPrice(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** -29.87 → "−29.9%" (마이너스 기호는 U+2212) */
export function formatSignedPct(n: number, digits = 1): string {
  const abs = Math.abs(n).toFixed(digits);
  if (n < 0) return `−${abs}%`;
  if (n > 0) return `+${abs}%`;
  return `${abs}%`;
}

/** ISO 시각 → "2026. 10. 13. 오후 01:23" (한국시간) */
export function formatKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Dataroma 회사명에 섞여 오는 HTML 엔티티를 화면용으로 푼다 ("S&amp;P Global" → "S&P Global") */
export function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
