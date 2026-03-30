# TockTock 프로젝트 지침

## 프로젝트 기본 정보
- **프레임워크**: Next.js 15 (Turbopack)
- **배포**: Vercel (Hobby 플랜, maxDuration 최대 300초)
- **DB**: Upstash Redis (`@upstash/redis`)
- **언어**: TypeScript
- **브랜치**: `master` (main 아님)
- **배포 방법**: git push → Vercel 자동 배포. 안 될 경우 Deploy Hook 사용

## 사이트 슬로건
- TockTock의 공식 슬로건: "내가 매매하는데 보려고 만든 사이트"
- 소개 문구, 메타 설명, 푸터, 페이지 설명 등 사이트를 소개할 때
  이 슬로건의 톤과 방향성을 유지할 것
- 톤: 꾸미지 않고 솔직하게, 개인 투자자 시각, 있어 보이려 하지 않음

---

## ⚠️ 코딩 전 반드시 확인할 체크리스트

코드를 작성하기 전에 아래를 순서대로 확인한다.

1. **파일 먼저 읽기**: 수정할 파일을 grep/read로 먼저 파악한 후 코드 작성
2. **Next.js 버전 확인**: params, fetch 등 버전별 문법 차이 있음
3. **환경변수 이름 확인**: NEXT_PUBLIC_ 접두사 필요 여부
4. **HTTP 메서드 확인**: Vercel Cron은 반드시 GET으로 처리
5. **단위 확인**: 금액 데이터는 반드시 원/억원/백만원 단위 명시
6. **데이터 출처 확인**: 동적 데이터는 Redis에 있음. 코드에서 찾지 말 것

---

## ⚠️ 반드시 지켜야 할 개발 규칙

### 1. Vercel Cron 핸들러는 반드시 GET
Vercel Cron은 등록된 경로에 GET 요청을 보낸다. POST로 작성하면 405 에러로 무음 실패한다.
```ts
// ❌ 잘못된 방법 - Cron이 한 번도 실행되지 않음
export async function POST() { ... }

// ✅ 올바른 방법
export async function GET() { ... }
```

### 2. 동적 라우트 params는 반드시 Promise로 처리
Next.js 15부터 `params`가 비동기(Promise)로 변경됨. 안 하면 404 오류.
```ts
// ❌ 잘못된 방법 (Next.js 14 이하 방식)
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
}

// ✅ 올바른 방법 (Next.js 15)
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

### 3. Upstash Redis 사용 시 JSON.stringify 금지
`@upstash/redis`는 자동으로 JSON 직렬화/역직렬화를 처리함. 직접 하면 이중 파싱 오류 발생.
```ts
// ❌ 잘못된 방법
await redis.set(key, JSON.stringify(data));
const raw = await redis.get<string>(key);
JSON.parse(raw);

