# 작업 지시서: 외국인 지분율 추적 페이지

## 할 일 순서
1. KRX API 연동 라우트 생성
2. 자동 수집 스크립트 생성
3. GitHub Actions 스케줄 추가
4. 페이지 UI 생성
5. 네비게이션에 메뉴 추가
6. 커밋 후 푸시

---

## 1. API 라우트: app/api/foreign-ownership/route.ts

KRX(한국거래소) 에서 외국인 지분율 데이터를 가져오는 라우트.

KRX 데이터 수집 방법:
- URL: https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd
- Method: POST
- 종목별 외국인 보유 현황: bld=dbms/MDC/STAT/standard/MDCSTAT03501

요청 파라미터 예시:
```
bld=dbms/MDC/STAT/standard/MDCSTAT03501
isuCd=KR7005930003  (삼성전자 종목코드)
strtDd=20250101
endDd=20260223
```

응답에서 필요한 필드:
- TRD_DD: 날짜
- FORN_HLD_QTY: 외국인 보유 수량
- FORN_SHR_RT: 외국인 지분율 (%)

---

## 2. 고정 종목 목록

### 코스피 상위 20개 (시가총액 순)
```typescript
const KOSPI_TOP20 = [
  { name: '삼성전자', code: 'KR7005930003', ticker: '005930' },
  { name: 'SK하이닉스', code: 'KR7000660001', ticker: '000660' },
  { name: 'LG에너지솔루션', code: 'KR7373220003', ticker: '373220' },
  { name: '삼성바이오로직스', code: 'KR7207940008', ticker: '207940' },
  { name: '현대차', code: 'KR7005380001', ticker: '005380' },
  { name: '기아', code: 'KR7000270009', ticker: '000270' },
  { name: '셀트리온', code: 'KR7068270008', ticker: '068270' },
  { name: 'POSCO홀딩스', code: 'KR7005490008', ticker: '005490' },
  { name: 'KB금융', code: 'KR7105560007', ticker: '105560' },
  { name: '신한지주', code: 'KR7055550008', ticker: '055550' },
  { name: '삼성SDI', code: 'KR7006400006', ticker: '006400' },
  { name: 'LG화학', code: 'KR7051910008', ticker: '051910' },
  { name: '하나금융지주', code: 'KR7086790003', ticker: '086790' },
  { name: '현대모비스', code: 'KR7012330007', ticker: '012330' },
  { name: '카카오', code: 'KR7035720002', ticker: '035720' },
  { name: 'NAVER', code: 'KR7035420009', ticker: '035420' },
  { name: '우리금융지주', code: 'KR7316140003', ticker: '316140' },
  { name: 'LG전자', code: 'KR7066570003', ticker: '066570' },
  { name: 'SK이노베이션', code: 'KR7096770003', ticker: '096770' },
  { name: 'KT&G', code: 'KR7033780008', ticker: '033780' },
];
```

### 코스닥 상위 20개 (시가총액 순)
```typescript
const KOSDAQ_TOP20 = [
  { name: 'HLB', code: 'KR7028300003', ticker: '028300' },
  { name: '에코프로비엠', code: 'KR7247540009', ticker: '247540' },
  { name: '에코프로', code: 'KR7086520004', ticker: '086520' },
  { name: '알테오젠', code: 'KR7196170003', ticker: '196170' },
  { name: '리가켐바이오', code: 'KR7141080008', ticker: '141080' },
  { name: '셀트리온제약', code: 'KR7068760008', ticker: '068760' },
  { name: '클래시스', code: 'KR7214150002', ticker: '214150' },
  { name: '레인보우로보틱스', code: 'KR7277810004', ticker: '277810' },
  { name: '삼천당제약', code: 'KR7000250001', ticker: '000250' },
  { name: '엔켐', code: 'KR7348370009', ticker: '348370' },
  { name: '파마리서치', code: 'KR7214450006', ticker: '214450' },
  { name: '휴젤', code: 'KR7145020007', ticker: '145020' },
  { name: '카카오게임즈', code: 'KR7293490009', ticker: '293490' },
  { name: '솔브레인', code: 'KR7357780009', ticker: '357780' },
  { name: 'HPSP', code: 'KR7403870001', ticker: '403870' },
  { name: '펩트론', code: 'KR7087010004', ticker: '087010' },
  { name: '보로노이', code: 'KR7310210007', ticker: '310210' },
  { name: '오스템임플란트', code: 'KR7048260005', ticker: '048260' },
  { name: '덴티움', code: 'KR7145720002', ticker: '145720' },
  { name: '실리콘투', code: 'KR7257720008', ticker: '257720' },
];
```

---

## 3. 데이터 저장 방식

Upstash Redis (이미 프로젝트에 있음) 에 저장:
- 키 형식: `foreign:${ticker}:${period}` (period: 1m, 3m, 6m)
- 값: JSON 배열 (날짜별 지분율)
- TTL: 24시간

---

## 4. 자동 수집: scripts/collect-foreign-ownership.ts

매일 오후 4시 30분(장 마감 후) 실행.
코스피 20개 + 코스닥 20개 = 40개 종목의 최신 지분율 수집.
Upstash Redis에 저장.

---

## 5. GitHub Actions: .github/workflows/foreign-ownership.yml

```yaml
name: 외국인 지분율 수집
on:
  schedule:
    - cron: '30 7 * * 1-5'  # 한국시간 오후 4시 30분 (UTC 07:30), 평일만
  workflow_dispatch:
jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npx tsx scripts/collect-foreign-ownership.ts
        env:
          UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
          UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
```

---

## 6. 페이지 UI: app/foreign-ownership/page.tsx

### 레이아웃
```
[외국인 지분율 추적]
[검색창: 종목명 또는 티커 입력]

[코스피 탭] [코스닥 탭]

[종목 카드 그리드]
  각 카드:
  - 종목명 + 티커
  - 현재 지분율 (큰 숫자, %)
  - 1개월 변화 (▲▼ 색상)
  - 3개월 변화
  - 6개월 변화
  - 미니 스파크라인 차트

[카드 클릭 시 모달]
  - 종목명
  - 기간 토글: 1개월 / 3개월 / 6개월
  - 꺾은선 차트 (날짜 X축, 지분율 Y축)
  - 최고/최저/현재 지분율 표시
```

### 디자인 규칙
- TockTock 기존 테마와 통일 (bg-background)
- 지분율 증가: 초록색
- 지분율 감소: 빨간색
- 차트: recharts 라이브러리 사용 (이미 설치되어 있을 경우) 또는 순수 SVG

### 검색 기능
- 종목명 한글 검색 가능
- 티커 숫자 검색 가능
- 검색 결과가 고정 40개에 없으면: "KRX에서 직접 조회" 버튼 표시

---

## 7. 네비게이션 추가

components/navbar.tsx 에서 기존 메뉴에 "외국인 지분율" 추가.
링크: /foreign-ownership

---

## 주의사항

- KRX API는 공식 문서가 없어서 비공식 엔드포인트임. 실패 시 fallback으로 샘플 데이터 표시.
- 요청 간격: 종목당 0.5초 딜레이 (서버 부하 방지)
- KRX 응답이 없거나 오류 시 마지막 저장된 데이터 사용
- 데이터 없을 시 "데이터 수집 중입니다" 안내 표시
