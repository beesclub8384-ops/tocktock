import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { fetchText, toEtDate } from "../fetcher";
import { isSeen } from "../store";
import type { DetectContext, DetectResult, RssConfig } from "../types";

const parser = new Parser();

/**
 * RSS 방식 (연준 금융안정보고서) — 설계서 5-3
 *
 * 피드에서 제목에 titleIncludes 가 들어간 항목만 고르고, 항목 링크(보도자료)를
 * 열어 pdfLinkIncludes 가 들어간 .pdf 링크를 찾는다.
 * editionKey = 보도자료 날짜 (미 동부 기준 YYYY-MM-DD).
 *
 * 피드에는 최근 보도자료만 남는다. 해당 항목이 없으면 "대상 없음"이 정상이다.
 */
export async function detectRss(config: RssConfig, ctx: DetectContext): Promise<DetectResult> {
  const result: DetectResult = { candidates: [], notes: [], errors: [] };

  // rss-parser 의 parseURL 은 User-Agent 를 못 바꿔서 공통 fetcher 로 받아 넘긴다
  const feed = await parser.parseString(await fetchText(config.feedUrl));
  const needle = config.titleIncludes.toLowerCase();
  const items = (feed.items ?? []).filter((i) => i.title?.toLowerCase().includes(needle));

  if (items.length === 0) {
    result.notes.push(`대상 없음 — 피드 ${feed.items?.length ?? 0}건 중 "${config.titleIncludes}" 항목 없음`);
    return result;
  }

  for (const item of items) {
    const when = item.isoDate ?? item.pubDate;
    if (!item.link || !when || Number.isNaN(Date.parse(when))) {
      result.errors.push(`피드 항목에 링크나 날짜가 없음: ${item.title ?? "(제목 없음)"}`);
      continue;
    }
    const date = toEtDate(new Date(when));
    if (await isSeen(ctx.sourceId, date)) continue;

    const html = await fetchText(item.link);
    const $ = cheerio.load(html);
    const pdfNeedle = config.pdfLinkIncludes.toLowerCase();
    const pdfHref = $("a[href]")
      .map((_, el) => $(el).attr("href") ?? "")
      .get()
      .find((href) => {
        const h = href.toLowerCase();
        return h.includes(pdfNeedle) && h.split("?")[0].endsWith(".pdf");
      });

    if (!pdfHref) {
      // PDF 를 못 찾으면 보도자료 페이지라도 남긴다. 링크 규칙이 바뀐 신호라 오류로도 남긴다
      result.errors.push(`${date} 보도자료에서 "${config.pdfLinkIncludes}" PDF 링크를 못 찾음 — HTML 로 저장`);
    }

    result.candidates.push({
      editionKey: date,
      title: config.titleTemplate.replace("{date}", date),
      publishedAt: date,
      sourceUrl: item.link,
      fileUrl: pdfHref ? new URL(pdfHref, item.link).toString() : undefined,
    });
  }

  if (result.candidates.length === 0 && result.errors.length === 0) {
    result.notes.push(`대상 없음 — 피드의 해당 항목 ${items.length}건은 모두 수집됨`);
  }
  return result;
}
