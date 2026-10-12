# 보고서 자동 수집기 — 2단계 시범 구현 설계서

> 작성: 2026-10-12 · 대상: TockTock (Next.js 15, Vercel, Upstash Redis)
> 이 문서를 Claude Code에 넘겨 구현한다. 착수 전에 저장소의 CLAUDE.md 규칙(8단계 워크플로, tsc+lint+build 피드백 루프)을 따른다.

---

## 0. 한 줄 목표

월가가 보는 보고서가 새로 나오면 TockTock이 하루 1번 스스로 알아채 **원문을 저장**하고, `/reports` 페이지에 쌓는다. **요약·해석은 하지 않는다**(API 사용료 없음). 해석은 사용자가 Claude 대화에서 한다.

시범 단계는 감지 방식 4가지를 출처 1개씩으로 검증한다. 통과하면 4단계에서 나머지 약 36개 출처를 같은 틀로 추가한다.

---

## 1. 시범 대상 4개

| # | 출처 | 감지 방식 | 확인된 사실 (2026-10-12 검증) |
|---|---|---|---|
| 1 | FOMC 성명 | **발표 일정** | 성명 주소 형식 `https://www.federalreserve.gov/newsevents/pressreleases/monetaryYYYYMMDDa.htm` (회의 둘째 날). PDF는 `https://www.federalreserve.gov/monetarypolicy/files/monetaryYYYYMMDDa1.pdf`. 9월 16일 성명으로 형식 확인함 |
| 2 | CPI | **FRED 발표일 API** | `https://api.stlouisfed.org/fred/release/dates?release_id=10&api_key=...&file_type=json&include_release_dates_with_no_data=true&sort_order=desc` — release_id 10 = Consumer Price Index. 미래 발표일을 받으려면 `include_release_dates_with_no_data=true` 필수. 원문 PDF는 `https://www.bls.gov/news.release/pdf/cpi.pdf` (발표 시각 오전 8:30 미 동부) |
| 3 | 연준 금융안정보고서 | **RSS** | 연준 전체 보도자료 피드 `https://www.federalreserve.gov/feeds/press_all.xml`. 제목에 "Financial Stability Report"가 들어간 항목을 잡는다. 최근호 2026-05-08, 다음호 11월 예상 |
| 4 | 하워드 막스 메모 | **페이지 비교** | 목록 `https://www.oaktreecapital.com/insights/memos`. 2021년 이후 메모는 `https://www.oaktreecapital.com/insights/memo/<slug>` 형태의 HTML 링크. RSS·이메일 구독 없음. 최근 메모에는 PDF가 없을 수 있어 HTML 페이지를 저장한다. 최신 메모 2026-09-22 "Shall We Repeal the Laws of Economics – Part III" |

FOMC 일정 (연준 공식 일정표 기준, 회의 둘째 날 = 성명 발표일):
- 2026: 01-28, 03-18*, 04-29, 06-17*, 07-29, 09-16*, 10-28, 12-09*
- 2027: 01-27, 03-17*, 04-28, 06-09*, 07-28, 09-15*, 10-27, 12-08*
- `*` = 경제전망(점도표) 포함. 일정은 직전 회의에서 확정되므로 매년 초 갱신한다.

---

## 2. 전체 흐름

```
[Vercel Cron, 매일 1회]
   └─ GET /api/cron/collect-reports  (CRON_SECRET 인증)
        ├─ 출처 목록(sources.ts)을 하나씩 실행
        │    └─ detector.detect()  → 새 호 후보 목록
        ├─ 이미 본 호인지 Redis로 확인 (중복 제거)
        ├─ 새 호면 원문 내려받기 → Vercel Blob 저장
        ├─ 보고서 정보 Redis 저장 (status = "new")
        └─ 실패는 Redis 오류 목록에 기록 (다른 출처는 계속 진행)

[/reports 페이지]
   └─ Redis에서 최신순으로 읽어 표시, 상태 변경, PDF 내려받기
```

