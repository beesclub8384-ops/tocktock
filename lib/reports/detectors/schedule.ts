import { daysBetween, fetchWithRetry, safeUrl } from "../fetcher";
import { isSeen, setNextRelease } from "../store";
import type { DetectContext, DetectResult, ScheduleConfig } from "../types";

/** 발표 후 이만큼 지나도 404 면 오류로 남긴다 (설계서 5-1) */
const GRACE_DAYS = 3;

function fill(template: string, date: string): string {
  return template.replace("{YYYYMMDD}", date.replaceAll("-", "")).replace("{date}", date);
}

/**
 * 발표 일정 방식 (FOMC 성명) — 설계서 5-1
 *
 * 오늘(미 동부) 이하 발표일 중 아직 저장 안 된 날짜만 본다.
 * 성명은 발표일 오후 2시(미 동부)에 나오는데 cron 은 오전 10~11시에 돈다.
 * 그래서 발표 당일은 404 가 정상이고, 다음 날 실행에서 잡힌다.
 */
export async function detectSchedule(
  config: ScheduleConfig,
  ctx: DetectContext
): Promise<DetectResult> {
  const result: DetectResult = { candidates: [], notes: [], errors: [] };
  const dates = [...config.dates].sort();

  const next = dates.find((d) => d > ctx.today) ?? null;
  await setNextRelease(ctx.sourceId, next);
  if (!next) result.notes.push("일정표에 다음 발표일이 없음 — 일정 갱신 필요");

  const due = dates.filter((d) => d >= config.startFrom && d <= ctx.today);
  for (const date of due) {
    if (await isSeen(ctx.sourceId, date)) continue;

    const pageUrl = fill(config.pageUrlTemplate, date);
    const res = await fetchWithRetry(pageUrl);
    if (res.status === 404) {
      const late = daysBetween(date, ctx.today);
      if (late > GRACE_DAYS) {
        result.errors.push(`${date} 성명이 발표 ${late}일 뒤에도 404 (${safeUrl(pageUrl)})`);
      } else {
        result.notes.push(`${date} 성명 아직 안 올라옴 (404) — 다음 실행에서 재확인`);
      }
      continue;
    }
    if (!res.ok) {
      result.errors.push(`${date} 성명 페이지 HTTP ${res.status}`);
      continue;
    }
    result.candidates.push({
      editionKey: date,
      title: fill(config.titleTemplate, date),
      publishedAt: date,
      sourceUrl: pageUrl,
      fileUrl: fill(config.fileUrlTemplate, date),
    });
  }

  return result;
}
