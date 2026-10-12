import { MAX_FILE_BYTES, saveOriginal, type FileType } from "./blob";
import { detectFredRelease } from "./detectors/fredRelease";
import { detectPageDiff } from "./detectors/pageDiff";
import { detectRss } from "./detectors/rss";
import { detectSchedule } from "./detectors/schedule";
import { daysBetween, fetchWithRetry, safeUrl, toEtDate, todayEt } from "./fetcher";
import { REPORT_SOURCES } from "./sources";
import { pushError, saveRecord, setLastRun } from "./store";
import type {
  Candidate,
  DetectContext,
  DetectResult,
  LastRun,
  ReportRecord,
  SourceConfig,
  SourceRunSummary,
} from "./types";

/** 고정 주소 파일이 발표 후 이만큼 지나도 갱신 안 되면 오류로 남긴다 */
const STALE_GRACE_DAYS = 3;
/**
 * Last-Modified 비교 여유. BLS cpi.pdf 는 공식 발표(08:30 ET)보다 일찍
 * 올라간다 (실측: 2026-09-11 발표분 Last-Modified 07:07 ET). 하루 전에 올라가도
 * 정상으로 보려고 이틀을 둔다. 지난 호는 한 달 전이라 이 정도로는 안 헷갈린다.
 */
const LAST_MODIFIED_SLACK_DAYS = 2;

function detect(source: SourceConfig, ctx: DetectContext): Promise<DetectResult> {
  switch (source.method) {
    case "schedule":
      return detectSchedule(source.config, ctx);
    case "fred":
      return detectFredRelease(source.config, ctx);
    case "rss":
      return detectRss(source.config, ctx);
    case "pageDiff":
      return detectPageDiff(source.config, ctx);
  }
}

type DownloadOutcome =
  | { kind: "saved"; record: ReportRecord }
  | { kind: "notYet"; message: string } // 아직 새 파일이 아님 — 다음 실행에서 재시도
  | { kind: "failed"; message: string };

