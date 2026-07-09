'use client';
import { useEffect, useState } from 'react';
import { DayTradeRecord, StockName, computeMetrics, formatHolding } from '@/lib/daytrading';

const STOCKS: StockName[] = ['삼성전자', '하이닉스'];
const emptyForm = { date: '', stock: '삼성전자' as StockName, buyTime: '', buyPrice: '', quantity: '', sellTime: '', sellPrice: '', memo: '' };

// 한국식 색상: 이익=빨강, 손실=파랑, 0=회색 (라이트/다크 모두 대응)
function pnlColor(n: number): string {
  if (n > 0) return 'text-red-500 dark:text-red-400';
  if (n < 0) return 'text-blue-500 dark:text-blue-400';
  return 'text-muted-foreground';
}
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

export default function DayTradingPage() {
  const [records, setRecords] = useState<DayTradeRecord[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function fetchRecords() {
    setLoading(true);
    try { const res = await fetch('/api/daytrading'); const d = await res.json(); setRecords(d.records ?? []); }
    finally { setLoading(false); }
  }
  useEffect(() => { fetchRecords(); }, []);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }) as typeof form);

  async function handleSubmit() {
    setError('');
    if (!form.date || !form.buyPrice || !form.sellPrice || !form.quantity) { setError('날짜·매수가·매도가·수량은 필수입니다.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/daytrading', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: form.date, stock: form.stock, buyTime: form.buyTime, buyPrice: Number(form.buyPrice), quantity: Number(form.quantity), sellTime: form.sellTime, sellPrice: Number(form.sellPrice), memo: form.memo }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? '저장 실패'); return; }
      setRecords(d.records ?? []);
      setForm({ ...emptyForm, date: form.date, stock: form.stock });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 기록을 삭제할까요?')) return;
    const res = await fetch('/api/daytrading?id=' + encodeURIComponent(id), { method: 'DELETE' });
    const d = await res.json(); setRecords(d.records ?? []);
  }

  // 실시간 미리보기: 매수가·매도가·수량이 모두 채워졌을 때만 계산
  const canPreview = !!form.buyPrice && !!form.sellPrice && !!form.quantity;
  const preview = canPreview
    ? computeMetrics({
        id: '', date: form.date, stock: form.stock,
        buyTime: form.buyTime, buyPrice: Number(form.buyPrice), quantity: Number(form.quantity),
        sellTime: form.sellTime, sellPrice: Number(form.sellPrice), createdAt: 0,
      })
    : null;

  // 요약 바: 누적 순손익 합계
  const totalNet = records.reduce((sum, r) => sum + computeMetrics(r).netProfit, 0);

  const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20';
  const labelCls = 'block text-xs text-muted-foreground mb-1';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 space-y-8">
        {/* 헤더 */}
        <header>
          <h1 className="text-2xl font-bold tracking-tight">실전 단타 기록</h1>
          <p className="mt-1 text-sm text-muted-foreground">삼성전자 · 하이닉스 당일 매매 기록 (키움 일반 수수료·세금 반영)</p>
        </header>

        {/* 요약 바 */}
        {records.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-border bg-card px-5 py-4">
            <div>
              <div className="text-xs text-muted-foreground">총 기록</div>
              <div className="text-lg font-bold tabular-nums" style={MONO}>{records.length.toLocaleString()}건</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">누적 순손익</div>
              <div className={`text-lg font-bold tabular-nums ${pnlColor(totalNet)}`} style={MONO}>
                {totalNet > 0 ? '+' : ''}{totalNet.toLocaleString()}원
              </div>
            </div>
          </div>
        )}

        {/* 입력 폼 */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-5">
          <h2 className="text-lg font-bold">매매 기록 입력</h2>

          {/* 공통: 날짜 + 종목 토글 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>날짜</span>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
            </label>
            <div>
              <span className={labelCls}>종목</span>
              <div className="flex gap-1">
                {STOCKS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('stock', s)}
                    aria-pressed={form.stock === s}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      form.stock === s
                        ? 'bg-foreground/10 text-foreground border border-foreground/30'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 매수·매도 분리 블록 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 매수 진입 */}
            <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-4 space-y-3">
              <div className="text-sm font-bold text-red-500 dark:text-red-400">매수 진입</div>
              <label className="block">
                <span className={labelCls}>매수 시각</span>
                <input type="time" value={form.buyTime} onChange={(e) => set('buyTime', e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>매수가</span>
                <input type="number" inputMode="numeric" value={form.buyPrice} onChange={(e) => set('buyPrice', e.target.value)} className={inputCls} placeholder="71200" />
              </label>
              <label className="block">
                <span className={labelCls}>수량(주)</span>
                <input type="number" inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className={inputCls} placeholder="100" />
              </label>
            </div>

            {/* 매도 청산 */}
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/[0.04] p-4 space-y-3">
              <div className="text-sm font-bold text-blue-500 dark:text-blue-400">매도 청산</div>
              <label className="block">
                <span className={labelCls}>매도 시각</span>
                <input type="time" value={form.sellTime} onChange={(e) => set('sellTime', e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>매도가</span>
                <input type="number" inputMode="numeric" value={form.sellPrice} onChange={(e) => set('sellPrice', e.target.value)} className={inputCls} placeholder="72500" />
              </label>
            </div>
          </div>

          {/* 메모 */}
          <label className="block">
            <span className={labelCls}>메모</span>
            <input type="text" value={form.memo} onChange={(e) => set('memo', e.target.value)} className={inputCls} placeholder="예: 장 초반 급등 눌림목" />
          </label>

          {/* 실시간 미리보기 */}
          {preview && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="mb-2 text-xs text-muted-foreground">예상 결과 (수수료·세금 반영)</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">순손익</div>
                  <div className={`mt-0.5 text-lg font-bold tabular-nums ${pnlColor(preview.netProfit)}`} style={MONO}>
                    {preview.netProfit > 0 ? '+' : ''}{preview.netProfit.toLocaleString()}원
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">순수익률</div>
                  <div className={`mt-0.5 text-lg font-bold tabular-nums ${pnlColor(preview.netProfit)}`} style={MONO}>
                    {preview.netReturn > 0 ? '+' : ''}{preview.netReturn.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">총비용</div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums text-muted-foreground" style={MONO}>
                    {preview.totalCost.toLocaleString()}원
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
          >
            {saving ? '저장 중...' : '기록 추가'}
          </button>
        </section>

        {/* 기록 목록 */}
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 기록이 없습니다. 첫 매매를 입력해 보세요.</p>
        ) : (
          <section className="space-y-4">
            {/* PC: 표 */}
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">날짜</th>
                    <th className="px-4 py-3 font-medium">종목</th>
                    <th className="px-4 py-3 font-medium">매수 → 매도</th>
                    <th className="px-4 py-3 font-medium text-right">수량</th>
                    <th className="px-4 py-3 font-medium">보유</th>
                    <th className="px-4 py-3 font-medium text-right">순손익</th>
                    <th className="px-4 py-3 font-medium text-right">순수익률</th>
                    <th className="px-4 py-3 font-medium">메모</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const m = computeMetrics(r);
                    const cls = pnlColor(m.netProfit);
                    const pos = m.netProfit >= 0;
                    return (
                      <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 whitespace-nowrap">{r.date}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{r.stock}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={MONO}>
                          {r.buyTime || '-'} {r.buyPrice.toLocaleString()} → {r.sellTime || '-'} {r.sellPrice.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">{r.quantity.toLocaleString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatHolding(m.holdingMinutes)}</td>
                        <td className={`px-4 py-3 whitespace-nowrap text-right font-bold tabular-nums ${cls}`} style={MONO}>
                          {pos ? '+' : ''}{m.netProfit.toLocaleString()}원
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-right font-bold tabular-nums ${cls}`} style={MONO}>
                          {pos ? '+' : ''}{m.netReturn.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 max-w-[160px] truncate text-muted-foreground" title={r.memo}>{r.memo || '-'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDelete(r.id)}
                            aria-label="기록 삭제"
                            className="text-muted-foreground transition-colors hover:text-red-500 dark:hover:text-red-400"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                              <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 */}
            <div className="space-y-3 md:hidden">
              {records.map((r) => {
                const m = computeMetrics(r);
                const cls = pnlColor(m.netProfit);
                const pos = m.netProfit >= 0;
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{r.stock}</span>
                        <span className="text-xs text-muted-foreground">{r.date}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(r.id)}
                        aria-label="기록 삭제"
                        className="text-muted-foreground transition-colors hover:text-red-500 dark:hover:text-red-400"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                    <div className={`mt-3 text-2xl font-bold tabular-nums ${cls}`} style={MONO}>
                      {pos ? '+' : ''}{m.netProfit.toLocaleString()}원
                      <span className="ml-2 text-sm">({pos ? '+' : ''}{m.netReturn.toFixed(2)}%)</span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div className="tabular-nums" style={MONO}>
                        {r.buyTime || '-'} {r.buyPrice.toLocaleString()} → {r.sellTime || '-'} {r.sellPrice.toLocaleString()}
                      </div>
                      <div>수량 {r.quantity.toLocaleString()}주 · 보유 {formatHolding(m.holdingMinutes)}</div>
                      {r.memo && <div className="text-foreground/70">메모: {r.memo}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
