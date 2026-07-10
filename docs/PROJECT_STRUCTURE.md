# TockTock 프로젝트 구조 지도

> 앱(모바일 어플) 출시 사전 점검용 전체 구조 문서.
> 작성일: 2026-07-10 · 브랜치: `master`
> 원칙: 실제 파일을 열어 확인한 사실만 기록. 확인 불가 항목은 명시.

---

## 1. 기술 스택과 버전

`package.json` 선언 + `package-lock.json` 실제 설치(resolved) 버전 기준.

| 항목 | 선언(package.json) | 실제 설치(lock) |
|---|---|---|
| Next.js | `16.1.6` | 16.1.6 |
| React / React-DOM | `19.2.3` | 19.2.3 |
| TypeScript | `^5` | 5.9.3 |
| @upstash/redis | `^1.37.0` | 1.37.0 |
| @anthropic-ai/sdk | `^0.77.0` | 0.77.0 |
| yahoo-finance2 | `^3.13.0` | 3.13.0 |
| recharts | `^3.8.0` | 3.8.0 |
| lightweight-charts | `^4.2.3` | 4.2.3 |
| tailwindcss | `^4` | 4.1.18 |
| eslint / eslint-config-next | `^9` / `16.1.6` | — |

기타 주요 의존성: `cheerio`(HTML 파싱), `radix-ui`·`lucide-react`·`class-variance-authority`·`clsx`·`tailwind-merge`(UI), `gray-matter`·`remark`·`remark-gfm`·`remark-html`(마크다운), `rss-parser`(뉴스), `uuid`, `xlsx`·`pdfkit`(dev, 리포트 생성).

- 런타임: Next.js 15+ App Router 규약(비동기 `params` 등). 빌드: Turbopack.
- 배포: Vercel (Hobby, `maxDuration` 최대 300초). DB: Upstash Redis.
- npm 스크립트: `dev`/`build`/`start`, `lint`(eslint app·components·lib·hooks), `collect-data`(`scripts/collect-krx-daily.mjs`).

---

## 2. 폴더 구조 (2~3단계)

```
app/                     # Next.js App Router (페이지 + API)
  api/                   # 일반 API 라우트
    cron/                # Vercel Cron 전용 라우트 (18개)
    stock/[symbol]/      # 종목별 quote·chart·trendlines·growth-score
    futures-trading/     # 선물매매 하위 API (records·qa·reply·messages 등)
    ...                  # 그 외 도메인별 route.ts
  (각 페이지 폴더)         # sectors, credit, daytrading, ken-fisher, liquidity 등
lib/                     # 서버 로직 · 데이터 페칭 · 스토어
  data/                  # 정적 데이터 로딩 헬퍼
  types/                 # 공용 타입 정의
components/              # 클라이언트 컴포넌트
  stock/                 # 종목 상세 관련 컴포넌트
  ui/                    # shadcn 기반 UI 프리미티브
hooks/                   # useDraggable, useResizable
data/                    # 정적/캐시 데이터 파일 (일부 gitignore)
  krx-history/           # KRX 과거 데이터 (대용량, 배포 제외)
  sectors/               # 섹터 매핑 JSON + 빌드 스크립트
scripts/                 # 백테스트·수집 스크립트 (untracked, .mjs 다수)
docs/                    # 문서 (본 파일)
```

`lib/` 주요 파일: `redis.ts`(공유 클라이언트), `daytrading.ts`·`daytrading-store.ts`, `ai-trading-store.ts`, `virtual-trading-store.ts`, `futures-trading-store.ts`, `sector-board.ts`·`us-sector-board.ts`, `fetch-fred.ts`·`fetch-credit-balance.ts`·`fetch-market-index.ts`, `kis-client.ts`, `naver-investor-scraper.ts`, `investor-flow-engine.ts`·`investor-flow-archive.ts`, `stock-universe.ts`, `stock-score.ts`, `dcf-engine.ts`, `korea-market-engine.ts`, `superinvestor-store.ts`·`superinvestor-score.ts`, `weekly-calendar.ts`·`weekly-calendar-cron.ts`, `news-collector.ts`·`news-rss.ts`, `trendline.ts`, `accumulation-scan.ts`, `posts.ts`, `article-writer.ts`, `money-flow-guides.ts`, `utils.ts`.

