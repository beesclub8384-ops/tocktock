export type StockName = '삼성전자' | '하이닉스';
export interface DayTradeRecord {
  id: string; date: string; stock: StockName;
  buyTime: string; buyPrice: number; quantity: number;
  sellTime: string; sellPrice: number; memo?: string; createdAt: number;
}
// 키움 일반 수수료 기준(2026), 코스피. 세율/이벤트 변경 시 이 숫자만 수정.
export const COMMISSION_RATE = 0.00015;      // 매매수수료 0.015% (매수·매도 각각)
export const AGENCY_FEE_RATE = 0.000036396;  // 유관기관 제비용 (매수·매도 각각)
export const TAX_RATE = 0.002;               // 증권거래세+농특세 0.20% (매도 시에만)
export const BUY_COST_RATE = COMMISSION_RATE + AGENCY_FEE_RATE;
export const SELL_COST_RATE = COMMISSION_RATE + AGENCY_FEE_RATE + TAX_RATE;
export interface TradeMetrics { grossProfit: number; grossReturn: number; buyCost: number; sellCost: number; totalCost: number; netProfit: number; netReturn: number; holdingMinutes: number | null; }
export function computeMetrics(r: DayTradeRecord): TradeMetrics {
  const buyAmount = r.buyPrice * r.quantity;
  const sellAmount = r.sellPrice * r.quantity;
  const grossProfit = sellAmount - buyAmount;
  const grossReturn = buyAmount > 0 ? (grossProfit / buyAmount) * 100 : 0;
  const buyCost = Math.floor(buyAmount * BUY_COST_RATE);   // 원 미만 절사
  const sellCost = Math.floor(sellAmount * SELL_COST_RATE);
  const totalCost = buyCost + sellCost;
  const netProfit = grossProfit - totalCost;
  const netReturn = buyAmount > 0 ? (netProfit / buyAmount) * 100 : 0;
  return { grossProfit, grossReturn, buyCost, sellCost, totalCost, netProfit, netReturn, holdingMinutes: diffMinutes(r.buyTime, r.sellTime) };
}
function parseHHMM(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function diffMinutes(b: string, s: string): number | null {
  const bb = parseHHMM(b); const ss = parseHHMM(s);
  if (bb === null || ss === null) return null;
  return ss - bb;
}
export function formatHolding(mins: number | null): string {
  if (mins === null || mins < 0) return '-';
  const h = Math.floor(mins / 60); const m = mins % 60;
  return h === 0 ? m + '분' : h + '시간 ' + m + '분';
}

export interface AggregateStats {
  count: number; wins: number; losses: number; draws: number;
  winRate: number;            // %
  avgWin: number;             // 원 (이긴 매매 평균 순손익)
  avgLoss: number;            // 원 (진 매매 평균 순손익, 양수)
  payoffRatio: number | null; // 손익비 = avgWin / avgLoss
  avgNetProfit: number;       // 원, 1회당 평균 순손익 (기대값)
  avgNetReturn: number;       // %, 1회당 평균 순수익률 (기대값)
  cumulativeNet: number;      // 누적 순손익
  totalCost: number;          // 누적 비용(수수료+세금)
  mdd: number;                // 원, 누적손익 고점 대비 최대 낙폭
  mddPct: number;             // % (고점 대비)
}

export function computeStats(records: DayTradeRecord[]): AggregateStats {
  const empty: AggregateStats = { count: 0, wins: 0, losses: 0, draws: 0, winRate: 0, avgWin: 0, avgLoss: 0, payoffRatio: null, avgNetProfit: 0, avgNetReturn: 0, cumulativeNet: 0, totalCost: 0, mdd: 0, mddPct: 0 };
  if (!records.length) return empty;
  const sorted = [...records].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if ((a.buyTime || '') !== (b.buyTime || '')) return (a.buyTime || '') < (b.buyTime || '') ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
  let wins = 0, losses = 0, draws = 0, sumWin = 0, sumLoss = 0;
  let sumNet = 0, sumReturn = 0, totalCost = 0;
  let equity = 0, peak = 0, mdd = 0, mddPct = 0;
  for (const r of sorted) {
    const m = computeMetrics(r);
    sumNet += m.netProfit; sumReturn += m.netReturn; totalCost += m.totalCost;
    if (m.netProfit > 0) { wins++; sumWin += m.netProfit; }
    else if (m.netProfit < 0) { losses++; sumLoss += -m.netProfit; }
    else draws++;
    equity += m.netProfit;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > mdd) { mdd = dd; mddPct = peak > 0 ? (dd / peak) * 100 : 0; }
  }
  const count = sorted.length;
  const avgWin = wins ? sumWin / wins : 0;
  const avgLoss = losses ? sumLoss / losses : 0;
  return {
    count, wins, losses, draws,
    winRate: count ? (wins / count) * 100 : 0,
    avgWin, avgLoss,
    payoffRatio: avgLoss > 0 ? avgWin / avgLoss : null,
    avgNetProfit: count ? sumNet / count : 0,
    avgNetReturn: count ? sumReturn / count : 0,
    cumulativeNet: sumNet, totalCost, mdd, mddPct,
  };
}
