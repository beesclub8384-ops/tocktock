import type { SourceConfig } from "./types";

/**
 * 시범 출처 4개 (REPORTS_COLLECTOR_SPEC.md 1장)
 * 4단계에서 나머지 출처는 같은 틀로 이 배열에 붙인다.
 */

/**
 * FOMC 성명 발표일 = 회의 둘째 날 (연준 공식 일정표 기준).
 * 일정은 직전 회의에서 확정되므로 매년 초 갱신한다. 목록이 끝나면
 * 다음 발표 예정이 비어 화면에 "예정 없음"으로 보인다 — 그게 갱신 신호다.
 */
const FOMC_DATES = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09",
  "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
];

export const REPORT_SOURCES: SourceConfig[] = [
  {
    id: "fomc-statement",
    name: "FOMC 성명",
    institution: "연준",
    grade: "A",
    method: "schedule",
    config: {
      dates: FOMC_DATES,
      startFrom: "2026-09-16",
      pageUrlTemplate:
        "https://www.federalreserve.gov/newsevents/pressreleases/monetary{YYYYMMDD}a.htm",
      fileUrlTemplate:
        "https://www.federalreserve.gov/monetarypolicy/files/monetary{YYYYMMDD}a1.pdf",
      titleTemplate: "FOMC 성명 — {date}",
    },
  },
  {
    id: "bls-cpi",
    name: "소비자물가지수(CPI)",
    institution: "BLS",
    grade: "A",
    method: "fred",
    config: {
      releaseId: 10, // FRED release_id 10 = Consumer Price Index
      sourceUrl: "https://www.bls.gov/news.release/cpi.nr0.htm",
      fileUrl: "https://www.bls.gov/news.release/pdf/cpi.pdf",
      titleTemplate: "소비자물가지수(CPI) — {date} 발표",
    },
  },
  {
    id: "fed-fsr",
    name: "금융안정보고서",
    institution: "연준",
    grade: "A",
    method: "rss",
    config: {
      feedUrl: "https://www.federalreserve.gov/feeds/press_all.xml",
      titleIncludes: "Financial Stability Report",
      pdfLinkIncludes: "financial-stability-report",
      titleTemplate: "금융안정보고서 — {date}",
    },
  },
  {
    id: "oaktree-marks",
    name: "하워드 막스 메모",
    institution: "오크트리",
    grade: "B",
    method: "pageDiff",
    config: {
      listUrl: "https://www.oaktreecapital.com/insights/memos",
      baseUrl: "https://www.oaktreecapital.com",
      linkPrefix: "/insights/memo/",
      pdfPathIncludes: "/docs/default-source/memos/",
      maxNewPerRun: 3,
    },
  },
];

export function findSource(id: string): SourceConfig | undefined {
  return REPORT_SOURCES.find((s) => s.id === id);
}
