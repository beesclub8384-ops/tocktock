"use client";

import { useState, useEffect } from "react";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";
import type { GlobalIndicatorsResponse } from "@/lib/types/global-indicators";

/* ═══════════════════ 타입 ═══════════════════ */

type TileSize = "xl" | "lg" | "sm";
type Status = "danger" | "danger2" | "warn" | "warn2" | "ok" | "ok2" | "neutral" | "neutral2";

interface Indicator {
  id: string;
  ticker: string;
  name: string;
  value: string;
  unit: string;
  change: string;
  stars: number;
  size: TileSize;
  status: Status;
  category: string;
  manual?: boolean;
}

const MANUAL_IDS = new Set([
  "buffett_rate", "swap", "move", "pcr", "hy", "cds", "cc", "auto",
  "crb", "cape", "buffett", "em_cape", "debt", "m2", "gold_reserve",
  "dollar_share", "jolts", "pmi", "sp200", "revision", "bdi",
]);

interface ReadingGuide {
  icon: string;
  text: string;
  color: string;
}

interface ModalInfo {
  guru: string;
  description: string;
  importance: string;
  readings: ReadingGuide[];
  sources: { name: string; url: string }[];
}

/* ═══════════════════ 색상 맵 ═══════════════════ */

const STATUS_COLORS: Record<Status, string> = {
  danger: "#b91c1c",
  danger2: "#dc2626",
  warn: "#b45309",
  warn2: "#d97706",
  ok: "#15803d",
  ok2: "#16a34a",
  neutral: "#334155",
  neutral2: "#1e2d3d",
};

const CATEGORY_COLORS: Record<string, string> = {
  금리: "#3b82f6",
  "달러&환율": "#10b981",
  "심리&변동성": "#a855f7",
  신용리스크: "#ef4444",
  원자재: "#f59e0b",
  밸류에이션: "#ec4899",
  부채사이클: "#06b6d4",
  경제발표: "#22c55e",
  "모멘텀&실적": "#eab308",
  글로벌교역: "#14b8a6",
};

/* ═══════════════════ 지표 데이터 ═══════════════════ */

const INITIAL_CATEGORIES: { name: string; items: Indicator[] }[] = [
  {
    name: "금리",
    items: [
      { id: "us10y", ticker: "US10Y", name: "미국 10년물 국채 수익률", value: "4.52", unit: "%", change: "▲ +0.04", stars: 5, size: "xl", status: "warn", category: "금리" },
      { id: "us02y", ticker: "US02Y", name: "미국 2년물 국채 수익률", value: "4.28", unit: "%", change: "▲ +0.02", stars: 5, size: "xl", status: "warn", category: "금리" },
      { id: "t10y2y", ticker: "T10Y2Y", name: "장단기 금리 스프레드", value: "+0.24", unit: "%p", change: "역전 해소 중", stars: 5, size: "xl", status: "ok2", category: "금리" },
      { id: "tips", ticker: "DFII10", name: "실질금리", value: "2.08", unit: "%", change: "▲ +0.01", stars: 4, size: "lg", status: "warn", category: "금리" },
      { id: "walcl", ticker: "WALCL", name: "연준 대차대조표", value: "6.84", unit: "조$", change: "QT 진행 중", stars: 4, size: "lg", status: "neutral", category: "금리" },
      { id: "buffett_rate", ticker: "EY/10Y", name: "이익수익률 비교", value: "4.2", unit: "vs 4.5%", change: "채권 우위", stars: 4, size: "lg", status: "neutral2", category: "금리" },
    ],
  },
  {
    name: "달러&환율",
    items: [
      { id: "dxy", ticker: "DXY", name: "달러인덱스", value: "103.5", unit: "index", change: "▼ -0.12", stars: 5, size: "xl", status: "ok2", category: "달러&환율" },
      { id: "usdkrw", ticker: "USD/KRW", name: "원/달러 환율", value: "1,437", unit: "원", change: "▲ +3.2", stars: 4, size: "lg", status: "warn2", category: "달러&환율" },
      { id: "usdjpy", ticker: "USD/JPY", name: "엔/달러", value: "149.8", unit: "엔", change: "▼ -0.3", stars: 4, size: "lg", status: "ok", category: "달러&환율" },
      { id: "swap", ticker: "SWAP", name: "달러 스왑 베이시스", value: "-18", unit: "bp", change: "", stars: 3, size: "sm", status: "neutral2", category: "달러&환율" },
    ],
  },
  {
    name: "심리&변동성",
    items: [
      { id: "vix", ticker: "VIX", name: "VIX 공포지수", value: "18.4", unit: "index", change: "▲ +1.2", stars: 5, size: "xl", status: "ok", category: "심리&변동성" },
      { id: "move", ticker: "MOVE", name: "MOVE Index", value: "92.4", unit: "index", change: "▼ -3.1", stars: 4, size: "lg", status: "neutral", category: "심리&변동성" },
      { id: "pcr", ticker: "P/C", name: "풋/콜 비율", value: "0.82", unit: "", change: "", stars: 3, size: "sm", status: "neutral2", category: "심리&변동성" },
    ],
  },
  {
    name: "신용리스크",
    items: [
      { id: "hy", ticker: "HY SPREAD", name: "하이일드 스프레드", value: "3.72", unit: "%", change: "▼ -0.08", stars: 5, size: "xl", status: "ok", category: "신용리스크" },
      { id: "cds", ticker: "KR CDS", name: "한국 CDS", value: "38", unit: "bp", change: "▲ +2", stars: 4, size: "lg", status: "neutral", category: "신용리스크" },
      { id: "cc", ticker: "CC DEL", name: "신용카드 연체율", value: "3.2", unit: "%", change: "▲ 상승 중", stars: 3, size: "sm", status: "danger2", category: "신용리스크" },
      { id: "auto", ticker: "AUTO", name: "자동차 할부 연체율", value: "2.8", unit: "%", change: "▲ 상승 중", stars: 3, size: "sm", status: "warn", category: "신용리스크" },
    ],
  },
  {
    name: "원자재",
    items: [
      { id: "wti", ticker: "WTI", name: "WTI 원유", value: "71.4", unit: "$/bbl", change: "▼ -0.6", stars: 5, size: "xl", status: "ok", category: "원자재" },
      { id: "gold", ticker: "XAUUSD", name: "금 (Gold)", value: "2,912", unit: "$/oz", change: "▲ +18", stars: 4, size: "lg", status: "ok2", category: "원자재" },
      { id: "copper", ticker: "COPPER", name: "구리 닥터코퍼", value: "4.52", unit: "$/lb", change: "▲ +0.04", stars: 4, size: "lg", status: "ok", category: "원자재" },
      { id: "crb", ticker: "CRB", name: "CRB 원자재지수", value: "282", unit: "", change: "", stars: 3, size: "sm", status: "neutral", category: "원자재" },
    ],
  },
  {
    name: "밸류에이션",
    items: [
      { id: "cape", ticker: "CAPE", name: "Shiller CAPE", value: "34.2", unit: "배", change: "평균 17배", stars: 4, size: "lg", status: "danger", category: "밸류에이션" },
      { id: "buffett", ticker: "MKT/GDP", name: "버핏 인디케이터", value: "191", unit: "%", change: "버블 경고", stars: 4, size: "lg", status: "danger2", category: "밸류에이션" },
      { id: "em_cape", ticker: "EM CAPE", name: "이머징마켓 CAPE", value: "14.1", unit: "배", change: "", stars: 3, size: "sm", status: "neutral", category: "밸류에이션" },
    ],
  },
  {
    name: "부채사이클",
    items: [
      { id: "debt", ticker: "DEBT/GDP", name: "민간부채/GDP", value: "312", unit: "%", change: "▲ 경고 수준", stars: 4, size: "lg", status: "warn", category: "부채사이클" },
      { id: "m2", ticker: "GLOBAL M2", name: "글로벌 M2 증가율", value: "+6.2", unit: "%yoy", change: "▲ 확장 중", stars: 4, size: "lg", status: "ok2", category: "부채사이클" },
      { id: "gold_reserve", ticker: "GOLD RES", name: "중국 금 보유량", value: "1,082", unit: "톤", change: "", stars: 3, size: "sm", status: "ok", category: "부채사이클" },
      { id: "dollar_share", ticker: "USD SHR", name: "달러 기축통화 비중", value: "58.4", unit: "%", change: "▼ 감소", stars: 3, size: "sm", status: "neutral", category: "부채사이클" },
    ],
  },
  {
    name: "경제발표",
    items: [
      { id: "cpi", ticker: "CPI", name: "소비자물가지수", value: "3.0", unit: "%yoy", change: "▼ -0.2 전월비", stars: 5, size: "xl", status: "ok", category: "경제발표" },
      { id: "pce", ticker: "PCE", name: "PCE 물가지수", value: "2.6", unit: "%yoy", change: "▼ -0.1", stars: 5, size: "xl", status: "ok2", category: "경제발표" },
      { id: "nfp", ticker: "NFP", name: "비농업 고용지수", value: "143", unit: "만명", change: "전월 256만", stars: 5, size: "xl", status: "ok", category: "경제발표" },
      { id: "jolts", ticker: "JOLTS", name: "구인건수", value: "7.6", unit: "백만", change: "구인/실업 1.1x", stars: 4, size: "lg", status: "ok", category: "경제발표" },
      { id: "pmi", ticker: "US PMI", name: "제조업 PMI", value: "52.4", unit: "index", change: "▲ 확장 구간", stars: 4, size: "lg", status: "ok2", category: "경제발표" },
    ],
  },
  {
    name: "모멘텀&실적",
    items: [
      { id: "sp200", ticker: "SPX/MA200", name: "S&P500 vs 200일선", value: "+8.2", unit: "%↑", change: "▲ 200일선 위", stars: 4, size: "lg", status: "ok2", category: "모멘텀&실적" },
      { id: "revision", ticker: "EPS REV", name: "어닝스 리비전", value: "+62", unit: "%↑", change: "상향 우세", stars: 4, size: "lg", status: "ok2", category: "모멘텀&실적" },
    ],
  },
  {
    name: "글로벌교역",
    items: [
      { id: "bdi", ticker: "BDI", name: "발틱운임지수", value: "1,843", unit: "index", change: "▼ -42", stars: 3, size: "sm", status: "neutral", category: "글로벌교역" },
    ],
  },
];

