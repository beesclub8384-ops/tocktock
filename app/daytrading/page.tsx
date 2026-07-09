'use client';
import { useEffect, useState } from 'react';
import { DayTradeRecord, StockName, computeMetrics, formatHolding } from '@/lib/daytrading';
const STOCKS: StockName[] = ['삼성전자', '하이닉스'];
const emptyForm = { date: '', stock: '삼성전자' as StockName, buyTime: '', buyPrice: '', quantity: '', sellTime: '', sellPrice: '', memo: '' };
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
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">실전 단타 기록</h1>
      <p className="text-sm text-gray-500 mb-6">삼성전자 · 하이닉스 당일 매매 기록 (키움 일반 수수료·세금 반영)</p>
      <div className="rounded-xl border border-gray-200 p-4 mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col text-sm"><span className="mb-1 text-gray-600">날짜</span>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className="border rounded-lg px-2 py-1.5" /></label>
          <label className="flex flex-col text-sm"><span className="mb-1 text-gray-600">종목</span>
            <select value={form.stock} onChange={(e) => set('stock', e.target.value)} className="border rounded-lg px-2 py-1.5">
              {STOCKS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="flex flex-col text-sm"><span className="mb-1 text-gray-600">수량(주)</span>
            <input type="number" inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className="border rounded-lg px-2 py-1.5" placeholder="100" /></label>
          <div />
          <label className="flex flex-col text-sm"><span className="mb-1 text-gray-600">매수 시각</span>
            <input type="time" value={form.buyTime} onChange={(e) => set('buyTime', e.target.value)} className="border rounded-lg px-2 py-1.5" /></label>
          <label className="flex flex-col text-sm"><span className="mb-1 text-gray-600">매수가</span>
            <input type="number" inputMode="numeric" value={form.buyPrice} onChange={(e) => set('buyPrice', e.target.value)} className="border rounded-lg px-2 py-1.5" placeholder="71200" /></label>
          <label className="flex flex-col text-sm"><span className="mb-1 text-gray-600">매도 시각</span>
            <input type="time" value={form.sellTime} onChange={(e) => set('sellTime', e.target.value)} className="border rounded-lg px-2 py-1.5" /></label>
          <label className="flex flex-col text-sm"><span className="mb-1 text-gray-600">매도가</span>
            <input type="number" inputMode="numeric" value={form.sellPrice} onChange={(e) => set('sellPrice', e.target.value)} className="border rounded-lg px-2 py-1.5" placeholder="72500" /></label>
          <label className="flex flex-col text-sm col-span-2 md:col-span-4"><span className="mb-1 text-gray-600">메모</span>
            <input type="text" value={form.memo} onChange={(e) => set('memo', e.target.value)} className="border rounded-lg px-2 py-1.5" placeholder="예: 장 초반 급등 눌림목" /></label>
        </div>
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        <button onClick={handleSubmit} disabled={saving} className="mt-4 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm disabled:opacity-50">
          {saving ? '저장 중...' : '기록 추가'}</button>
      </div>
      {loading ? <p className="text-gray-400 text-sm">불러오는 중...</p>
      : records.length === 0 ? <p className="text-gray-400 text-sm">아직 기록이 없습니다. 첫 매매를 입력해 보세요.</p>
      : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-3">날짜</th><th className="py-2 pr-3">종목</th><th className="py-2 pr-3">매수→매도</th>
              <th className="py-2 pr-3">수량</th><th className="py-2 pr-3">보유</th>
              <th className="py-2 pr-3 text-right">순손익</th><th className="py-2 pr-3 text-right">순수익률</th>
              <th className="py-2 pr-3">메모</th><th className="py-2"></th></tr></thead>
            <tbody>
              {records.map((r) => {
                const m = computeMetrics(r); const pos = m.netProfit >= 0;
                const c = pos ? 'text-red-500' : 'text-blue-500'; // 한국식: 이익=빨강, 손실=파랑
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.date}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.stock}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.buyTime || '-'} {r.buyPrice.toLocaleString()} → {r.sellTime || '-'} {r.sellPrice.toLocaleString()}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.quantity.toLocaleString()}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatHolding(m.holdingMinutes)}</td>
                    <td className={'py-2 pr-3 text-right whitespace-nowrap ' + c}>{pos ? '+' : ''}{m.netProfit.toLocaleString()}원</td>
                    <td className={'py-2 pr-3 text-right whitespace-nowrap ' + c}>{pos ? '+' : ''}{m.netReturn.toFixed(2)}%</td>
                    <td className="py-2 pr-3 max-w-[160px] truncate text-gray-500" title={r.memo}>{r.memo || '-'}</td>
                    <td className="py-2"><button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500 text-xs">삭제</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
