'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { StockName, computeMetrics, kstNow } from '@/lib/daytrading';

const STOCKS: StockName[] = ['삼성전자', '하이닉스'];

// 매번 신선한 KST 기본값으로 폼 생성 (종목은 인자로 유지)
function makeInitialForm(stock: StockName = '삼성전자') {
  const { date, time } = kstNow();
  return { date, stock, buyTime: time, buyPrice: '', quantity: '', sellTime: time, sellPrice: '', memo: '' };
}

// 한국식 색상: 이익=빨강, 손실=파랑, 0=회색
function pnlColor(n: number): string {
  if (n > 0) return 'text-red-500 dark:text-red-400';
  if (n < 0) return 'text-blue-500 dark:text-blue-400';
  return 'text-muted-foreground';
}
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20';
const labelCls = 'block text-xs text-muted-foreground mb-1';

export function DayTradeQuickAdd() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => makeInitialForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }) as typeof form);

  // 열 때마다: 최신 KST 기본값으로 리셋 + 첫 입력에 포커스 + ESC/스크롤잠금
  useEffect(() => {
    if (!open) return;
    setForm(makeInitialForm(form.stock));
    setError('');
    setSavedMsg('');
    const t = requestAnimationFrame(() => firstFieldRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    setError('');
    setSavedMsg('');
    if (!form.date || !form.buyPrice || !form.sellPrice || !form.quantity) { setError('날짜·매수가·매도가·수량은 필수입니다.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/daytrading', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: form.date, stock: form.stock, buyTime: form.buyTime, buyPrice: Number(form.buyPrice), quantity: Number(form.quantity), sellTime: form.sellTime, sellPrice: Number(form.sellPrice), memo: form.memo }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? '저장 실패'); return; }
      // 성공: 폼 리셋(종목 유지) → 연속 입력, 페이지 목록 갱신 이벤트
      setForm(makeInitialForm(form.stock));
      setSavedMsg('저장됐습니다.');
      window.dispatchEvent(new Event('daytrading:updated'));
    } finally { setSaving(false); }
  }

  // 실시간 미리보기
  const canPreview = !!form.buyPrice && !!form.sellPrice && !!form.quantity;
  const preview = canPreview
    ? computeMetrics({
        id: '', date: form.date, stock: form.stock,
        buyTime: form.buyTime, buyPrice: Number(form.buyPrice), quantity: Number(form.quantity),
        sellTime: form.sellTime, sellPrice: Number(form.sellPrice), createdAt: 0,
      })
    : null;

  return (
    <>
      {/* 플로팅 버튼(FAB): 우하단. 데스크톱은 트레이딩뷰 버튼(bottom-6) 위로 쌓음 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="실전 단타 기록 빠른 입력 열기"
        className="fixed right-6 bottom-6 lg:bottom-[5.5rem] z-[190] flex h-12 items-center gap-1.5 rounded-full border-2 border-red-500 bg-white px-4 text-sm font-bold text-red-600 shadow-lg transition-colors hover:bg-red-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20V10M18 20V4M6 20v-4" />
        </svg>
        단타 기록
      </button>

      {/* 모달: 일정 팝업(z-[200])보다 위 */}
      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="실전 단타 기록 빠른 입력"
            className="my-8 w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">단타 기록 빠른 입력</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              {/* 공통: 날짜 + 종목 토글 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>날짜</span>
                  <input ref={firstFieldRef} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
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
              {savedMsg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{savedMsg}</p>}

              <div className="flex items-center justify-between">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
                >
                  {saving ? '저장 중...' : '기록 추가'}
                </button>
                <Link href="/daytrading" onClick={() => setOpen(false)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  전체 기록 보기 →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
