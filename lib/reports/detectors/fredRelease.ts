import { fetchText } from "../fetcher";
import { isSeen, setNextRelease } from "../store";
import type { DetectContext, DetectResult, FredConfig } from "../types";
import { siteUsesOfficialSchedules } from "@/lib/site-source-config";
import { fetchBlsCpiDates } from "@/lib/official-release-dates";

interface FredReleaseDatesResponse {
  release_dates?: { release_id: number; date: string }[];
}

/**
 * FRED 발표일 API 방식 (CPI) — 설계서 5-2
 *
 * 응답 날짜 중 오늘(미 동부) 이하 가장 최근 = 최신 발표일, 오늘보다 큰 첫 날짜 = 다음 발표일.
 * 미래 발표일을 받으려면 include_release_dates_with_no_data=true 가 필수다.
 *
 * ⚠ BLS cpi.pdf 는 항상 "최신본" 하나뿐인 고정 주소다. 발표가 미뤄지면 지난 호가
 *   그대로 남아 있어, 새 날짜로 저장하면 조용히 틀린 파일이 쌓인다.
 *   그래서 notBefore 를 붙여 수집 단계에서 Last-Modified 를 확인하게 한다.
 *
 * 미션 8: 발표일은 BLS 공식 일정표(ics)에서 받는다(2025-01~2026-12 CPI 발표일 23개가 FRED release 10 과 모두 같음).
 *   SITE_DATA_SOURCE=fred 면 예전처럼 FRED release/dates. 이름(fredRelease·method "fred")은 저장된 설정과 맞추려고 그대로 둔다.
 */
export async function detectFredRelease(
  config: FredConfig,
  ctx: DetectContext
): Promise<DetectResult> {
  const result: DetectResult = { candidates: [], notes: [], errors: [] };

  let dates: string[];
  if (siteUsesOfficialSchedules()) {
    if (config.releaseId !== 10) throw new Error(`공식 일정표 대응이 없는 FRED release ${config.releaseId}`);
    dates = await fetchBlsCpiDates(); // 오름차순
  } else {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) throw new Error("FRED_API_KEY 환경변수 미설정");

    const url =
      `https://api.stlouisfed.org/fred/release/dates?release_id=${config.releaseId}` +
      `&api_key=${apiKey}&file_type=json&include_release_dates_with_no_data=true` +
      `&sort_order=desc&limit=24`;
    const json = JSON.parse(await fetchText(url)) as FredReleaseDatesResponse;
    dates = (json.release_dates ?? []).map((d) => d.date).sort(); // 오름차순
    if (dates.length === 0) throw new Error(`FRED release ${config.releaseId} 발표일 응답이 비어 있음`);
  }

  const latest = [...dates].reverse().find((d) => d <= ctx.today) ?? null;
  const next = dates.find((d) => d > ctx.today) ?? null;
  await setNextRelease(ctx.sourceId, next);
  result.notes.push(`최신 발표일 ${latest ?? "없음"}, 다음 발표일 ${next ?? "없음"}`);

  if (!latest) return result;
  if (await isSeen(ctx.sourceId, latest)) return result;

  result.candidates.push({
    editionKey: latest,
    title: config.titleTemplate.replace("{date}", latest),
    publishedAt: latest,
    sourceUrl: config.sourceUrl,
    fileUrl: config.fileUrl,
    notBefore: latest,
  });
  return result;
}
