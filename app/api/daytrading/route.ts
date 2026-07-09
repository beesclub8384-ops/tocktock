import { NextRequest, NextResponse } from 'next/server';
import { loadRecords, addRecord, deleteRecord } from '@/lib/daytrading-store';
import type { StockName } from '@/lib/daytrading';
export const dynamic = 'force-dynamic';
export async function GET() {
  const records = await loadRecords();
  records.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ records });
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const stock = body.stock as StockName;
    if (stock !== '삼성전자' && stock !== '하이닉스')
      return NextResponse.json({ error: '종목은 삼성전자 또는 하이닉스만 가능합니다.' }, { status: 400 });
    const buyPrice = Number(body.buyPrice), sellPrice = Number(body.sellPrice), quantity = Number(body.quantity);
    if (!body.date || !buyPrice || !sellPrice || !quantity)
      return NextResponse.json({ error: '날짜·매수가·매도가·수량은 필수입니다.' }, { status: 400 });
    const records = await addRecord({
      date: String(body.date), stock,
      buyTime: String(body.buyTime ?? ''), buyPrice, quantity,
      sellTime: String(body.sellTime ?? ''), sellPrice,
      memo: body.memo ? String(body.memo) : undefined,
    });
    records.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ records });
  } catch {
    return NextResponse.json({ error: '저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  const records = await deleteRecord(id);
  records.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ records });
}