// Mark manual indicators
INITIAL_CATEGORIES.forEach((cat) =>
  cat.items.forEach((item) => {
    if (MANUAL_IDS.has(item.id)) item.manual = true;
  })
);

/* ═══════════════════ 모달 콘텐츠 ═══════════════════ */

const MODAL_CONTENTS: Record<string, ModalInfo> = {
  us10y: {
    guru: "",
    description: "미국 정부가 10년 동안 돈 빌릴 때 내는 이자율입니다. 금리가 오르면 \"안전하게 4.5% 받는데 굳이 주식을 살까?\"라는 논리로 주식이 내립니다.\n\n2022년 0.25%에서 5.25%로 오르자 나스닥이 -33% 폭락했습니다. 모든 금융자산 가격의 출발점이라고 할 수 있습니다.",
    importance: "주식 적정가격(할인율), 부동산 대출금리, 모든 금융자산의 기준점입니다. 금리가 오르면 미래 수익의 현재가치가 줄어들어 성장주에 특히 타격이 큽니다.",
    readings: [
      { icon: "▲", text: "상승 → 주식↓ 채권가격↓ 달러↑", color: "#ef4444" },
      { icon: "▼", text: "하락 → 주식↑ 채권↑ 금↑", color: "#22c55e" },
      { icon: "◆", text: "4~5% 이상 → 주식 부담 구간", color: "#eab308" },
    ],
    sources: [
      { name: "Yahoo Finance — ^TNX", url: "https://finance.yahoo.com/quote/%5ETNX/" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-US10Y/" },
      { name: "Investing.com", url: "https://www.investing.com/rates-bonds/u.s.-10-year-bond-yield" },
    ],
  },
  us02y: {
    guru: "",
    description: "시장이 \"연준이 앞으로 2년간 금리를 어떻게 할 것 같다\"는 기대를 반영합니다. 연준 의장 발언 직후 가장 먼저 크게 반응하는 지표입니다.\n\n10년물보다 민감하게 움직여서 연준 정책 방향을 가장 빠르게 읽을 수 있습니다.",
    importance: "연준 정책을 가장 빠르게 선반영하는 지표입니다. FOMC 회의 결과나 연준 의장 발언 시 가장 먼저 확인해야 할 숫자입니다.",
    readings: [
      { icon: "▲", text: "상승 → 금리인상 기대 강화", color: "#ef4444" },
      { icon: "▼", text: "하락 → 금리인하 기대 강화", color: "#22c55e" },
      { icon: "◆", text: "2년물 > 10년물 → 장단기 역전 (경기침체 선행신호)", color: "#eab308" },
    ],
    sources: [
      { name: "FRED — DGS2", url: "https://fred.stlouisfed.org/series/DGS2" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-US02Y/" },
    ],
  },
  t10y2y: {
    guru: "",
    description: "10년 금리에서 2년 금리를 뺀 값입니다. 마이너스가 되면 \"역전\"이라고 합니다.\n\n역전되면 은행이 대출할수록 손해라 대출을 줄이고, 이는 경기를 냉각시킵니다. 1960년대 이후 역전 후 평균 12~18개월 내 경기침체가 발생했습니다.",
    importance: "가장 신뢰받는 경기침체 선행지표입니다. 역전이 해소되는 시점(정상화)이 오히려 침체 직전인 경우가 많아 해소 시점도 주의가 필요합니다.",
    readings: [
      { icon: "▲", text: "플러스 → 정상 상태", color: "#22c55e" },
      { icon: "◆", text: "0 근처 → 경고", color: "#eab308" },
      { icon: "▼", text: "마이너스 → 경기침체 선행신호 (1~2년 후)", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED — T10Y2Y", url: "https://fred.stlouisfed.org/series/T10Y2Y" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/FRED-T10Y2Y/" },
    ],
  },
  tips: {
    guru: "",
    description: "명목금리에서 인플레이션을 뺀 진짜 이자율입니다. 예를 들어 금리 5%, 물가 4%면 실질금리는 1%입니다.\n\n실질금리가 마이너스면 돈을 가지고 있는 것 자체가 손해입니다. 이럴 때 금이나 위험자산에 돈이 몰립니다.",
    importance: "금 가격과 반대로 움직입니다. 실질금리 마이너스이면 금 상승, 플러스 확대이면 금 하락하는 경향이 있습니다.",
    readings: [
      { icon: "▼", text: "마이너스 → 금↑ 위험자산↑", color: "#22c55e" },
      { icon: "▲", text: "플러스 확대 → 금↓ 성장주↓", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED — DFII10", url: "https://fred.stlouisfed.org/series/DFII10" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/FRED-DFII10/" },
    ],
  },
  walcl: {
    guru: "스탠리 드러켄밀러",
    description: "연준이 국채를 사면(QE) 시장에 돈이 풀려 자산이 오릅니다. 팔면(QT) 돈이 줄어 자산이 내립니다.\n\n2020년 코로나 때 QE로 8.9조 달러까지 늘리자 모든 자산이 폭등했습니다.",
    importance: "드러켄밀러는 \"연준의 유동성 변화 방향이 시장을 결정한다\"고 말했습니다. 유동성의 방향(늘어나는 중인지 줄어드는 중인지)이 핵심입니다.",
    readings: [
      { icon: "▲", text: "증가 (QE) → 유동성 공급 = 시장 우호", color: "#22c55e" },
      { icon: "▼", text: "감소 (QT) → 유동성 흡수 = 시장 부담", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED — WALCL", url: "https://fred.stlouisfed.org/series/WALCL" },
      { name: "연준 홈페이지", url: "https://www.federalreserve.gov/monetarypolicy/bst_recenttrends.htm" },
    ],
  },
  buffett_rate: {
    guru: "워런 버핏",
    description: "PER 24배면 이익수익률은 1/24 = 4.2%입니다. 이걸 국채금리 4.5%와 비교합니다.\n\n안전한 국채가 더 높으면 굳이 위험한 주식을 살 이유가 없습니다. 버핏은 \"금리는 중력과 같다\"고 말했습니다.",
    importance: "주식과 채권의 상대적 매력도를 비교하는 지표입니다. 금리가 높을수록 주식의 상대적 매력이 떨어집니다.",
    readings: [
      { icon: "▲", text: "이익수익률 > 국채금리 → 주식 매력적", color: "#22c55e" },
      { icon: "▼", text: "이익수익률 < 국채금리 → 주식 과대평가 가능", color: "#ef4444" },
    ],
    sources: [
      { name: "multpl.com", url: "https://www.multpl.com/s-p-500-earnings-yield" },
      { name: "Yahoo Finance — ^TNX", url: "https://finance.yahoo.com/quote/%5ETNX/" },
    ],
  },
  dxy: {
    guru: "",
    description: "미국 달러가 유로, 엔, 파운드 등 6개 통화 대비 얼마나 강한지를 숫자 하나로 표현합니다. 지수 100이 기준점입니다.\n\n예를 들어 DXY 103이면 달러가 기준보다 3% 강한 상태입니다.",
    importance: "달러 강세이면 원자재↓, 신흥국↓, 금↓. 모든 자산의 방향타 역할을 합니다.",
    readings: [
      { icon: "▲", text: "상승 = 달러 강세 → 원자재↓ 신흥국↓", color: "#ef4444" },
      { icon: "▼", text: "하락 = 달러 약세 → 원자재↑ 금↑", color: "#22c55e" },
      { icon: "◆", text: "100~105 = 중립 구간", color: "#eab308" },
    ],
    sources: [
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-DXY/" },
      { name: "Investing.com", url: "https://www.investing.com/indices/usdollar" },
    ],
  },
  usdkrw: {
    guru: "",
    description: "달러 1개를 사는 데 원화가 얼마나 필요한지를 나타냅니다. 환율이 오르면(원화 약세) 수입 물가가 상승하고, 외국인이 한국 주식을 매도합니다.\n\n예를 들어 환율 1,437원이면 달러 1개에 1,437원이 필요합니다.",
    importance: "코스피와 밀접하게 연동됩니다. 환율 급등은 외국인 이탈 신호입니다.",
    readings: [
      { icon: "▼", text: "1,200원대 = 원화 강세, 안정", color: "#22c55e" },
      { icon: "◆", text: "1,300원대 = 중립~약세", color: "#eab308" },
      { icon: "▲", text: "1,400원 이상 = 위기 신호", color: "#ef4444" },
    ],
    sources: [
      { name: "한국은행 ECOS", url: "https://ecos.bok.or.kr/" },
      { name: "네이버 금융", url: "https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW" },
      { name: "Investing.com", url: "https://www.investing.com/currencies/usd-krw" },
    ],
  },
  usdjpy: {
    guru: "",
    description: "엔화는 안전자산입니다. 위기가 오면 엔 강세(숫자 하락)가 됩니다.\n\n엔 캐리트레이드(일본에서 싸게 빌려 미국 주식에 투자)가 청산되면 전세계 자산이 동반 급락합니다. 2024년 8월 사태가 대표적인 사례입니다.",
    importance: "급격한 엔 강세는 전세계 위험자산 동반 매도 신호입니다.",
    readings: [
      { icon: "▼", text: "하락 (엔 강세) = 리스크오프, 주식 위험", color: "#ef4444" },
      { icon: "▲", text: "상승 (엔 약세) = 리스크온, 캐리트레이드 활성", color: "#22c55e" },
    ],
    sources: [
      { name: "TradingView", url: "https://www.tradingview.com/symbols/USDJPY/" },
      { name: "Investing.com", url: "https://www.investing.com/currencies/usd-jpy" },
    ],
  },
  swap: {
    guru: "",
    description: "달러가 세계적으로 부족할수록 마이너스로 확대됩니다.\n\n2008년 금융위기, 2020년 코로나 초기에 급격하게 확대되었습니다.",
    importance: "글로벌 달러 유동성 위기의 초기 신호입니다.",
    readings: [
      { icon: "◆", text: "0 근처 = 정상", color: "#22c55e" },
      { icon: "▼", text: "마이너스 확대 = 달러 부족, 위기 신호", color: "#ef4444" },
    ],
    sources: [
      { name: "Bloomberg", url: "https://www.bloomberg.com/markets/rates-bonds" },
      { name: "한국은행 ECOS", url: "https://ecos.bok.or.kr/" },
    ],
  },
  vix: {
    guru: "",
    description: "앞으로 30일간 S&P500이 얼마나 크게 움직일지 예상치입니다. 시장이 불안할수록 올라갑니다.\n\n코로나 초기(2020.03) 85까지 치솟았습니다. 평소에는 15~20 수준입니다.",
    importance: "기관은 VIX 급등 시 포지션을 축소합니다. 반대로 VIX 극저(10 이하)는 너무 안이하다는 역발상 경고입니다.",
    readings: [
      { icon: "◆", text: "10~15 = 극도 안정 (과낙관 경고)", color: "#eab308" },
      { icon: "◆", text: "15~20 = 정상", color: "#22c55e" },
      { icon: "▲", text: "30 이상 = 공포", color: "#ef4444" },
      { icon: "▲", text: "40 이상 = 패닉 (역발상 매수 기회)", color: "#dc2626" },
    ],
    sources: [
      { name: "CBOE", url: "https://www.cboe.com/tradable_products/vix/" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-VIX/" },
      { name: "Yahoo Finance", url: "https://finance.yahoo.com/quote/%5EVIX/" },
    ],
  },
  move: {
    guru: "",
    description: "채권시장의 VIX입니다. 금리가 앞으로 얼마나 불안정할지 예측합니다.\n\n2023년 SVB 사태 때 폭등했습니다.",
    importance: "MOVE 급등 = 채권시장 혼란 = 주식에도 악영향을 미칩니다.",
    readings: [
      { icon: "◆", text: "60~80 = 정상", color: "#22c55e" },
      { icon: "▲", text: "100 이상 = 불안", color: "#eab308" },
      { icon: "▲", text: "150 이상 = 심각한 위기", color: "#ef4444" },
    ],
    sources: [
      { name: "Bloomberg", url: "https://www.bloomberg.com/quote/MOVE:IND" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-MOVE/" },
    ],
  },
  pcr: {
    guru: "",
    description: "하락 베팅(풋)이 상승 베팅(콜)보다 얼마나 많은지를 나타냅니다.\n\n역발상 지표입니다. 모두가 하락에 베팅할 때 오히려 반등이 오는 경우가 많습니다.",
    importance: "시장 심리의 극단적 쏠림을 포착하는 데 유용합니다.",
    readings: [
      { icon: "▼", text: "0.7 이하 = 과낙관, 조심", color: "#eab308" },
      { icon: "▲", text: "1.0 이상 = 과공포, 반등 가능", color: "#22c55e" },
    ],
    sources: [
      { name: "CBOE", url: "https://www.cboe.com/us/options/market_statistics/" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/USI-PCC/" },
    ],
  },
  hy: {
    guru: "하워드 막스",
    description: "신용등급 낮은 기업(정크본드)이 국채보다 얼마나 더 높은 이자를 내야 하는지를 나타냅니다.\n\n경기가 나빠지면 부도 위험이 커져 스프레드가 확대됩니다. 2008년, 2020년에 폭등했습니다.",
    importance: "하워드 막스는 \"신용 사이클을 읽어라\"고 강조합니다. 스프레드가 벌어지면 신용 균열 = 주식 하락의 선행 신호입니다.",
    readings: [
      { icon: "◆", text: "3~4% = 정상", color: "#22c55e" },
      { icon: "▲", text: "5~7% = 경고", color: "#eab308" },
      { icon: "▲", text: "8% 이상 = 위기", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED — BAMLH0A0HYM2", url: "https://fred.stlouisfed.org/series/BAMLH0A0HYM2" },
      { name: "Bloomberg", url: "https://www.bloomberg.com/markets/rates-bonds" },
    ],
  },
  cds: {
    guru: "",
    description: "한국이 부도날 경우에 대한 보험료입니다. 한국 CDS 38bp는 1,000만 달러 보장에 연 3.8만 달러를 의미합니다.\n\n오를수록 한국 국가 신용 위험이 높다는 뜻입니다.",
    importance: "급등 시 외국인 이탈, 원화 약세, 코스피 하락과 연동됩니다.",
    readings: [
      { icon: "◆", text: "20bp 이하 = 안정", color: "#22c55e" },
      { icon: "▲", text: "50bp 이상 = 경고", color: "#eab308" },
      { icon: "▲", text: "100bp 이상 = 위기", color: "#ef4444" },
    ],
    sources: [
      { name: "Bloomberg", url: "https://www.bloomberg.com/quote/CKREA1U5:IND" },
      { name: "한국은행 ECOS", url: "https://ecos.bok.or.kr/" },
    ],
  },
  cc: {
    guru: "마이클 버리",
    description: "신용카드 대금을 못 내는 사람의 비율입니다. 버리는 2008년 주택 연체율 상승에서 금융위기를 미리 읽었습니다.\n\n같은 논리로 카드 연체율 상승은 소비 위축의 선행 신호입니다.",
    importance: "소비자 부채 붕괴의 첫 번째 신호입니다.",
    readings: [
      { icon: "◆", text: "2% 이하 = 정상", color: "#22c55e" },
      { icon: "▲", text: "3% 이상 급등 = 소비 둔화 신호", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED — DRCCLACBS", url: "https://fred.stlouisfed.org/series/DRCCLACBS" },
      { name: "뉴욕 연준", url: "https://www.newyorkfed.org/microeconomics/hhdc" },
    ],
  },
  auto: {
    guru: "마이클 버리",
    description: "자동차 할부를 못 내는 사람의 비율입니다. 중산층 재정 건전성의 바로미터입니다.\n\n카드 연체율과 함께 보면 소비자 부채 추세를 입체적으로 파악할 수 있습니다.",
    importance: "카드 연체율과 함께 소비자 부채 건전성을 파악하는 핵심 지표입니다.",
    readings: [
      { icon: "▲", text: "상승 추세 = 중산층 압박, 소비 위축 우려", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED", url: "https://fred.stlouisfed.org/series/DRALACBS" },
      { name: "뉴욕 연준", url: "https://www.newyorkfed.org/microeconomics/hhdc" },
    ],
  },
  wti: {
    guru: "",
    description: "미국산 원유 기준 가격입니다. 원유가 오르면 물류비 상승 → 모든 상품 가격 상승 → 인플레이션 → 연준 금리 인상 → 주식 하락. 이 연결고리가 핵심입니다.\n\n지정학 사건(중동 분쟁 등)에 즉각 반응합니다.",
    importance: "인플레이션의 핵심 변수입니다.",
    readings: [
      { icon: "◆", text: "60~80달러 = 적당", color: "#22c55e" },
      { icon: "▲", text: "80~100달러 = 인플레 압력", color: "#eab308" },
      { icon: "▲", text: "100달러 이상 = 경기 압박", color: "#ef4444" },
      { icon: "▼", text: "50달러 이하 = 경기침체 우려", color: "#ef4444" },
    ],
    sources: [
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-USOIL/" },
      { name: "Investing.com", url: "https://www.investing.com/commodities/crude-oil" },
      { name: "EIA", url: "https://www.eia.gov/petroleum/" },
    ],
  },
  gold: {
    guru: "레이 달리오",
    description: "금은 이자를 주지 않습니다. 그래서 실질금리가 마이너스일 때 매력적입니다. 예를 들어 은행 실질 수익이 -2%면 이자 없는 금도 상대적으로 유리합니다.\n\n달리오는 포트폴리오 핵심 자산으로 금을 강조합니다.",
    importance: "달러 신뢰 하락, 인플레 우려, 지정학 리스크를 반영합니다.",
    readings: [
      { icon: "▲", text: "금 상승 + 달러 약세 = 정상 패턴", color: "#22c55e" },
      { icon: "▲", text: "금 상승 + 달러 강세 = 극도 위기 (모든 걸 팔고 금만 사는 상태)", color: "#ef4444" },
    ],
    sources: [
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-GOLD/" },
      { name: "Kitco", url: "https://www.kitco.com/charts/livegold.html" },
      { name: "World Gold Council", url: "https://www.gold.org/goldhub/data/gold-prices" },
    ],
  },
  copper: {
    guru: "",
    description: "전선, 건물, 자동차 등 모든 산업에 쓰입니다. 경기가 좋으면 수요↑ 가격↑, 경기가 나쁘면 수요↓ 가격↓.\n\n주식보다 3~6개월 앞서 경기를 예측해서 \"닥터 코퍼\"라는 별명이 있습니다.",
    importance: "중국이 세계 소비의 50%를 차지해 중국 경기 바로미터이기도 합니다.",
    readings: [
      { icon: "▲", text: "상승 = 경기 회복 신호", color: "#22c55e" },
      { icon: "▼", text: "하락 = 경기 둔화 신호", color: "#ef4444" },
    ],
    sources: [
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-COPPER/" },
      { name: "LME", url: "https://www.lme.com/Metals/Non-ferrous/LME-Copper" },
    ],
  },
  crb: {
    guru: "폴 튜더 존스",
    description: "에너지, 금속, 농산물 등 19개 원자재 종합지수입니다. 원자재 전체 흐름을 하나의 숫자로 보여줍니다.",
    importance: "인플레이션 방향과 원자재 사이클을 파악하는 데 유용합니다.",
    readings: [
      { icon: "▲", text: "상승 = 인플레 압력", color: "#ef4444" },
      { icon: "▼", text: "하락 = 디플레 우려", color: "#eab308" },
    ],
    sources: [
      { name: "TradingView", url: "https://www.tradingview.com/symbols/TVC-TRJEFFCRB/" },
      { name: "Refinitiv", url: "https://www.refinitiv.com/" },
    ],
  },
  cape: {
    guru: "제러미 그랜섬",
    description: "과거 10년 평균 이익(인플레 조정)으로 나눈 PER입니다. 일반 PER은 경기에 따라 들쭉날쭉하지만 CAPE는 안정적입니다.\n\nCAPE 34.2배는 현재 가격을 회수하는 데 역사적 평균(17년)의 2배가 걸린다는 의미입니다.",
    importance: "2000년 닷컴버블 44배, 2021년 38배 후 큰 조정이 있었습니다. 그랜섬이 버블 진단에 사용하는 지표입니다.",
    readings: [
      { icon: "◆", text: "15~20배 = 역사적 평균", color: "#22c55e" },
      { icon: "▲", text: "25배 이상 = 고평가 경고", color: "#eab308" },
      { icon: "▲", text: "30배 이상 = 버블 영역", color: "#ef4444" },
    ],
    sources: [
      { name: "multpl.com", url: "https://www.multpl.com/shiller-pe" },
      { name: "Shiller Online Data", url: "http://www.econ.yale.edu/~shiller/data.htm" },
    ],
  },
  buffett: {
    guru: "워런 버핏",
    description: "전체 주식시장 시가총액을 GDP로 나눈 값입니다. 버핏이 \"주식 밸류에이션 최고 단일 지표\"라고 언급했습니다.\n\n191%는 경제가 만드는 것의 거의 2배를 주식이 주장하는 상태입니다.",
    importance: "2000년 닷컴버블과 2021년에 최고치를 기록한 후 큰 조정이 있었습니다.",
    readings: [
      { icon: "◆", text: "75~90% = 저평가~적정", color: "#22c55e" },
      { icon: "▲", text: "100~115% = 약간 고평가", color: "#eab308" },
      { icon: "▲", text: "140% 이상 = 버블 경고", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED — DDDM01USA156NWDB", url: "https://fred.stlouisfed.org/series/DDDM01USA156NWDB" },
      { name: "currentmarketvaluation.com", url: "https://www.currentmarketvaluation.com/models/buffett-indicator.php" },
    ],
  },
  em_cape: {
    guru: "제러미 그랜섬",
    description: "미국 주식이 비쌀 때 신흥국(한국, 브라질, 인도 등) 주식이 상대적으로 싼지 비교하는 지표입니다.\n\n자산배분 타이밍에 활용합니다.",
    importance: "미국 고평가 시 신흥국으로 자금이 이동하는 근거가 됩니다.",
    readings: [
      { icon: "▼", text: "미국 CAPE 대비 낮을수록 → 신흥국 상대적 저평가", color: "#22c55e" },
    ],
    sources: [
      { name: "MSCI", url: "https://www.msci.com/emerging-markets" },
      { name: "StarCapital", url: "https://www.starcapital.de/en/research/stock-market-valuation/" },
    ],
  },
  debt: {
    guru: "레이 달리오",
    description: "가계 + 기업 + 정부 빚 총합을 GDP로 나눈 값입니다. 312%는 경제가 만드는 것의 3배 넘는 빚이 있다는 뜻입니다.\n\n달리오의 핵심 이론: 장기 부채 사이클(75~100년) 정점에서 대공황 같은 사건이 발생합니다.",
    importance: "부채 디레버리징 사이클의 시작 시점을 파악하는 데 중요합니다.",
    readings: [
      { icon: "▲", text: "높을수록 시스템 취약", color: "#ef4444" },
    ],
    sources: [
      { name: "BIS", url: "https://www.bis.org/statistics/totcredit.htm" },
      { name: "FRED — HDTGPDUSQ163N", url: "https://fred.stlouisfed.org/series/HDTGPDUSQ163N" },
      { name: "IMF", url: "https://www.imf.org/external/datamapper/datasets/GDD" },
    ],
  },
  m2: {
    guru: "달리오 / 드러켄밀러",
    description: "전세계 시중에 돌아다니는 돈의 양 증가율입니다. 코로나 때 각국이 돈을 풀어 글로벌 M2가 급증하자 주식, 부동산, 코인이 폭등했습니다.\n\n드러켄밀러는 \"유동성이 시장을 결정한다\"고 말했습니다.",
    importance: "글로벌 M2 증가율과 주식시장 방향이 상당히 일치합니다.",
    readings: [
      { icon: "▲", text: "증가 → 자산가격 상승 경향", color: "#22c55e" },
      { icon: "▼", text: "감소 → 자산가격 하락 경향", color: "#ef4444" },
    ],
    sources: [
      { name: "FRED — WM2NS", url: "https://fred.stlouisfed.org/series/WM2NS" },
      { name: "한국은행 ECOS", url: "https://ecos.bok.or.kr/" },
    ],
  },
  gold_reserve: {
    guru: "레이 달리오",
    description: "중국, 러시아, 인도 등이 달러 대신 금을 외환보유고로 축적하고 있습니다.\n\n달리오는 이를 달러 기축통화 지위 약화의 신호로 봅니다.",
    importance: "달러 패권 약화 → 금 수요 증가 → 금 가격 상승 흐름을 추적합니다.",
    readings: [
      { icon: "▲", text: "중앙은행 금 매수 증가 = 달러 신뢰 하락 신호", color: "#eab308" },
    ],
    sources: [
      { name: "World Gold Council", url: "https://www.gold.org/goldhub/data/gold-reserves-by-country" },
      { name: "IMF", url: "https://data.imf.org/regular.aspx?key=41175" },
    ],
  },
  dollar_share: {
    guru: "레이 달리오",
    description: "달러의 글로벌 결제 및 외환보유고 비중입니다. 역사적으로 네덜란드 길더 → 영국 파운드 → 달러 순으로 기축통화가 교체되었습니다.\n\n달리오 저서 \"변화하는 세계 질서\"의 핵심 주제입니다.",
    importance: "달러 패권이 서서히 약화되고 있는지 모니터링하는 지표입니다.",
    readings: [
      { icon: "▼", text: "하락 추세 = 달러 패권 약화 진행 중", color: "#eab308" },
    ],
    sources: [
      { name: "IMF COFER", url: "https://data.imf.org/regular.aspx?key=41175" },
      { name: "SWIFT", url: "https://www.swift.com/our-solutions/compliance-and-shared-services/business-intelligence/renminbi/rmb-tracker" },
    ],
  },
  cpi: {
    guru: "",
    description: "식료품, 주거, 교통 등 소비자 물건 가격 변동의 종합입니다. CPI 3%는 1년 전보다 물가가 3% 올랐다는 뜻입니다.\n\n100만 원짜리 장바구니가 103만 원이 됩니다. 연준 목표는 2%입니다.",
    importance: "연준 금리 결정에 직결됩니다. CPI 발표일이 시장이 가장 크게 움직이는 날입니다.",
    readings: [
      { icon: "▼", text: "예상 하회 → 금리인하 기대, 주식↑", color: "#22c55e" },
      { icon: "▲", text: "예상 상회 → 금리인상 우려, 주식↓", color: "#ef4444" },
    ],
    sources: [
      { name: "BLS", url: "https://www.bls.gov/cpi/" },
      { name: "FRED — CPIAUCSL", url: "https://fred.stlouisfed.org/series/CPIAUCSL" },
      { name: "Investing.com", url: "https://www.investing.com/economic-calendar/cpi-733" },
    ],
  },
  pce: {
    guru: "",
    description: "연준이 공식적으로 가장 중시하는 물가 지표입니다. CPI와 달리 소비자 대체 행동을 반영합니다 (쇠고기가 비싸지면 닭고기로 바꾸는 것을 반영).\n\n연준 목표는 2%입니다.",
    importance: "FOMC 성명에서 가장 많이 언급됩니다. PCE가 2%를 향해 내려가는지가 금리인하 핵심 조건입니다.",
    readings: [
      { icon: "▼", text: "2% 근접 → 금리인하 기대 상승", color: "#22c55e" },
      { icon: "▲", text: "2% 이상 유지 → 금리 동결·인상 압력", color: "#ef4444" },
    ],
    sources: [
      { name: "BEA", url: "https://www.bea.gov/data/personal-consumption-expenditures-price-index" },
      { name: "FRED — PCEPI", url: "https://fred.stlouisfed.org/series/PCEPI" },
    ],
  },
  nfp: {
    guru: "",
    description: "농업을 제외한 미국 신규 취업자 수입니다. 정상은 월 15~20만 명입니다. 매월 첫 번째 금요일 오전 8:30(미국 시간) 발표됩니다.\n\n경제가 건강하면 일자리가 늘어납니다.",
    importance: "연준의 두 가지 임무 중 하나가 최대 고용입니다. 고용 과열 → 임금 상승 → 인플레 → 금리 인상 순서입니다.",
    readings: [
      { icon: "▲", text: "예상 크게 상회 → 과열, 금리인상 우려", color: "#eab308" },
      { icon: "▼", text: "예상 하회 → 경기 둔화 우려", color: "#ef4444" },
    ],
    sources: [
      { name: "BLS", url: "https://www.bls.gov/news.release/empsit.nr0.htm" },
      { name: "FRED — PAYEMS", url: "https://fred.stlouisfed.org/series/PAYEMS" },
      { name: "Investing.com", url: "https://www.investing.com/economic-calendar/nonfarm-payrolls-227" },
    ],
  },
  jolts: {
    guru: "",
    description: "기업의 구인건수, 이직률, 해고율을 측정합니다. 자발적 이직이 많다는 건 더 좋은 직장을 찾을 자신이 있다는 뜻으로 경기가 좋은 신호입니다.\n\n구인건수 ÷ 실업자 수가 1 이상이면 노동시장 과열입니다.",
    importance: "파월 의장이 특히 중시하는 지표입니다.",
    readings: [
      { icon: "▲", text: "구인 > 실업자 = 노동 과열", color: "#eab308" },
      { icon: "▼", text: "구인 < 실업자 = 노동 냉각", color: "#22c55e" },
    ],
    sources: [
      { name: "BLS — JOLTS", url: "https://www.bls.gov/jlt/" },
      { name: "FRED — JTSJOL", url: "https://fred.stlouisfed.org/series/JTSJOL" },
    ],
  },
  pmi: {
    guru: "",
    description: "기업 구매 담당자에게 \"지난달보다 나아졌나?\" 물어본 설문입니다. 50 이상이면 확장, 50 미만이면 수축입니다.\n\nGDP보다 훨씬 빨리 나오는 선행지표입니다.",
    importance: "경기 방향을 가장 빠르게 파악할 수 있는 지표입니다.",
    readings: [
      { icon: "▲", text: "55 이상 = 강한 확장", color: "#22c55e" },
      { icon: "◆", text: "50~55 = 완만 확장", color: "#22c55e" },
      { icon: "▼", text: "50 미만 = 수축", color: "#ef4444" },
      { icon: "▼", text: "45 미만 = 강한 수축", color: "#dc2626" },
    ],
    sources: [
      { name: "ISM", url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/" },
      { name: "S&P Global PMI", url: "https://www.pmi.spglobal.com/Public/Home/PressRelease" },
    ],
  },
  sp200: {
    guru: "폴 튜더 존스",
    description: "최근 200거래일(약 10개월) 평균 주가 대비 S&P500의 위치입니다. +8.2%면 현재 가격이 200일 평균보다 8.2% 높다는 뜻입니다.\n\n폴 튜더 존스의 철칙: \"200일선 아래면 주식을 보유하지 않는다.\"",
    importance: "이 단순 규칙만 따라도 대형 하락장에서 큰 손실을 회피할 수 있습니다.",
    readings: [
      { icon: "▲", text: "200일선 위 = 매수 우호", color: "#22c55e" },
      { icon: "▼", text: "200일선 아래 = 주의, 현금 비중 확대", color: "#ef4444" },
    ],
    sources: [
      { name: "TradingView", url: "https://www.tradingview.com/symbols/SPX/" },
      { name: "Yahoo Finance", url: "https://finance.yahoo.com/quote/%5EGSPC/" },
    ],
  },
  revision: {
    guru: "스탠리 드러켄밀러",
    description: "애널리스트들이 기업 실적 전망을 올리면 상향 리비전, 내리면 하향 리비전입니다. +62%는 상향이 하향보다 62% 많다는 뜻입니다.\n\n드러켄밀러: \"유동성과 실적 방향이 가장 중요하다.\"",
    importance: "유동성 공급 + 실적 전망 상향 = 최적 매수 시점입니다.",
    readings: [
      { icon: "▲", text: "상향 증가 = 실적 개선 기대, 매수 우호", color: "#22c55e" },
      { icon: "▼", text: "하향 증가 = 실적 우려, 주의", color: "#ef4444" },
    ],
    sources: [
      { name: "FactSet Earnings Insight", url: "https://insight.factset.com/" },
      { name: "Bloomberg", url: "https://www.bloomberg.com/markets" },
      { name: "Yardeni Research", url: "https://www.yardeni.com/" },
    ],
  },
  bdi: {
    guru: "",
    description: "원자재를 운반하는 벌크선 운임 종합지수입니다. 경기가 좋으면 원자재 수요↑ 운임↑입니다.\n\n투기하거나 조작하기 어려워 실제 경제 활동을 정직하게 반영합니다. 세계 교역량을 2~3개월 선행합니다.",
    importance: "실물 경기의 정직한 바로미터입니다.",
    readings: [
      { icon: "▲", text: "상승 = 세계 경기 회복 신호", color: "#22c55e" },
      { icon: "▼", text: "급락 = 교역 둔화, 경기침체 우려", color: "#ef4444" },
    ],
    sources: [
      { name: "Baltic Exchange", url: "https://www.balticexchange.com/" },
      { name: "TradingView", url: "https://www.tradingview.com/symbols/INDEX-BDI/" },
    ],
  },
};

/* ═══════════════════ 타일 컴포넌트 ═══════════════════ */

function Tile({ item, onClick }: { item: Indicator; onClick: () => void }) {
  const bg = STATUS_COLORS[item.status];

  const sizeStyle: React.CSSProperties =
    item.size === "xl"
      ? { flex: "1 1 0", minWidth: 120, minHeight: 92 }
      : item.size === "lg"
        ? { flex: "0 0 108px", width: 108, minHeight: 80 }
        : { flex: "0 0 76px", width: 76, minHeight: 68 };

  const valueSize = item.size === "xl" ? 26 : item.size === "lg" ? 19 : 13;
  const nameSize = item.size === "xl" ? 11 : item.size === "lg" ? 10 : 8;

  return (
    <button
      onClick={onClick}
      style={{ ...sizeStyle, backgroundColor: bg }}
      className="rounded-md p-2 flex flex-col justify-center items-center text-center transition-all duration-150 hover:brightness-130 hover:scale-[1.04] cursor-pointer border-0"
    >
      <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace" }} className="text-white/50">
        {item.ticker}
      </span>
      <span
        style={{ fontSize: valueSize, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}
        className="text-white font-semibold"
      >
        {item.value}
      </span>
      {item.unit && (
        <span style={{ fontSize: 8 }} className="text-white/40">
          {item.unit}
        </span>
      )}
      <span style={{ fontSize: nameSize, lineHeight: 1.2 }} className="text-white/80 mt-0.5">
        {item.name}
      </span>
      {item.change && (
        <span style={{ fontSize: 8 }} className="text-white/40 mt-0.5">
          {item.change}
        </span>
      )}
      {item.manual && (
        <span style={{ fontSize: 7 }} className="text-white/30 mt-0.5">
          수동업데이트
        </span>
      )}
    </button>
  );
}

/* ═══════════════════ 카테고리 블록 ═══════════════════ */

function CategoryBlock({
  name,
  items,
  onTileClick,
}: {
  name: string;
  items: Indicator[];
  onTileClick: (item: Indicator) => void;
}) {
  const color = CATEGORY_COLORS[name] ?? "#666";

  return (
    <div className="relative" style={{ border: `1px solid ${color}`, borderRadius: 8, padding: 12, paddingTop: 18 }}>
      <span
        className="absolute text-xs font-medium px-1.5"
        style={{ top: -8, left: 8, backgroundColor: "var(--background)", color }}
      >
        {name}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Tile key={item.id} item={item} onClick={() => onTileClick(item)} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════ 모달 ═══════════════════ */

function IndicatorModal({ item, onClose }: { item: Indicator; onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();
  const info = MODAL_CONTENTS[item.id];
  if (!info) return null;

  const stars = "★".repeat(item.stars) + "☆".repeat(5 - item.stars);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        data-draggable-modal
        className="relative w-full"
        style={{
          ...(size.width ? { width: size.width, height: size.height } : { maxWidth: 600 }),
          backgroundColor: "#161b24",
          border: "1px solid #2a3444",
          borderRadius: 12,
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto" style={{ maxHeight: size.height ? size.height - 2 : "85vh", padding: 24 }}>
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4 cursor-move select-none" onMouseDown={handleMouseDown}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: CATEGORY_COLORS[item.category] + "30", color: CATEGORY_COLORS[item.category] }}
              >
                {item.category}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace" }} className="text-white/50 text-sm">
                {item.ticker}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">{item.name}</h2>
            <div className="flex items-baseline gap-3 mt-1">
              <span style={{ fontFamily: "'DM Mono', monospace" }} className="text-3xl font-bold text-white">
                {item.value}
              </span>
              <span className="text-white/40 text-sm">{item.unit}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none p-1">
            ✕
          </button>
        </div>

        {/* 별점 */}
        <div className="mb-4">
          <span className="text-amber-400 text-lg tracking-wider">{stars}</span>
          <span className="text-white/40 text-xs ml-2">중요도</span>
        </div>

        {/* 거장 배지 */}
        {info.guru && (
          <div className="mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {info.guru}
            </span>
          </div>
        )}

        {/* 섹션들 */}
        <div className="space-y-4">
          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-2">📖 초보자 설명</h3>
            <div className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{info.description}</div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-2">⚡ 왜 중요한가</h3>
            <p className="text-sm text-white/80 leading-relaxed">{info.importance}</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-2">📐 어떻게 읽는가</h3>
            <ul className="space-y-1.5">
              {info.readings.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span style={{ color: r.color }} className="font-bold flex-shrink-0">
                    {r.icon}
                  </span>
                  <span className="text-white/80">{r.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white/70 mb-2">🔗 어디서 보는가</h3>
            <div className="flex flex-wrap gap-1.5">
              {info.sources.map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80 transition-colors">
                  {s.name}
                </a>
              ))}
            </div>
          </section>
        </div>
        </div>
        <div onMouseDown={handleResizeMouseDown} className="absolute bottom-0 right-0 cursor-se-resize p-1 select-none" style={{ fontSize: 14, lineHeight: 1, color: "rgba(255,255,255,0.3)" }}>⋱</div>
      </div>
    </div>
  );
}

/* ═══════════════════ 메인 페이지 ═══════════════════ */

function formatValue(id: string, value: number): string {
  if (id === "usdkrw") return Math.round(value).toLocaleString();
  if (id === "gold") return Math.round(value).toLocaleString();
  if (id === "t10y2y") return (value >= 0 ? "+" : "") + value.toFixed(2);
  if (id === "nfp") return String(value);
  return value.toFixed(2);
}

function formatChange(change: number | null): string {
  if (change === null || change === 0) return "";
  const sign = change > 0 ? "▲ +" : "▼ ";
  return `${sign}${Math.abs(change) >= 10 ? Math.round(change) : change.toFixed(2)}`;
}

function deepCloneCategories() {
  return INITIAL_CATEGORIES.map((cat) => ({
    ...cat,
    items: cat.items.map((item) => ({ ...item })),
  }));
}

export default function GlobalIndicatorsPage() {
  const [categories, setCategories] = useState(() => deepCloneCategories());
  const [selected, setSelected] = useState<Indicator | null>(null);

  useEffect(() => {
    fetch("/api/global-indicators")
      .then((res) => res.json())
      .then((json: GlobalIndicatorsResponse) => {
        const liveMap = new Map(json.data.map((d) => [d.id, d]));
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            items: cat.items.map((item) => {
              const live = liveMap.get(item.id);
              if (!live || live.value === null) return item;
              return {
                ...item,
                value: formatValue(item.id, live.value),
                unit: live.unit || item.unit,
                change: formatChange(live.change) || item.change,
              };
            }),
          }))
        );
      })
      .catch((err) => console.error("global-indicators fetch error:", err));
  }, []);

  const cat = (name: string) => categories.find((c) => c.name === name)!;

  return (
    <div
      className="min-h-screen bg-background px-4 py-8"
      style={{ fontFamily: "'Noto Sans KR', 'DM Mono', sans-serif" }}
    >
      <div className="max-w-5xl mx-auto space-y-3">
        {/* 1행: 금리 (전체 폭) */}
        <CategoryBlock name="금리" items={cat("금리").items} onTileClick={setSelected} />

        {/* 2행: 달러&환율 | 심리&변동성 */}
        <div className="grid grid-cols-2 gap-3">
          <CategoryBlock name="달러&환율" items={cat("달러&환율").items} onTileClick={setSelected} />
          <CategoryBlock name="심리&변동성" items={cat("심리&변동성").items} onTileClick={setSelected} />
        </div>

        {/* 3행: 신용리스크 | 원자재 */}
        <div className="grid grid-cols-2 gap-3">
          <CategoryBlock name="신용리스크" items={cat("신용리스크").items} onTileClick={setSelected} />
          <CategoryBlock name="원자재" items={cat("원자재").items} onTileClick={setSelected} />
        </div>

        {/* 4행: 밸류에이션 | 부채사이클 */}
        <div className="grid grid-cols-2 gap-3">
          <CategoryBlock name="밸류에이션" items={cat("밸류에이션").items} onTileClick={setSelected} />
          <CategoryBlock name="부채사이클" items={cat("부채사이클").items} onTileClick={setSelected} />
        </div>

        {/* 5행: 경제발표 (전체 폭) */}
        <CategoryBlock name="경제발표" items={cat("경제발표").items} onTileClick={setSelected} />

        {/* 6행: 모멘텀&실적 | 글로벌교역 */}
        <div className="grid grid-cols-2 gap-3">
          <CategoryBlock name="모멘텀&실적" items={cat("모멘텀&실적").items} onTileClick={setSelected} />
          <CategoryBlock name="글로벌교역" items={cat("글로벌교역").items} onTileClick={setSelected} />
        </div>
      </div>

      {/* 모달 */}
      {selected && <IndicatorModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
