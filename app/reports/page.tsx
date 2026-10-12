import type { Metadata } from "next";
import { REPORT_SOURCES } from "@/lib/reports/sources";
import {
  getBlobBytes,
  getLastRun,
  getNextRelease,
  listErrors,
  listRecords,
} from "@/lib/reports/store";
import { StatusButton } from "./status-button";

export const metadata: Metadata = {
  title: "보고서 자동 수집 | TockTock",
  description: "월가가 보는 보고서가 새로 나오면 원문을 모아 두는 곳입니다.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Blob 저장 포함량 1GB (Hobby). 넘으면 30일간 Blob 이 막힌다 */
const BLOB_LIMIT_BYTES = 1024 * 1024 * 1024;
/** 이 이상이면 경고 상자를 띄운다 (설계서 7장) */
const BLOB_WARN_BYTES = 800 * 1024 * 1024;

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * 보고서 자동 수집 — 비밀번호 쿠키 인증(proxy.ts) 뒤에 있다. 메뉴는 "경제공부" 옆.
 * 요약·해석은 하지 않는다. 원문을 받아 두고 상태만 표시한다.
 */
export default async function ReportsPage() {
  const [records, lastRun, errors, blobBytes, nextDates] = await Promise.all([
    listRecords(),
    getLastRun(),
    listErrors(5),
    getBlobBytes(),
    Promise.all(
      REPORT_SOURCES.map(async (s) => ({ source: s, date: await getNextRelease(s.id) }))
    ),
  ]);

  const newCount = records.filter((r) => r.status === "new").length;
  const upcoming = nextDates
    .filter((n): n is { source: (typeof REPORT_SOURCES)[number]; date: string } => n.date !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const blobWarn = blobBytes >= BLOB_WARN_BYTES;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">보고서 자동 수집</h1>
        <p className="text-sm text-zinc-500 mt-2">
          월가가 보는 보고서가 새로 나오면 하루 한 번 알아채서 원문을 모아 둡니다. 요약은 하지 않습니다.
          출처: 연준, BLS, FRED, 오크트리캐피털.
        </p>
      </header>

      {blobWarn && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <strong>Blob 사용량 {formatMb(blobBytes)}</strong> — 무료 포함량 1GB 에 가깝습니다. 넘으면 30일간 Blob 이
          막힙니다. 오래된 원문을 정리하세요.
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong className="block mb-2">최근 오류 {errors.length}건</strong>
          <ul className="space-y-1">
            {errors.map((e, i) => (
              <li key={`${e.at}-${i}`} className="break-words">
                <span className="text-xs opacity-70">{formatKst(e.at)} · {e.sourceId}</span>
                <br />
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="새로 들어옴" value={`${newCount}건`} />
        <SummaryCard
          label="마지막 실행"
          value={lastRun ? formatKst(lastRun.at) : "아직 없음"}
          sub={lastRun ? `저장 ${lastRun.savedCount}건 · 오류 ${lastRun.errorCount}건` : undefined}
        />
        <SummaryCard
          label="Blob 사용량"
          value={formatMb(blobBytes)}
          sub={`1GB 중 ${((blobBytes / BLOB_LIMIT_BYTES) * 100).toFixed(1)}% · 이 수집기 분만`}
        />
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
          <div className="text-xs text-zinc-500">다음 발표 예정</div>
          {upcoming.length === 0 ? (
            <div className="mt-1 text-sm text-zinc-500">없음</div>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm text-zinc-900 dark:text-zinc-100">
              {upcoming.map((u) => (
                <li key={u.source.id}>
                  <span className="font-semibold">{u.date.slice(5)}</span> {u.source.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {records.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center text-sm text-zinc-500">
          아직 모은 보고서가 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">날짜</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">기관</th>
                <th className="px-3 py-2 font-medium">보고서</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">등급</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">상태</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">원문</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                    {r.publishedAt}
                    {r.dateUncertain && (
                      <span className="ml-1 text-xs text-amber-600" title="목록에서 날짜를 못 읽어 수집일로 대신함">
                        (추정)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-700 dark:text-zinc-300">{r.institution}</td>
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-zinc-500">{r.name}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.grade}</td>
                  <td className="px-3 py-2">
                    <StatusButton id={r.id} status={r.status} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {r.blobUrl && (
                      <a
                        href={`/api/reports/${encodeURIComponent(r.id)}/file`}
                        target="_blank"
                        rel="noopener"
                        className="text-sky-700 dark:text-sky-400 hover:underline"
                      >
                        원문 받기{r.fileSizeBytes ? ` (${formatMb(r.fileSizeBytes)})` : ""}
                      </a>
                    )}
                    <br />
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-500 hover:underline"
                    >
                      원문 사이트
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