async function downloadAndSave(
  source: SourceConfig,
  candidate: Candidate,
  today: string
): Promise<DownloadOutcome> {
  const fileUrl = candidate.fileUrl ?? candidate.sourceUrl;
  const res = await fetchWithRetry(fileUrl);
  if (!res.ok) return { kind: "failed", message: `${safeUrl(fileUrl)} → HTTP ${res.status}` };

  if (candidate.notBefore) {
    const lastModified = res.headers.get("last-modified");
    if (!lastModified) {
      // 확인할 수 없으면 막지 않는다. 대신 기록을 남겨 눈으로 확인하게 한다
      await pushError({
        sourceId: source.id,
        at: new Date().toISOString(),
        message: `${candidate.editionKey}: Last-Modified 헤더 없음 — 최신본 여부 미확인 상태로 저장`,
      });
    } else {
      const modifiedDate = toEtDate(new Date(lastModified));
      if (daysBetween(modifiedDate, candidate.notBefore) > LAST_MODIFIED_SLACK_DAYS) {
        const late = daysBetween(candidate.notBefore, today);
        const message = `${candidate.editionKey} 발표분인데 파일 수정일이 ${modifiedDate} — 아직 지난 호`;
        return late > STALE_GRACE_DAYS
          ? { kind: "failed", message: `${message} (발표 ${late}일 경과, 발표 지연 의심)` }
          : { kind: "notYet", message: `${message}, 다음 실행에서 재확인` };
      }
    }
  }

  const contentType = res.headers.get("content-type") ?? "";
  const fileType: FileType = contentType.includes("pdf") ? "pdf" : "html";
  if (candidate.fileUrl?.toLowerCase().split("?")[0].endsWith(".pdf") && fileType !== "pdf") {
    // PDF 주소인데 HTML 이 오면 오류 페이지일 가능성이 크다 — 저장하지 않는다
    return { kind: "failed", message: `${safeUrl(fileUrl)} PDF 를 기대했는데 ${contentType || "알 수 없는 형식"}` };
  }

  const body = await res.arrayBuffer();
  if (body.byteLength === 0) return { kind: "failed", message: `${safeUrl(fileUrl)} 빈 파일` };
  if (body.byteLength > MAX_FILE_BYTES) {
    return {
      kind: "failed",
      message: `${safeUrl(fileUrl)} ${(body.byteLength / 1024 / 1024).toFixed(1)}MB — 상한 ${MAX_FILE_BYTES / 1024 / 1024}MB 초과, 저장 안 함`,
    };
  }

  const blob = await saveOriginal(source.id, candidate.editionKey, body, fileType);
  const record: ReportRecord = {
    ...candidate,
    id: `${source.id}:${candidate.editionKey}`,
    sourceId: source.id,
    name: source.name,
    institution: source.institution,
    grade: source.grade,
    blobUrl: blob.url,
    fileSizeBytes: blob.size,
    fileType,
    status: "new",
    collectedAt: new Date().toISOString(),
  };
  // seen 은 Blob 저장이 끝난 뒤 이 안에서 추가된다.
  // 여기서 실패하면 Blob 에만 파일이 남고 다음 실행에서 같은 경로로 다시 올라간다
  // (allowOverwrite). 추적할 수 있게 그 사실을 오류 메시지에 남긴다
  try {
    await saveRecord(record);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Blob 에는 저장됨(${blob.size}바이트), Redis 기록 실패 — 다음 실행에서 재업로드: ${detail}`);
  }
  return { kind: "saved", record };
}

async function runSource(source: SourceConfig, seed: boolean, today: string): Promise<SourceRunSummary> {
  const summary: SourceRunSummary = { sourceId: source.id, found: 0, saved: [], notes: [], errors: [] };

  try {
    const detected = await detect(source, { sourceId: source.id, today, seed });
    summary.found = detected.candidates.length;
    summary.notes.push(...detected.notes);
    summary.errors.push(...detected.errors);

    // 한 호가 실패해도 같은 출처의 다른 호는 계속 시도한다
    for (const candidate of detected.candidates) {
      try {
        const outcome = await downloadAndSave(source, candidate, today);
        if (outcome.kind === "saved") summary.saved.push(candidate.editionKey);
        else if (outcome.kind === "notYet") summary.notes.push(outcome.message);
        else summary.errors.push(`${candidate.editionKey}: ${outcome.message}`);
      } catch (error) {
        summary.errors.push(`${candidate.editionKey}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
  }

  const at = new Date().toISOString();
  for (const message of summary.errors) {
    await pushError({ sourceId: source.id, at, message });
  }
  return summary;
}

/**
 * 출처를 하나씩 순서대로 돌린다 (설계서 2장, 9장).
 * 병렬로 안 하는 이유: 출처 몇 개 수준이라 시간 여유가 있고, 같은 사이트
 * (연준 2개)에 동시에 요청이 몰리지 않게 하려고.
 */
export async function collectReports(options: { sourceId?: string; seed?: boolean } = {}): Promise<LastRun> {
  const seed = options.seed ?? false;
  const today = todayEt();
  const sources = options.sourceId
    ? REPORT_SOURCES.filter((s) => s.id === options.sourceId)
    : REPORT_SOURCES;
  if (sources.length === 0) throw new Error(`알 수 없는 출처: ${options.sourceId}`);

  const summaries: SourceRunSummary[] = [];
  for (const source of sources) {
    summaries.push(await runSource(source, seed, today));
  }

  const run: LastRun = {
    at: new Date().toISOString(),
    seed,
    savedCount: summaries.reduce((n, s) => n + s.saved.length, 0),
    errorCount: summaries.reduce((n, s) => n + s.errors.length, 0),
    sources: summaries,
  };
  await setLastRun(run);
  return run;
}