**실행 시각:** `0 15 * * *` (UTC 15:00 = 한국 자정, 미 동부 오전 10~11시). 미국 통계(오전 8:30 발표)를 당일에 잡는다. Hobby 플랜은 실행 시각이 최대 59분 늦어질 수 있지만 문제없다.

> 참고: 기존 외국인 지분 수집은 GitHub Actions를 쓴다. 저장소 관례상 GitHub Actions가 더 맞다면 그쪽으로 바꿔도 된다. 수집 로직 자체는 같다.

---

## 3. 파일 구조 (제안)

```
lib/reports/
  types.ts            # 공통 타입
  sources.ts          # 출처 목록 (시범 4개)
  store.ts            # Redis 읽기/쓰기
  blob.ts             # Vercel Blob 저장
  fetcher.ts          # 공통 HTTP (User-Agent, 재시도, 시간 제한)
  detectors/
    schedule.ts       # 발표 일정 방식
    fredRelease.ts    # FRED 발표일 API 방식
    rss.ts            # RSS 방식
    pageDiff.ts       # 페이지 비교 방식
app/api/cron/collect-reports/route.ts   # 매일 실행
app/api/reports/[id]/status/route.ts    # 상태 변경 (Next.js 15: params는 Promise)
app/reports/page.tsx                    # 목록 화면
vercel.json                             # crons 항목 추가
```

새 의존성 후보: `@vercel/blob`, RSS/XML 파싱용 `fast-xml-parser`, HTML 파싱용 `cheerio`. 이미 있는 것이 있으면 그것을 쓴다.

---

## 4. 핵심 타입

```ts
// lib/reports/types.ts
export type DetectMethod = "schedule" | "fred" | "rss" | "pageDiff";
export type ReportStatus = "new" | "studying" | "done";

export interface SourceConfig {
  id: string;              // "fomc-statement", "bls-cpi", "fed-fsr", "oaktree-marks"
  name: string;            // 화면 표시용 한국어 이름
  institution: string;     // "연준", "BLS", "오크트리"
  grade: "A" | "B" | "C";
  method: DetectMethod;
  // 방식별 설정 (아래 5장)
  config: Record<string, unknown>;
}

export interface Candidate {
  editionKey: string;      // 출처 안에서 호를 구분하는 고유값 (예: "2026-09-16", 메모 slug)
  title: string;
  publishedAt: string;     // YYYY-MM-DD
  sourceUrl: string;       // 원문 페이지 주소
  fileUrl?: string;        // 내려받을 PDF/HTML 주소 (없으면 sourceUrl 저장)
}

export interface ReportRecord extends Candidate {
  id: string;              // `${sourceId}:${editionKey}`
  sourceId: string;
  name: string;
  institution: string;
  grade: string;
  blobUrl?: string;        // 저장된 원문
  fileSizeBytes?: number;
  status: ReportStatus;
  collectedAt: string;     // ISO
}
```

---

## 5. 감지 방식별 규칙

### 5-1. 발표 일정 (FOMC)
- 설정: 발표일 목록(1장의 날짜).
- 오늘(미 동부 기준) 이전의 발표일 중 아직 저장 안 된 날짜만 대상.
- 성명 페이지 주소를 만들어 요청 → 200이면 후보. 파일은 PDF 주소.
- 404면 아직 안 올라온 것. 오류로 치지 않고 다음 날 다시 확인. 단, 발표일 후 3일이 지나도 404면 오류 목록에 남긴다.