// ✅ 올바른 방법
await redis.set(key, data);
const raw = await redis.get<MyType>(key);
```

### 4. 금액 단위 변환 주의
API마다 단위가 다름. 반드시 주석으로 단위 명시.

- KRX API: 백만원 단위
- 화면 표시: 억원 단위
- 조건 비교 상수: 원 단위 (예: 30,000,000,000 = 300억원)

### 5. vercel.json cron 표현식
day-of-month와 day-of-week 범위를 동시에 쓰면 Vercel이 거부함. 반드시 검증 후 작성.

---

## 🔍 데이터 진단 순서 (문제 발생 시)

데이터가 이상하거나 없을 때 아래 순서로 확인한다. 순서를 바꾸면 시간 낭비.

1. **업스트림 원본 데이터 확인**: 외부 API(FreeSIS, 공공데이터포털 등) 원본이 정상인가?
2. **Redis 확인**: `ai-trading:state` 등 해당 키에 값이 있는가?
3. **캐시 확인**: TTL이 만료됐는가? 무효화 조건이 올바른가?
4. **코드 확인**: 마지막에 코드를 본다

동적 콘텐츠(차트 데이터, 매매 기록 등)는 Redis에 저장됨. 코드에서 찾지 말 것.

---

## 🚨 무음 실패(Silent Failure) 주의

에러 없이 잘못된 결과를 내는 버그가 가장 위험하다. 아래 패턴에서 자주 발생:

- Cron이 405로 실패하는데 에러 로그가 안 보임 → **HTTP 메서드 확인**
- 단위 변환 오류로 조건 비교가 항상 false → **단위 주석 필수**
- Redis 이중 파싱으로 undefined 반환 → **JSON.stringify 금지**
- 캐시가 만료되지 않아 옛날 데이터 표시 → **캐시 무효화 조건 확인**

새 기능 추가 시 반드시 "이 기능이 조용히 실패할 수 있는 경우"를 먼저 생각할 것.

---

## 🔄 교차검증이 필요한 작업

아래 작업은 반드시 검증 단계를 거친다.

### 데이터 관련
- 외부 API 데이터를 가공할 때: 원본값과 가공값을 console.log로 함께 출력해 비교
- 거래대금/시가총액 계산: 단위 변환 후 실제 종목 데이터와 손으로 교차검증
- 날짜/시간 처리: KST/UTC 변환 여부 명시, 장 마감 시간(15:30) 기준 처리

### 전략 관련
- 새 매매 조건 추가 시: 과거 데이터로 백테스트 후 적용
- 백테스트 결과: 반드시 전반부/후반부 분리 검증(과적합 방지)
- 수익률 계산: 슬리피지 + 수수료 비용 반영 여부 확인

### 배포 전
- Vercel 배포 후 실제 사이트에서 기능 동작 확인
- Cron 등록 시: vercel.json 경로와 실제 파일 경로 일치 여부 확인

---

## 🛠️ 환경변수 목록

| 변수명 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | 서버 사이드 AI 호출 |
| `NEXT_PUBLIC_ANTHROPIC_API_KEY` | 클라이언트 사이드 AI 호출 |
| `UPSTASH_REDIS_REST_URL` | Redis 연결 URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 인증 토큰 |

---

## 🗂️ 주요 파일 구조

- `data/krx-history/` — 243MB, 배포에서 제외 (gitignore)
- `scripts/*.mjs` — 백테스트 스크립트, untracked 파일. `git clean -fd` 금지
- `lib/ai-trading-store.ts` — Redis 저장/로드
- `lib/types/ai-trading.ts` — 타입 + 매수조건 상수

---

## 📋 구현된 페이지 및 기능

페이지(27개): /, /news, /blog, /blog/[slug], /fed-rate, /fed-rate/[slug], /stock-analysis, /stock-analysis/[slug], /column, /column/[slug], /economics, /economics/[slug], /indices, /indices/fear-greed, /market-events, /global-indicators, /foreign-ownership, /stock/[symbol], /money-flow, /money-flow/[id], /money-flow/treasury-auction, /liquidity/us, /liquidity/us/backtest, /liquidity/global, /virtual-trading, /ai-trading, /diagrams/new

API(31개): /api/stock/[symbol]/quote|chart|trendlines|growth-score|search, /api/usd-krw, /api/oil-prices, /api/credit-balance|overheat|vs-index, /api/money-flow-data|analysis, /api/treasury-auction|bill-history, /api/global-indicators, /api/foreign-ownership, /api/liquidity/us|backtest, /api/market-events, /api/ai-trading, /api/virtual-trading, /api/diagrams/save

Cron(8개): refresh-credit(평일 01:00 UTC), virtual-trading-scan(평일 07:00), virtual-trading-trade(평일 00:05), ai-trading-scan(평일 07:00), ai-trading-trade(평일 00:05), update-fomc-dot-plot(분기), market-events 한국장(평일 07:30), 미국장(평일 22:30)

사이드바 위젯: 성장성점수, VIX, USD/KRW, 달러인덱스, 미국10년물, 국제유가

---

## 🔁 Git 복구 패턴

잘못된 커밋을 되돌릴 때:
```bash
git reset HEAD~1       # 마지막 커밋 취소 (파일은 유지)
git checkout -- .      # 변경사항 전부 되돌리기
# ⚠️ git push는 하지 말 것
```

untracked 파일(scripts/*.mjs 등)은 위 명령으로 삭제되지 않음. 별도 확인 필요.

---

## ✍️ 글쓰기 스타일 가이드

TockTock에 글(칼럼, 분석, 가이드 등)을 작성할 때 반드시 아래 스타일을 따릅니다.

### 1. 말투
- 존댓말 사용 (~합니다, ~입니다)
- 단, 딱딱하지 않게. "~인 것으로 판단됩니다" (X) → "~라고 볼 수 있습니다" (O)
- 독자에게 말을 거는 느낌: "이렇게 생각해보겠습니다", "한번 살펴보겠습니다"

### 2. 톤
- 친근하고 쉽게, 하지만 가볍지 않게
- 어려운 개념은 반드시 비유나 예시로 설명
- 전문 용어를 쓸 때는 바로 뒤에 쉬운 설명을 붙임
  - 예: "신용융자(증권사에서 돈을 빌려 주식을 사는 것)"
- 독자를 초보자로 가정하되, 무시하는 느낌은 절대 주지 않음

### 3. 문장 스타일
- 한 문장은 짧게 (40자 이내 권장)
- 한 문단은 3~5줄 이내
- 핵심 문장은 **볼드** 처리
- 나열할 때는 불릿(-)이나 번호(1, 2, 3) 사용

### 4. 구조
- 항상 "핵심 요약"을 글 상단에 배치
- 본문은 "왜? → 뭐가? → 그래서?" 순서
- 마무리에는 한 줄 정리 또는 TockTock만의 시사점

### 5. 금지 사항
- "~하겠사옵니다" 같은 과도한 존대 금지
- "ㅋㅋ", "ㅎㅎ", 이모티콘 금지 (이모지는 최소한으로만)
- "필자는", "본 칼럼에서는" 같은 논문체 금지
- 근거 없는 예측 금지 ("반드시 오릅니다" X)

### 6. TockTock 브랜드 표현
- 글의 주체는 항상 "TockTock" 또는 "저희"
- 독자 지표를 언급할 때: "TockTock 빚투 과열지수", "TockTock 성장성 종합점수"
- 데이터 출처는 항상 명시

### 7. 예시 - 같은 내용, 다른 스타일

**나쁜 예 (논문체, 딱딱함):**
"신용융자잔고의 증가는 반대매매 리스크의 확대를 시사하며, 이는 코스닥 시장에서 특히 두드러지는 현상으로 분석된다."

**좋은 예 (TockTock 스타일):**
"빚내서 투자하는 사람이 많아지고 있습니다. 특히 코스닥에서 이런 흐름이 뚜렷한데요. 이게 왜 위험하냐면, 주가가 조금만 떨어져도 증권사가 강제로 주식을 팔아버리는 '반대매매'가 연쇄적으로 터질 수 있기 때문입니다."

### 8. 구조 통일 규칙
- 섹션 제목은 ## 1. ## 2. ## 3. 번호 형식으로 통일
- 어려운 개념이 나오면 반드시 > 인용구로 대화형 예시 추가
  예: > 철수가 채권을 샀다면? → 이렇게 됩니다.
- 비교/정리는 반드시 표(|)로 작성
- 마지막 섹션은 항상 "핵심 한 문장"으로 마무리
  형식: > "요약 문장"

### 9. 카테고리별 톤 차이
- 거시전망/연준과 금리: 분석적, 결론 먼저, 투자 시사점 포함
- 종목분석: 깊은 분석, 시나리오 제시, 표 적극 활용
- 톡톡 칼럼: 비유 중심, 교양 톤, 핵심 요약 상단 배치
- 경제공부: 교육 목적, 가장 쉬운 비유, 초보자 기준으로 작성

### 10. 투자 관련 글 면책 문구
거시전망/종목분석/연준과 금리 카테고리 글 마지막에 반드시 추가:
> 이 글은 투자 권유가 아닙니다. 모든 투자 판단은 본인의 책임입니다.

### 11. 경제공부 카테고리 연재 규칙
- "시장을 읽는 눈" 시리즈로 EP 번호를 붙여 연재
- 파일명 형식: market-reading-ep{번호}.md
- frontmatter category: "경제공부"
- 경제공부 카테고리에는 면책 문구 불필요
- 글 작성 시 CLAUDE.md의 글쓰기 스타일 가이드 1~10번 규칙 전부 준수
- 특히 경제공부는 9번 규칙(카테고리별 톤)에 따라 "교육 목적, 가장 쉬운 비유, 초보자 기준"으로 작성
- 8번 규칙(구조 통일)에 따라 번호 섹션, 인용구 예시, 표 정리, 핵심 한 문장 마무리 필수