---

## 3. 페이지 라우트 (27개)

| 경로 | 화면 설명 |
|---|---|
| `/` | 별도 화면 없이 `/sectors`로 리다이렉트 |
| `/ai-trading` | 가상 1,000만원으로 세력진입 패턴 기반 AI 자동매매 시뮬레이션(목표 +5%/손절 -3%, 누적 수익률) |
| `/calendar` | 한국·미국 실적/경제지표 일정을 시장·종류별 필터로 보는 주간 캘린더 |
| `/credit` | 신용융자잔고·빚투 과열지수·신용 vs 지수 비교 차트(빚투 지표) |
| `/daytrading` | 삼성전자·하이닉스 실전 단타 매매 기록 입력 + 종합 성적표 |
| `/diagrams/new` | 텍스트 붙여넣기 → AI가 허브형/타임라인형 구조 감지해 다이어그램 생성·게시 |
| `/economics` | 챕터별 경제공부 글 목록 |
| `/economics/[slug]` | 개별 경제공부 글 본문 상세 |
| `/foreign-ownership` | 코스피·코스닥 상위 종목 외국인 보유 비율 변화 추적 |
| `/futures-trading` | "영웅들의 선물" — 선물 매매 기록 입력 + 태양·용태 Q&A 스레드/분석 |
| `/global-indicators` | 금리·환율·심리·신용리스크·원자재·밸류에이션 등 글로벌 매크로 지표 타일 대시보드 |
| `/inflation` | 미국 Headline/Core CPI, Core PCE 전년비 추이 |
| `/investor-flow` | 종목코드·시작일 입력 시 외국인·기관·개인 일별/누적 매매동향 추적 |
| `/ken-fisher` | S&P 500 × Nasdaq 100 지수와 PER 비교 차트 |
| `/ken-fisher/dcf-calculator` | 미래 FCF 할인 내재가치 추정 DCF 계산기(참고용) |
| `/ken-fisher/earnings-yield-vs-bond` | 주식 이익수익률 vs 10년물 국채금리 비교 |
| `/ken-fisher/korea-market` | 한국 종목/시장 매력도 분석·스크리닝(매력/중립/비매력, 참고용) |
| `/liquidity/global` | 글로벌 유동성 — 현재 "준비 중" 안내만 |
| `/liquidity/us` | 미국 유동성 지표를 매크로/시장 점수 + 레짐(회복·확장·둔화·수축)으로 종합 |
| `/liquidity/us/backtest` | 미국 유동성 점수 대비 QQQ 1~6개월 후 수익률 버킷 집계 백테스트 |
| `/news` | 글로벌 속보·연합뉴스 통합 뉴스 |
| `/sectors` | Redis 섹터 보드 기반 한국 대분류/소분류 섹터 현황 타일(메인) |
| `/sectors-us` | Redis 기반 미국 산업그룹별 섹터 현황 타일 |
| `/stock/[symbol]` | 심볼별 개별 종목 차트 상세 |
| `/stock-patterns` | TSLA 일봉 '조건→다음날 상승' 빈도 집계, 과적합 위험 표시 |
| `/superinvestor` | 슈퍼투자자 포트폴리오(합의 매수·할인 보유·내부자 등) |
| `/virtual-trading` | 트레일링/절대 손절 기반 가상 자동매매 시뮬레이터 |

---

