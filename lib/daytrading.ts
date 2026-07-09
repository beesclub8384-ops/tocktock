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
