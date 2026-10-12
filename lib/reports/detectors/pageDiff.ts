import * as cheerio from "cheerio";
import { fetchText } from "../fetcher";
import { isSeen, markSeen, seenCount } from "../store";
import type { Candidate, DetectContext, DetectResult, PageDiffConfig } from "../types";

interface ListedItem {
  slug: string;
  title: string;
  date: string | null; // YYYY-MM-DD, 못 읽으면 null
  order: number; // 목록에 나온 순서 (날짜가 같거나 없을 때 최신 판단용)
}

/** 비교용 정규화 — slug "…economics---part-iii" 와 PDF "…economics-part-iii" 를 같게 본다 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * 페이지 비교 방식 (하워드 막스 메모) — 설계서 5-4
 *
 * 목록 페이지의 /insights/memo/ 링크(slug)를 Redis 의 "이미 본 slug"와 비교한다.
 *
 * ⚠ 첫 실행 문제: seen 이 비어 있으면 과거 메모 전부가 "새것"이 된다.
 *   seed 모드에서는 최신 1건만 저장하고 나머지는 "본 것"으로만 표시한다.
 *   seen 이 비어 있는데 seed 없이 돌면(예: cron 이 먼저 돈 경우) 자동으로 seed 처럼 처리한다.
 * ⚠ 사이트 구조가 바뀌면 slug 가 통째로 바뀌어 전부 새것이 될 수 있다.
 *   새것이 maxNewPerRun 보다 많으면 저장하지 않고 오류로 남긴다 (Blob 용량 보호).
 */
export async function detectPageDiff(
  config: PageDiffConfig,
  ctx: DetectContext
): Promise<DetectResult> {
  const result: DetectResult = { candidates: [], notes: [], errors: [] };

  const $ = cheerio.load(await fetchText(config.listUrl));
  const bySlug = new Map<string, ListedItem>();
  $(`a[href^="${config.linkPrefix}"]`).each((i, el) => {
    const href = $(el).attr("href") ?? "";
    const slug = href.slice(config.linkPrefix.length).split(/[?#/]/)[0];
    if (!slug || bySlug.has(slug)) return;
    // 날짜는 같은 칸의 <time datetime=">2026-09-22T07:00:00..."> 에 있다 (앞에 ">" 가 붙어 옴)
    const datetime = $(el).parent().find("time[datetime]").first().attr("datetime") ?? "";
    const date = datetime.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    bySlug.set(slug, { slug, title: $(el).text().trim() || slug, date, order: i });
  });

  const listed = [...bySlug.values()];
  if (listed.length === 0) {
    // 조용히 "새것 없음"으로 끝나면 안 된다 — 구조 변경 신호
    throw new Error(`목록 페이지에서 "${config.linkPrefix}" 링크를 0개 찾음 — 사이트 구조 변경 의심`);
  }

  const unseen: ListedItem[] = [];
  for (const item of listed) {
    if (!(await isSeen(ctx.sourceId, item.slug))) unseen.push(item);
  }
  // 최신순: 날짜 내림차순, 날짜가 없거나 같으면 목록 순서(위가 최신)
  unseen.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.order - b.order);
  result.notes.push(`목록 ${listed.length}건, 새 slug ${unseen.length}건`);

  if (unseen.length === 0) return result;

  let targets = unseen;
  const autoSeed = !ctx.seed && (await seenCount(ctx.sourceId)) === 0;
  if (ctx.seed || autoSeed) {
    const [newest, ...rest] = unseen;
    await markSeen(ctx.sourceId, rest.map((i) => i.slug));
    targets = [newest];
    result.notes.push(
      `${autoSeed ? "seen 이 비어 있어 자동 seed" : "seed 모드"} — ${rest.length}건은 본 것으로만 기록, 최신 1건(${newest.slug}) 저장 대상`
    );
  } else if (unseen.length > config.maxNewPerRun) {
    result.errors.push(
      `새 slug ${unseen.length}건 — 상한 ${config.maxNewPerRun}건 초과. 사이트 구조 변경 의심, 저장하지 않음`
    );
    return result;
  }

  for (const item of targets) {
    result.candidates.push(await toCandidate(item, config, ctx));
  }
  return result;
}

/** 메모 페이지를 열어 그 메모의 PDF 를 찾는다. 없으면 HTML 페이지 자체를 저장 */
async function toCandidate(
  item: ListedItem,
  config: PageDiffConfig,
  ctx: DetectContext
): Promise<Candidate> {
  const sourceUrl = `${config.baseUrl}${config.linkPrefix}${item.slug}`;
  const html = await fetchText(sourceUrl);

  // 메모 페이지에는 사이드바의 다른 메모 PDF 도 걸려 있고, 본문 PDF 는 onclick
  // 문자열 안에 있다. 그래서 a[href] 가 아니라 본문 전체에서 경로를 찾고 slug 와 맞는 것만 쓴다
  const escaped = config.pdfPathIncludes.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pdfPaths = html.match(new RegExp(`${escaped}[^"'\\s)]+?\\.pdf`, "gi")) ?? [];
  const want = normalize(item.slug);
  const pdfPath = pdfPaths.find((p) => normalize(p.split("/").pop()!.replace(/\.pdf$/i, "")) === want);

  return {
    editionKey: item.slug,
    title: item.title,
    publishedAt: item.date ?? ctx.today,
    sourceUrl,
    fileUrl: pdfPath ? new URL(pdfPath, config.baseUrl).toString() : sourceUrl,
    ...(item.date ? {} : { dateUncertain: true }),
  };
}
