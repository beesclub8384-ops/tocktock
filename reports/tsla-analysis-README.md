# TSLA 일봉 차트 패턴 분석 도구 모음 (2026-06-20)

## 목적
TSLA 일봉 데이터에서 "특정 조건 → 다음날 상승" 확률이 높은 패턴을 탐색.

## 데이터
- data/tsla_data.csv : TSLA 일봉 OHLCV + SMA(5/10/20/60), 2010-06-29(IPO) ~ 2026-06-18, 4018행
  (Yahoo Finance, 12개 샘플 OHLCV 대조 검증 완료)

## 스크립트 (실행: node scripts/<파일명>)
- download-tsla.ts        : 데이터 수집 + SMA 계산
- validate-tsla.ts        : Yahoo와 OHLCV 대조 검증
- analyze-tsla-patterns.ts: 단일 SMA 위치 패턴 in-sample 확률
- validate-tsla-oos.ts    : 전/후반 분리(OOS) + 비용 + p-value
- scan-tsla-full.ts       : 약 40개 단일 조건 전체기간 확률 스캔
- filter-tsla-candidates.ts: 후보 OOS + 본페로니 → 생존자 (reports/tsla-candidates-oos.md)
- scan-tsla-combos.ts     : 2·3개 조합 563개 OOS + 본페로니
- scan-tsla-mega.ts       : 재료 확장(RSI/이격도/다일수익/변동성 등) 단일+조합 in-sample 스캔 → reports/tsla-candidates-full.csv (4962행)
- shortlist-tsla.ts       : 발생 150회 이상만 추림 → reports/tsla-shortlist.csv (818행, 검증용)

## 결과 요약
- in-sample 최고 승률: 단일 56.9% → 563조합 77.1% → 4962조합 80.0%
  (검색량이 늘수록 최고치 상승 = 신호가 아니라 과적합이 깊어지는 현상)
- OOS(전/후반 분리) + 본페로니 보정 통과: 31후보 0개 / 563조합 0개
- 단순 일봉 룰로는 "다음날 방향"에 검증된 엣지 미확인

## 사용 주의 (중요)
- candidates-full.csv, shortlist.csv는 "전체기간 in-sample 확률"임. 검증된 전략이 아니라 조사·검증 대기 후보 목록.
- 발생 횟수 적은(30~50회) 고확률(70~80%)은 소표본 노이즈 가능성 높음 → 발생 횟수를 반드시 함께 볼 것.
- forward(실거래/페이퍼) 검증은 별도 수행.