### 5-2. FRED 발표일 API (CPI)
- `FRED_API_KEY` 환경변수 사용 (TockTock이 이미 FRED를 쓰므로 있는 키를 재사용).
- 응답의 날짜 중 오늘 이하인 가장 최근 날짜 = 최신 발표일. 그날 호가 저장 안 됐으면 BLS PDF를 받는다.
- `editionKey` = 발표일. 제목 = "소비자물가지수(CPI) — {발표일} 발표".
- 다음 발표일(오늘보다 큰 첫 날짜)도 함께 Redis에 저장해서 화면에 "다음 발표 예정"으로 보여 준다.
- **BLS 접속 주의:** BLS 이용 약관은 "소유자 연락처가 없는 로봇은 차단할 수 있다"고 명시한다. 요청 헤더에 연락처를 넣은 User-Agent를 쓴다. 예: `TockTock-ReportCollector/1.0 (contact: <사용자 이메일>)`. 하루 1회, 출처당 요청 몇 건 수준을 지킨다.

### 5-3. RSS (연준 금융안정보고서)
- 피드를 읽고 제목에 `Financial Stability Report`가 들어간 항목만 고른다.
- 항목 링크(보도자료 페이지)를 열어 본문에서 `.pdf` 링크 중 `financial-stability-report`가 들어간 것을 찾는다.
- `editionKey` = 보도자료 날짜(YYYY-MM-DD).
- 설정은 `{ feedUrl, titleIncludes, pdfLinkIncludes }`로 일반화해 두면 4단계에서 BIS 등 다른 RSS 출처에 그대로 쓴다.

### 5-4. 페이지 비교 (하워드 막스 메모)
- 목록 페이지에서 `/insights/memo/` 로 시작하는 링크를 모두 뽑는다 → slug 목록.
- Redis의 "이미 본 slug" 집합과 비교해 새것만 후보로 한다.
- **첫 실행 문제:** 처음 돌리면 과거 메모 전부가 "새것"이 된다. 첫 실행은 `seed` 모드로 돌려 기존 slug는 "본 것"으로만 표시하고 저장하지 않는다. 단, 최신 1건은 시범 확인용으로 저장한다.
- 메모 페이지를 열어 PDF 링크(`/docs/default-source/memos/...pdf`)가 있으면 PDF를, 없으면 HTML 페이지 자체를 저장한다.
- 날짜는 목록 페이지에 표시된 날짜를 읽는다. 못 읽으면 수집한 날짜를 쓰고 `dateUncertain: true`를 기록한다.
- 사이트 구조가 바뀌어 링크를 0개 찾으면 **오류로 기록**한다 (조용히 실패하지 않게).

---

## 6. Redis 키 설계

| 키 | 형태 | 내용 |
|---|---|---|
| `reports:item:{id}` | hash/JSON | `ReportRecord` |
| `reports:index` | sorted set | score = publishedAt(타임스탬프), member = id. 최신순 목록용 |
| `reports:seen:{sourceId}` | set | 이미 처리한 editionKey |
| `reports:next:{sourceId}` | string | 다음 발표 예정일 (FRED·일정 방식) |
| `reports:errors` | list (최근 100건 유지) | `{ sourceId, at, message }` |
| `reports:lastRun` | string | 마지막 실행 시각과 결과 요약 |

기존 Redis 키와 겹치지 않게 `reports:` 접두어를 쓴다.

---

## 7. 원문 저장 (Vercel Blob)

- 경로: `reports/{sourceId}/{editionKey}.{pdf|html}`
- 접근: 사용자 혼자 보는 사이트이므로 private 저장소 권장. 내려받기는 서버 경로를 거쳐 제공.
- **용량 주의 (Vercel 공식 문서 기준):** Hobby 플랜 포함량은 저장 1GB/월, 업로드 등 고급 작업 월 2,000회, 데이터 전송 10GB. **넘으면 추가 요금 없이 30일간 Blob 사용이 막힌다.**
  - 대략 추정: 큰 연간 보고서(IMF WEO 등) 1건 수~수십 MB, 월간 통계 PDF 1건 1MB 안팎. 출처 40개 전체가 돌아가면 1GB는 수년 안에 찰 수 있다.
  - 그래서 저장할 때마다 파일 크기를 기록하고, `/reports`에 **총 사용량을 표시**하며, 800MB를 넘으면 경고를 띄운다.
  - 확인 완료(2026-10-13): TockTock은 **Hobby 플랜**이다. 이 제한이 그대로 적용된다.