## 4. 일반 API 라우트 (37개, 크론 제외)

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/accumulation-scan` | GET | 저장된 매집(축적) 스캔 결과 조회 |
| `/api/ai-trading` | GET·DELETE | AI 자동매매 상태·포지션 조회 / 상태 초기화 |
| `/api/credit-balance` | GET | 신용융자잔고 + 지수 차트 조회 |
| `/api/credit-overheat` | GET | 신용융자 기반 과열지수 계산·조회 |
| `/api/credit-vs-index` | GET | 신용융자잔고 vs 지수 비교 |
| `/api/daytrading` | GET·POST·DELETE | 단타 매매기록 조회·추가·삭제 |
| `/api/dcf/[symbol]` | GET | 종목 DCF 밸류에이션 분석 |
| `/api/diagrams/save` | POST | 다이어그램 Redis 저장 + id 반환 |
| `/api/foreign-ownership` | GET | 종목별 외국인 지분율 조회 |
| `/api/foreign-ownership/diagnose` | GET | 외국인 지분율(KRX) 수집 상태 진단 |
| `/api/futures-trading` | GET·POST·PATCH·DELETE | 선물매매 기록 CRUD (비밀번호 인증) |
| `/api/futures-trading/dynamic-symbols` | GET | 선물매매 동적 심볼 목록 |
| `/api/futures-trading/messages` | GET·POST·DELETE | 선물매매 메시지 CRUD |
| `/api/futures-trading/pattern` | GET | 선물매매 매매 패턴 데이터 |
| `/api/futures-trading/qa` | GET·POST·PATCH·DELETE | 선물매매 Q&A CRUD |
| `/api/futures-trading/quantified` | GET | 선물매매 정량화 조건 데이터 |
| `/api/futures-trading/reply` | POST·PATCH | 기록 스레드 답글 추가/수정 |
| `/api/futures-trading/records/[id]/qa` | POST | 특정 기록에 Q&A 스레드 추가 |
| `/api/futures-trading/records/[id]/qa/[qaId]` | POST·DELETE | Q&A 스레드 답글 추가/삭제 |
| `/api/global-indicators` | GET | FRED·야후 기반 글로벌 실시간 경제지표 |
| `/api/inflation/data` | GET | FRED 인플레이션 데이터(Redis 캐시) |
| `/api/investor-flow` | GET | 투자자별 매매동향(수급) 조회 |
| `/api/korea-market` | GET | 한국 시장 매력도 분석·상위 종목 스크리닝 |
| `/api/liquidity/us` | GET | 미국 유동성 지표(FRED·야후, Redis 캐시) |
| `/api/liquidity/us/backtest` | GET | 미국 유동성 기반 백테스트 결과 |
| `/api/news` | GET | RSS 기반 통합 뉴스 목록 |
| `/api/oil-prices` | GET | 유가 데이터(Redis 캐시) |
| `/api/stock/[symbol]/chart` | GET | 종목 OHLC 차트 |
| `/api/stock/[symbol]/growth-score` | GET | 종목 성장 점수 계산 |
| `/api/stock/[symbol]/quote` | GET | 종목 실시간 시세 |
| `/api/stock/[symbol]/trendlines` | GET | 종목 추세선/채널 분석 |
| `/api/stock/search` | GET | 종목 검색(심볼/이름) |
| `/api/superinvestor` | GET | 슈퍼투자자 보유종목 조회·수집 |
| `/api/treasury-market-reaction` | GET | 국채(금리) 발표 대비 시장 반응 |
| `/api/usd-krw` | GET | 원/달러 환율(60초 캐시) |
| `/api/virtual-trading` | GET·DELETE | 가상매매 상태·포지션 조회 / 초기화 |
| `/api/weekly-calendar` | GET | 주간 경제 캘린더(Redis 캐시) |

> 선물매매 계열 API는 모두 비밀번호 인증을 거친다.

---

## 5. Cron 라우트 (18개, `vercel.json` 등록)

- 18개 파일 **모두 `export async function GET`** 로 export됨(다른 메서드 없음) — Vercel Cron 규약 준수.
- KST = UTC + 9h. `1-5` = 월~금, `0-4` = 일~목(UTC).

| 경로 | UTC 스케줄 | KST 변환 | GET | 주요 Redis 키 | 역할 |
|---|---|---|---|---|---|
| `/api/cron/refresh-credit` | `0 1 * * 1-5` | 평일 10:00 | ✅ | 없음(`revalidatePath`로 credit API 캐시 무효화) | 신용융자 API 캐시 재검증 |
| `/api/cron/virtual-trading-scan` | `0 7 * * 1-5` | 평일 16:00 | ✅ | `lock:cron:virtual-trading-scan`, `virtual-trading:state`, `virtual-trading:cron-status` | 가상매매 종목 스캔(폭발주 탐색·단계 갱신) |
| `/api/cron/virtual-trading-trade` | `5 0 * * 1-5` | 평일 09:05 | ✅ | `lock:cron:virtual-trading-trade`, `virtual-trading:state`, `virtual-trading:cron-status`, `futures-trading:kis-token` | 가상매매 매수/매도(트레일링·절대 손절, D3 시가 매수) |
| `/api/cron/ai-trading-scan` | `10 7 * * 1-5` | 평일 16:10 | ✅ | `lock:cron:ai-trading-scan`, `ai-trading:state`, `ai-trading:cron-status` | AI매매 종목 스캔 |
| `/api/cron/ai-trading-trade` | `5 0 * * 1-5` | 평일 09:05 | ✅ | `lock:cron:ai-trading-trade`, `ai-trading:state`, `ai-trading:cron-status`, `futures-trading:kis-token` | AI매매 매수/매도(+5% 목표/-3% 손절, D3 시가 매수) |
| `/api/cron/superinvestor-scan` | `0 1 * * 1` | 월 10:00 | ✅ | `lock:cron:superinvestor-scan`, `superinvestor:v2` | 슈퍼투자자 데이터 주간 수집 |
| `/api/cron/collect-market-data` | `30 7 * * 1-5` | 평일 16:30 | ✅ | `futures-trading:market-data:{date}`, `futures-trading:market-data-index`, `futures-trading:records`, `futures-trading:quantified`, `futures-trading:pattern` | 선물매매용 Yahoo+KIS 시장데이터 수집 + pending 기록 Claude 분석 |
| `/api/cron/redis-usage-check` | `0 1 * * 1` | 월 10:00 | ✅ | `redis.keys("*")` 전체 스캔, `system:redis-usage-log` | Redis 메모리 사용량 점검·로그(80% 경고) |
| `/api/cron/investor-flow-collect` | `30 21 * * *` | 매일 06:30(익일) | ✅ | `lock:cron:investor-flow-collect`, `investor-flow:collect-status`, `investor-flow:archive:{symbol}`, `investor-flow:universe` | 추적 500종목 투자자 매매동향 매일 수집·누적 |
| `/api/cron/investor-flow-universe` | `0 18 * * 6` | 일 03:00 | ✅ | `lock:cron:investor-flow-universe`, `investor-flow:universe-status`, `investor-flow:universe` | 추적 universe 주간 재선정(시총·거래대금·변동성) |
| `/api/cron/accumulation-scan` | `0 22 * * 0-4` | 평일 07:00(익일) | ✅ | `accumulation-scan:v1` | 매집(누적 매수) 신호 종목 매일 스캔·저장 |
| `/api/cron/inflation-refresh` | `30 14 * * *` | 매일 23:30 | ✅ | `inflation:fred:v1`(del 후 재수집) | 인플레이션(FRED) 캐시 무효화·재수집 |
| `/api/cron/weekly-calendar` | `0 22 * * 0-4` | 평일 07:00(익일) | ✅ | `weekly-calendar:data` | 주간 경제 캘린더 아침 갱신 |
| `/api/cron/weekly-calendar-dawn` | `0 21 * * 0-4` | 평일 06:00(익일) | ✅ | `weekly-calendar:data` | 주간 캘린더 새벽 갱신(미국장 마감 반영) |
| `/api/cron/weekly-calendar-evening` | `0 14 * * 1-5` | 평일 23:00 | ✅ | `weekly-calendar:data` | 주간 캘린더 밤 갱신(미국장 시작 전) |
| `/api/cron/sector-board` | `0 11 * * 1-5` | 평일 20:00 | ✅ | `sector-board:data` | 국내 섹터 보드 저녁 갱신 |
| `/api/cron/sector-board-lunch` | `0 1 * * 1-5` | 평일 10:00 | ✅ | `sector-board:data`(동일 키 덮어씀) | 국내 섹터 보드 장중 갱신 |
| `/api/cron/us-sector-board` | `0 22 * * 1-5` | 화~토 07:00(익일) | ✅ | `us-sector-board:data` | 미국 섹터 보드 갱신(미국장 마감 후) |

> KST 변환은 UTC 크론값 기준 산술 계산(+9h)이다. 일부 코드 주석/설명의 KST 표기와 다를 수 있으며, 실제 실행 시각은 위 표(vercel.json 기준)를 따른다.

---

## 6. Redis 키 목록

공유 클라이언트: `lib/redis.ts`(`export const redis`, `@upstash/redis`). @upstash/redis는 자동 직렬화이므로 코드에서 `JSON.stringify/parse` 미사용.

| 키 | 용도 |
|---|---|
| `sector-board:data` | 국내 섹터 보드 데이터(섹터 화면 소스) |
| `us-sector-board:data` | 미국 섹터 보드 데이터 |
| `weekly-calendar:data` | 주간 경제 캘린더 |
| `ai-trading:state` | AI 자동매매 상태·포지션 |
| `ai-trading:cron-status` | AI매매 크론 실행 상태 |
| `virtual-trading:state` | 가상매매 상태·포지션 |
| `virtual-trading:cron-status` | 가상매매 크론 실행 상태 |
| `oil-prices:v5` | 유가 캐시 |
| `usd-krw:v1` | 원/달러 환율 캐시 |
| `liquidity:us:v5` | 미국 유동성 지표 |
| `liquidity:us:backtest:v5` | 미국 유동성 백테스트 결과 |
| `inflation:fred:v1` | 인플레이션(FRED) 캐시 |
| `accumulation-scan:v1` | 매집 스캔 결과 |
| `superinvestor:v2` | 슈퍼투자자 데이터 |
| `investor-flow:universe` | 추적 종목 universe |
| `investor-flow:universe-status` | universe 재선정 상태 |
| `investor-flow:collect-status` | 투자자 동향 수집 상태 |
| `investor-flow:archive:{symbol}` | 종목별 투자자 동향 누적 아카이브 |
| `futures-trading:records` | 선물매매 기록 |
| `futures-trading:messages` | 선물매매 메시지 |
| `futures-trading:pattern` | 선물매매 매매 패턴 |
| `futures-trading:qa` | 선물매매 Q&A |
| `futures-trading:quantified` | 선물매매 정량화 조건 |
| `futures-trading:dynamic-symbols` | 선물매매 동적 심볼 |
| `futures-trading:market-data-index` | 선물 시장데이터 인덱스 |
| `futures-trading:market-data:{date}` | 일자별 선물 시장데이터 |
| `futures-trading:kis-token` | KIS OAuth 토큰(매매 크론 공유) |
| `futures-trading:kis-futures-code` | KIS 선물 종목 코드 |
| `system:redis-usage-log` | Redis 사용량 점검 로그 |
| `lock:cron:*` | 크론 동시 실행 방지 락(ai-trading-scan/trade, virtual-trading-scan/trade, investor-flow-collect/universe, superinvestor-scan) |
| `diagram:{id}` | 저장된 다이어그램 |
| `foreign:{ticker}` | 외국인 지분율 종목별 캐시 |

---

## 7. data 폴더 파일 (용량 / gitignore)

| 파일 | 용량 | gitignore |
|---|---|---|
| `data/fed-news.json` | 4.9 KB | 커밋됨 |
| `data/freesis-credit-balance.csv` | 202 KB | 커밋됨 |
| `data/freesis-market-cap.csv` | 138 KB | 커밋됨 |
| `data/stock-names.json` | 354 KB | 커밋됨 |
| `data/tsla_data.csv` | 274 KB | 커밋됨 |
| `data/tsla-patterns.json` | 129 KB | 커밋됨 |
| `data/us-gics-mapping.json` | 9.2 KB | 커밋됨 |
| `data/us-stock-names-ko.json` | 16 KB | 커밋됨 |
| `data/live-trades-export.json` | 5.0 KB | **gitignore(개인 거래 export)** |
| `data/krx-history/krx-daily-all.json` | 대용량 | **gitignore(재생성: `npm run collect-data`)** |
| `data/krx-history/.collect-checkpoint.json` | — | **gitignore** |
| `data/krx-history/*`(그 외 분석 JSON·xlsx·html·png) | 다양 | 대부분 untracked(로컬 전용) |
| `data/sectors/sectors.json`, `stock-corpcode-map.json`, `build-*.mjs` | — | 커밋됨(섹터 매핑·빌드 스크립트) |

`.gitignore` 요점: `node_modules`, `.next/`, `.env*`(전체 env 제외), `.vercel`, `.kis-token-cache.json`, `temp-master/`, `data/krx-history/krx-daily-all.json`, `data/live-trades-export.json`, `data/slippage-results.json`, `CURRENT_TASK.md`, `monitor-result.md`, `.claude/settings.local.json`.

> `data/krx-history/`는 프로젝트 지침상 수정·삭제 금지(로컬 전용 대용량). `scripts/*.mjs`는 untracked이며 `git clean` 금지.

---

## 8. 환경변수 (코드에서 `process.env` 참조)

| 변수 | 용도 |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Redis 연결 URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 인증 토큰 |
| `ANTHROPIC_API_KEY` | 서버 사이드 Claude 호출 |
| `NEXT_PUBLIC_ANTHROPIC_API_KEY` | 클라이언트 사이드 Claude 호출 |
| `FRED_API_KEY` | FRED(미국 연준 경제데이터) API |
| `KIS_APP_KEY` | 한국투자증권 KIS OpenAPI 앱 키 |
| `KIS_APP_SECRET` | 한국투자증권 KIS OpenAPI 시크릿 |
| `DATA_GO_KR_API_KEY` | 공공데이터포털 API 키 |
| `CRON_SECRET` | 크론 요청 인증 시크릿 |
| `AI_TAKE_PROFIT_PCT` | AI매매 익절 % (기본값 오버라이드) |
| `AI_STOP_LOSS_PCT` | AI매매 손절 % |
| `VIRTUAL_HARD_STOP_PCT` | 가상매매 절대 손절 % |
| `VIRTUAL_TRAILING_PCT` | 가상매매 트레일링 스탑 % |

> `.env*`는 전부 gitignore. `NEXT_PUBLIC_` 접두사만 클라이언트 노출.

---

## 9. 외부 데이터 소스 (코드에서 실제 호출)

| 외부 소스 | 호출 위치 | 가져오는 데이터 |
|---|---|---|
| Yahoo Finance (`yahoo-finance2`) | `lib/dcf-engine.ts`·`stock-score.ts`·`futures-market-data.ts`·`us-sector-board.ts`·`weekly-calendar.ts`·`korea-market-engine.ts`·`superinvestor-store.ts`, `app/api/stock/*`·`usd-krw`·`oil-prices`·`global-indicators`·`liquidity/us(+backtest)`·`credit-*`·`treasury-market-reaction` | 주가/차트 OHLC, 시세·PER/EPS, 지수·환율·유가·선물, 실적 캘린더 |
| FRED (`api.stlouisfed.org`) | `lib/fetch-fred.ts`·`news-collector.ts`·`korea-market-engine.ts`·`weekly-calendar.ts`, `app/api/liquidity/us(+backtest)`·`inflation/data`·`treasury-market-reaction` | 기준금리(DFF)·국채금리(DGS10/DGS2)·유동성·물가 시계열, 한국 10년물, 지표 발표일 |
| 네이버 금융 모바일 (`m.stock.naver.com`) | `lib/stock-universe.ts`·`sector-board.ts`, `app/api/cron/{ai,virtual}-trading-{scan,trade}` | 시총 순위 종목 리스트, 종목 현재가 |
| 네이버 금융 시세 API (`api.finance.naver.com/siseJson`) | `lib/stock-universe.ts`, `app/api/foreign-ownership`, `app/api/cron/{ai,virtual}-trading-scan` | 한국 종목 일봉 OHLC(외국인 지분 포함) |
| 네이버 금융 웹 (`finance.naver.com/item/frgn`) | `lib/naver-investor-scraper.ts` | 종목별 외국인·기관 순매매(HTML 스크래핑) |
| 한국투자증권 KIS (`openapi.koreainvestment.com:9443`) | `lib/kis-client.ts`(사용: `futures-market-data.ts`·`investor-flow-engine.ts`·`investor-flow-archive.ts`·`korea-market-engine.ts`) | OAuth 토큰, 현재가·PER/EPS/PBR, 투자자별 매매동향, KOSPI200 선물 1분봉·마스터 |
| 공공데이터포털 (`apis.data.go.kr`) | `lib/fetch-market-index.ts`·`fetch-credit-balance.ts` | KOSPI/KOSDAQ 상장시가총액, 신용융자잔고 |
| KRX (`data.krx.co.kr`) | `app/api/foreign-ownership/diagnose` | 외국인 보유 진단용 JSON/CSV(OTP 발급 후 다운로드) |
| Google News RSS (`news.google.com/rss`) | `lib/news-rss.ts` | AP·Reuters·Bloomberg 등 미국 증시/정치 헤드라인 |
| BBC RSS (`feeds.bbci.co.uk`) | `lib/news-rss.ts` | BBC Business·World 헤드라인 |
| Dataroma (`www.dataroma.com`) | `lib/superinvestor-store.ts` | 슈퍼투자자 활동/보유종목/매니저(HTML 스크래핑) |
| Wikipedia (`en.wikipedia.org`) | `lib/us-sector-board.ts` | S&P 500 구성종목 목록 |

**제외/확인 결과**
- 한국은행 ECOS(`ecos.bok.or.kr`): 코드에서 실제 fetch 없음. `app/global-indicators/page.tsx`에 **출처 하이퍼링크로만** 존재 → 데이터 호출 아님.
- TradingView·Bloomberg·investing.com·CNBC 등: 임베드 위젯 링크 또는 기사 출처 하이퍼링크(화면 표시용)이며 프로그래밍적 데이터 호출 아님 → 제외.
- 위 소스 일부는 `scripts/`(예: `collect-foreign-ownership.ts`, `download/validate-tsla.ts`)에서도 호출되나 lib·app/api와 동일 소스라 별도 항목화하지 않음.

---

## 부록 — 앱 출시 시 점검 포인트

- **인증/시크릿**: `CRON_SECRET`, `KIS_APP_KEY/SECRET`, `FRED_API_KEY`, `DATA_GO_KR_API_KEY`, 선물매매 API 비밀번호 인증 — 앱 클라이언트에서 직접 호출 시 노출/프록시 전략 필요.
- **데이터 원천 의존성**: 네이버·KRX·Dataroma는 HTML 스크래핑/비공식 API라 구조 변경에 취약. KIS·공공데이터포털은 공식 API 키 기반.
- **Cron 실행 시각**: 전부 UTC 기준 등록, KST 환산은 §5 표 참조. Vercel Cron은 GET만 허용(전 라우트 GET 준수 확인됨).
- **캐시 키 버전 접미사**(`:v5`, `:v1`, `:v2`): 스키마 변경 시 접미사 증가로 무효화하는 패턴.
