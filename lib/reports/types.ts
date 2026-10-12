/**
 * 보고서 자동 수집기 — 공통 타입 (REPORTS_COLLECTOR_SPEC.md 4장)
 *
 * 요약·해석은 하지 않는다. 원문을 받아 Blob 에 넣고 목록만 Redis 에 쌓는다.
 */

export type DetectMethod = "schedule" | "fred" | "rss" | "pageDiff";
export type ReportStatus = "new" | "studying" | "done";

export const REPORT_STATUSES: readonly ReportStatus[] = ["new", "studying", "done"];

/** 발표 일정 방식 (FOMC) — {YYYYMMDD} 자리에 발표일이 들어간다 */
export interface ScheduleConfig {
  dates: string[]; // YYYY-MM-DD (미 동부 기준 발표일)
  startFrom: string; // 이 날짜 이전 발표일은 보지 않는다 (시범 시작 시점에 과거분이 몰려 저장되지 않게)
  pageUrlTemplate: string;
  fileUrlTemplate: string;
  titleTemplate: string; // {date}
}

/** FRED 발표일 API 방식 (CPI) */
export interface FredConfig {
  releaseId: number;
  sourceUrl: string;
  fileUrl: string; // 항상 "최신본" 하나만 있는 고정 주소
  titleTemplate: string; // {date}
}

/** RSS 방식 (연준 금융안정보고서) — 4단계에서 BIS 등 다른 피드에 그대로 쓴다 */
export interface RssConfig {
  feedUrl: string;
  titleIncludes: string;
  pdfLinkIncludes: string;
  titleTemplate: string; // {date}
}

/** 페이지 비교 방식 (하워드 막스 메모) */
export interface PageDiffConfig {
  listUrl: string;
  baseUrl: string;
  linkPrefix: string; // 예: "/insights/memo/"
  pdfPathIncludes: string; // 예: "/docs/default-source/memos/"
  maxNewPerRun: number; // 사이트 구조가 바뀌어 전부 "새것"이 되는 사고를 막는 상한
}

interface SourceBase {
  id: string; // "fomc-statement", "bls-cpi", "fed-fsr", "oaktree-marks"
  name: string; // 화면 표시용 한국어 이름
  institution: string; // "연준", "BLS", "오크트리"
  grade: "A" | "B" | "C";
}

export type SourceConfig =
  | (SourceBase & { method: "schedule"; config: ScheduleConfig })
  | (SourceBase & { method: "fred"; config: FredConfig })
  | (SourceBase & { method: "rss"; config: RssConfig })
  | (SourceBase & { method: "pageDiff"; config: PageDiffConfig });

export interface Candidate {
  editionKey: string; // 출처 안에서 호를 구분하는 고유값 (예: "2026-09-16", 메모 slug)
  title: string;
  publishedAt: string; // YYYY-MM-DD
  sourceUrl: string; // 원문 페이지 주소
  fileUrl?: string; // 내려받을 PDF/HTML 주소 (없으면 sourceUrl 저장)
  dateUncertain?: boolean; // 날짜를 못 읽어 수집일로 대신한 경우
  /**
   * 고정 주소(예: BLS cpi.pdf)는 발표가 미뤄지면 지난 호 파일이 그대로 남아 있다.
   * 내려받은 파일의 Last-Modified 가 이 날짜보다 확실히 이전이면 저장하지 않는다.
   */
  notBefore?: string; // YYYY-MM-DD
}

export interface ReportRecord extends Candidate {
  id: string; // `${sourceId}:${editionKey}`
  sourceId: string;
  name: string;
  institution: string;
  grade: string;
  blobUrl?: string; // 저장된 원문 (private)
  fileSizeBytes?: number; // 바이트
  fileType?: "pdf" | "html";
  status: ReportStatus;
  collectedAt: string; // ISO
}

/** 감지기가 쓰는 실행 정보 */
export interface DetectContext {
  sourceId: string;
  today: string; // 미 동부 기준 YYYY-MM-DD
  seed: boolean; // ?seed=1 — pageDiff 첫 실행용
}

/**
 * 감지 결과. 출처 전체가 막히는 문제는 throw 하고, 일부만 이상한 경우
 * (예: FOMC 발표 3일 뒤에도 404)는 errors 에 담는다. 둘 다 오류 목록에 남는다.
 */
export interface DetectResult {
  candidates: Candidate[];
  notes: string[];
  errors: string[];
}

export interface ReportError {
  sourceId: string;
  at: string; // ISO
  message: string;
}

export interface SourceRunSummary {
  sourceId: string;
  found: number; // 감지기가 내놓은 새 호 후보 수
  saved: string[]; // 저장한 editionKey
  notes: string[];
  errors: string[];
}

export interface LastRun {
  at: string; // ISO
  seed: boolean;
  savedCount: number;
  errorCount: number;
  sources: SourceRunSummary[];
}