---

## 8. `/reports` 화면

- 최신순 목록: 날짜 · 기관 · 보고서명 · 등급 · 상태 · [원문 받기] · [원문 사이트]
- 상태 배지: `새로 들어옴`(new) → `공부 중`(studying) → `학습 완료`(done). 클릭으로 변경.
- 상단 요약: 새로 들어온 건수, 다음 발표 예정 3건(FRED·일정 방식에서), 마지막 실행 시각, Blob 사용량.
- 오류가 있으면 상단에 경고 상자 (최근 오류 5건).
- 기존 TockTock 디자인과 컴포넌트를 따른다.

---

## 9. 안전장치

- 출처 하나가 실패해도 나머지는 계속 실행 (`Promise.allSettled` 또는 순차 + try/catch).
- 요청마다 시간 제한(예: 20초)과 1회 재시도.
- 같은 호를 두 번 저장하지 않음 (`reports:seen` 확인 후 저장, 저장 성공 후 seen에 추가).
- Cron 경로는 `Authorization: Bearer ${CRON_SECRET}` 확인 (Vercel Cron 기본 방식).
- 수동 실행용: `?source=<id>`로 출처 하나만, `?seed=1`로 첫 실행 시드 모드.

---

## 10. 완료 기준 (테스트)

**A. 과거 데이터로 즉시 확인 (구현 직후)**
1. FOMC: 2026-09-16 성명이 수집되고 PDF가 저장된다.
2. CPI: FRED에서 최신 발표일과 다음 발표일(10월 14일 예정)을 받아 온다. 최신호 PDF가 저장된다.
3. 금융안정보고서: 피드에 2026년 5월호 항목이 남아 있으면 수집된다. 없으면 "대상 없음"으로 정상 종료한다.
4. 막스 메모: seed 모드 실행 후 2026-09-22 메모 1건만 저장되고, 나머지 slug는 "본 것"으로만 기록된다.
5. 같은 실행을 한 번 더 돌리면 새로 저장되는 것이 0건이다 (중복 없음).

**B. 실제 발표로 확인 (운영 중)**
| 날짜 | 기대 결과 |
|---|---|
| 2026-10-14 | CPI(9월분) 자동 수집 |
| 2026-10-28 | FOMC 성명 자동 수집 |
| 2026-11월 | 연준 금융안정보고서 자동 수집 |
| 다음 막스 메모 발표 시 | 자동 수집 |

**C. 2주 점검 (7장 3단계)** — 놓친 것, 중복, 잘못 잡은 것, 오류 기록을 확인하고 규칙을 고친다.

---

## 11. 착수 전 확인할 것

- [x] Vercel 플랜: **Hobby 확정** (2026-10-13, Billing 화면 "Hobby Plan · Active", 결제수단 미등록) → 7장 용량 제한(저장 1GB, 초과 시 30일 차단)이 그대로 적용된다. 800MB 경고는 필수
- [ ] `FRED_API_KEY` 환경변수 이름 (기존 것 재사용)
- [ ] Blob 저장소 생성 및 `BLOB_READ_WRITE_TOKEN` 설정
- [ ] `CRON_SECRET` 설정
- [ ] BLS User-Agent에 넣을 연락처

## 참고 자료 (2026-10-12 확인)

- 연준 FOMC 일정: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
- 연준 RSS 목록: https://www.federalreserve.gov/feeds/feeds.htm
- FRED release/dates API: https://fred.stlouisfed.org/docs/api/fred/release_dates.html
- FRED CPI release (rid=10): https://fred.stlouisfed.org/release?rid=10
- BLS 이용 약관 (로봇 정책): https://www.bls.gov/bls/blsterms.htm
- 오크트리 메모 목록: https://www.oaktreecapital.com/insights/memos
- Vercel Cron 제한: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Blob 요금·제한: https://vercel.com/docs/vercel-blob/usage-and-pricing
