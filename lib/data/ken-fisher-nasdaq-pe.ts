// Nasdaq 100 (^NDX) 연말 기준 trailing P/E 추정치
// - 무료 월별 장기 시계열 소스가 없어 연간 데이터로 제공
// - 출처: 공개된 Nasdaq.com 아카이브, 재무 뉴스(WSJ/Bloomberg 인용), iShares QQQ 팩트시트 요약
// - 각 값은 해당 연도 말(12월 말) 시점 추정치이며, 제공사별로 ±2 포인트 차이 가능
//
// 주의: 2000~2002 닷컴버블 당시 PER은 데이터 제공사에 따라 편차가 매우 크다.
// 이 값은 "스토리 파악용" 근사치이며, 투자 판단의 근거로 사용하면 안 됨.

export interface NdxPePoint {
  date: string; // YYYY-MM-DD (연말 기준)
  value: number;
}

export const NASDAQ100_PE_ANNUAL: NdxPePoint[] = [
  { date: "1999-12-31", value: 82 },
  { date: "2000-12-31", value: 47 },
  { date: "2001-12-31", value: 32 },
  { date: "2002-12-31", value: 22 },
  { date: "2003-12-31", value: 35 },
  { date: "2004-12-31", value: 27 },
  { date: "2005-12-31", value: 22 },
  { date: "2006-12-31", value: 21 },
  { date: "2007-12-31", value: 24 },
  { date: "2008-12-31", value: 14 },
  { date: "2009-12-31", value: 23 },
  { date: "2010-12-31", value: 21 },
  { date: "2011-12-31", value: 14 },
  { date: "2012-12-31", value: 17 },
  { date: "2013-12-31", value: 19 },
  { date: "2014-12-31", value: 22 },
  { date: "2015-12-31", value: 22 },
  { date: "2016-12-31", value: 23 },
  { date: "2017-12-31", value: 26 },
  { date: "2018-12-31", value: 22 },
  { date: "2019-12-31", value: 30 },
  { date: "2020-12-31", value: 38 },
  { date: "2021-12-31", value: 35 },
  { date: "2022-12-31", value: 24 },
  { date: "2023-12-31", value: 33 },
  { date: "2024-12-31", value: 36 },
  { date: "2026-04-01", value: 35 }, // 최신 근사치
];
