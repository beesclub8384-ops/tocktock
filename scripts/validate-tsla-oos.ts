import * as fs from 'fs';
import * as path from 'path';

// ── 가정값 (명시적으로 표시) ──
const ROUND_TRIP_COST_PCT = 0.1; // 왕복 거래비용 가정 0.1% (낙관적 추정)

interface Row { Date: string; Close: number; Volume: number; S5: number|null; S10: number|null; S20: number|null; S60: number|null; }

// 정규분포 CDF (p-value 계산용, Abramowitz-Stegun 근사)
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

function genPatterns(r: Row, volAvg: number): string[] {
  const c = r.Close, s5 = r.S5!, s10 = r.S10!, s20 = r.S20!, s60 = r.S60!;
  const a = c > s5 ? 'C>S5' : 'C<S5';
  const b = c > s10 ? 'C>S10' : 'C<S10';
  const cc = c > s20 ? 'C>S20' : 'C<S20';
  const dd = c > s60 ? 'C>S60' : 'C<S60';
  const e = s5 > s20 ? 'S5>S20' : 'S5<S20';
  const f = s10 > s20 ? 'S10>S20' : 'S10<S20';
  const g = s20 > s60 ? 'S20>S60' : 'S20<S60';
  const v = r.Volume > volAvg ? 'HighVol' : 'LowVol';
  return [a, b, cc, dd, e, f, g, v, `${a}+${e}`, `${b}+${f}`, `${cc}+${g}`, `${a}+${cc}+${g}`, `${e}+${g}+${v}`];
}

// 한 구간의 통계 계산
function computeStats(data: Row[], volAvg20: (number|null)[], from: number, to: number) {
  const stats: { [k: string]: { occ: number; up: number; gains: number[] } } = {};
  let baseOcc = 0, baseUp = 0; const baseGains: number[] = [];
  for (let i = from; i < to; i++) {
    const t = data[i], n = data[i + 1];
    if (!t.S5 || !t.S10 || !t.S20 || !t.S60 || volAvg20[i] === null) continue;
    const isUp = n.Close > t.Close;
    const gain = ((n.Close - t.Close) / t.Close) * 100;
    baseOcc++; if (isUp) baseUp++; baseGains.push(gain);
    for (const p of genPatterns(t, volAvg20[i]!)) {
      if (!stats[p]) stats[p] = { occ: 0, up: 0, gains: [] };
      stats[p].occ++; if (isUp) stats[p].up++; stats[p].gains.push(gain);
    }
  }
  const baseRate = (baseUp / baseOcc) * 100;
  return { stats, baseRate, baseOcc, baseGains };
}

function run() {
  const csvPath = path.join(process.cwd(), 'data', 'tsla_data.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').filter(l => l.trim());
  const data: Row[] = lines.slice(1).map(line => {
    const v = line.split(',');
    return { Date: v[0], Close: parseFloat(v[4]), Volume: parseInt(v[5]),
      S5: v[6] ? parseFloat(v[6]) : null, S10: v[7] ? parseFloat(v[7]) : null,
      S20: v[8] ? parseFloat(v[8]) : null, S60: v[9] ? parseFloat(v[9]) : null };
  });

  const volAvg20: (number|null)[] = data.map((_, i) => {
    if (i < 19) return null;
    return data.slice(i - 19, i + 1).reduce((a, r) => a + r.Volume, 0) / 20;
  });

  const mid = Math.floor(data.length / 2);
  // 학습구간: 0 ~ mid-1 / 검증구간: mid ~ 끝 (겹침 없음)
  const train = computeStats(data, volAvg20, 0, mid - 1);
  const test = computeStats(data, volAvg20, mid, data.length - 1);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📚 학습구간(train): ${data[0].Date} ~ ${data[mid-1].Date}`);
  console.log(`   기준선 상승확률 ${train.baseRate.toFixed(1)}% (${train.baseOcc}일)`);
  console.log(`🔬 검증구간(test):  ${data[mid].Date} ~ ${data[data.length-1].Date}`);
  console.log(`   기준선 상승확률 ${test.baseRate.toFixed(1)}% (${test.baseOcc}일)`);
  console.log(`💸 거래비용 가정: 왕복 ${ROUND_TRIP_COST_PCT}% (낙관적)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 학습구간에서 lift 상위 패턴 선정 (occ>=30)
  const topTrain = Object.entries(train.stats)
    .map(([p, s]) => ({ p, occ: s.occ, prob: (s.up / s.occ) * 100, lift: (s.up / s.occ) * 100 - train.baseRate }))
    .filter(r => r.occ >= 30)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 12);

  console.log('학습구간 상위 패턴 → 검증구간에서 살아남는가?\n');
  let survived = 0, significant = 0;

  topTrain.forEach((tr, i) => {
    const te = test.stats[tr.p];
    if (!te) { console.log(`${i+1}. ${tr.p}: 검증구간 데이터 없음`); return; }
    const teProb = (te.up / te.occ) * 100;
    const teLift = teProb - test.baseRate;
    const grossGain = te.gains.reduce((a, b) => a + b, 0) / te.gains.length;
    const netGain = grossGain - ROUND_TRIP_COST_PCT;
    // 일방향 이항검정 (검증구간 기준선 대비)
    const p0 = test.baseRate / 100;
    const z = (teProb / 100 - p0) / Math.sqrt(p0 * (1 - p0) / te.occ);
    const pValue = 1 - normalCDF(z);

    const liftOK = teLift > 0;
    const sigOK = pValue < 0.05;
    if (liftOK) survived++;
    if (sigOK && liftOK) significant++;

    const mark = (sigOK && liftOK) ? '✅' : (liftOK ? '🔸' : '❌');
    console.log(`${mark} ${tr.p}`);
    console.log(`    학습: ${tr.prob.toFixed(1)}% (lift +${tr.lift.toFixed(1)}%p)`);
    console.log(`    검증: ${teProb.toFixed(1)}% (lift ${teLift>=0?'+':''}${teLift.toFixed(1)}%p)  p=${pValue.toFixed(3)}  발생 ${te.occ}회`);
    console.log(`    검증 평균수익: 총 ${grossGain.toFixed(2)}% → 비용차감 ${netGain.toFixed(2)}%\n`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📋 판정`);
  console.log(`   학습 상위 ${topTrain.length}개 중 검증에서 lift 양수 유지: ${survived}개`);
  console.log(`   그중 통계적으로 유의(p<0.05): ${significant}개`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (significant === 0) {
    console.log('→ 결론: 검증구간을 통과한 신뢰할 만한 패턴 없음 (이 접근법은 엣지 없음)');
  } else {
    console.log(`→ ${significant}개 패턴이 검증 통과. 추가 정밀검토 가치 있음`);
  }
}

run();
