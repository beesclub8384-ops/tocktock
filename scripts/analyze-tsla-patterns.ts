import * as fs from 'fs';
import * as path from 'path';

interface CSVRow {
  Date: string;
  Close: number;
  Volume: number;
  SMA_5: number | null;
  SMA_10: number | null;
  SMA_20: number | null;
  SMA_60: number | null;
}

function analyzePatterns() {
  const csvPath = path.join(process.cwd(), 'data', 'tsla_data.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').filter(l => l.trim());

  const data: CSVRow[] = lines.slice(1).map(line => {
    const v = line.split(',');
    return {
      Date: v[0],
      Close: parseFloat(v[4]),
      Volume: parseInt(v[5]),
      SMA_5: v[6] ? parseFloat(v[6]) : null,
      SMA_10: v[7] ? parseFloat(v[7]) : null,
      SMA_20: v[8] ? parseFloat(v[8]) : null,
      SMA_60: v[9] ? parseFloat(v[9]) : null,
    };
  });

  console.log(`데이터 로드: ${data.length}개 행\n`);

  // 20일 평균 거래량 미리 계산
  const volAvg20: (number | null)[] = data.map((_, i) => {
    if (i < 19) return null;
    const sum = data.slice(i - 19, i + 1).reduce((a, r) => a + r.Volume, 0);
    return sum / 20;
  });

  const stats: { [k: string]: { occ: number; up: number; gains: number[] } } = {};
  let baseOcc = 0, baseUp = 0;
  const baseGains: number[] = [];

  for (let i = 0; i < data.length - 1; i++) {
    const t = data[i], n = data[i + 1];
    if (!t.SMA_5 || !t.SMA_10 || !t.SMA_20 || !t.SMA_60 || volAvg20[i] === null) continue;

    const isUp = n.Close > t.Close;
    const gain = ((n.Close - t.Close) / t.Close) * 100;

    // 기준선 통계
    baseOcc++;
    if (isUp) baseUp++;
    baseGains.push(gain);

    // 패턴 생성
    for (const p of generatePatterns(t, volAvg20[i]!)) {
      if (!stats[p]) stats[p] = { occ: 0, up: 0, gains: [] };
      stats[p].occ++;
      if (isUp) stats[p].up++;
      stats[p].gains.push(gain);
    }
  }

  const baseRate = (baseUp / baseOcc) * 100;
  const baseGain = baseGains.reduce((a, b) => a + b, 0) / baseGains.length;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 기준선 (아무 조건 없을 때)`);
  console.log(`   상승 확률: ${baseRate.toFixed(1)}%  |  평균수익: ${baseGain.toFixed(2)}%`);
  console.log(`   (전체 ${baseOcc}일 기준)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = Object.entries(stats)
    .map(([pattern, s]) => ({
      pattern,
      occ: s.occ,
      up: s.up,
      prob: (s.up / s.occ) * 100,
      lift: (s.up / s.occ) * 100 - baseRate,
      avgGain: s.gains.reduce((a, b) => a + b, 0) / s.gains.length,
    }))
    .filter(r => r.occ >= 30)
    .sort((a, b) => b.lift - a.lift);

  console.log('상승 신호 TOP 15 (기준선 대비 높은 순)\n');
  results.slice(0, 15).forEach((r, i) => {
    const sign = r.lift >= 0 ? '+' : '';
    console.log(`${String(i + 1).padStart(2)}. ${r.pattern}`);
    console.log(`    확률 ${r.prob.toFixed(1)}%  (기준선 대비 ${sign}${r.lift.toFixed(1)}%p)  |  발생 ${r.occ}회  |  평균수익 ${r.avgGain.toFixed(2)}%\n`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`총 패턴 종류: ${Object.keys(stats).length}개 | 30회 이상 발생: ${results.length}개`);
}

function generatePatterns(row: CSVRow, volAvg: number): string[] {
  const c = row.Close, s5 = row.SMA_5!, s10 = row.SMA_10!, s20 = row.SMA_20!, s60 = row.SMA_60!;
  const cVsS5 = c > s5 ? 'C>S5' : 'C<S5';
  const cVsS10 = c > s10 ? 'C>S10' : 'C<S10';
  const cVsS20 = c > s20 ? 'C>S20' : 'C<S20';
  const cVsS60 = c > s60 ? 'C>S60' : 'C<S60';
  const s5VsS20 = s5 > s20 ? 'S5>S20' : 'S5<S20';
  const s10VsS20 = s10 > s20 ? 'S10>S20' : 'S10<S20';
  const s20VsS60 = s20 > s60 ? 'S20>S60' : 'S20<S60';
  const vol = row.Volume > volAvg ? 'HighVol' : 'LowVol';  // 자기 20일 평균 대비
  return [
    cVsS5, cVsS10, cVsS20, cVsS60, s5VsS20, s10VsS20, s20VsS60, vol,
    `${cVsS5}+${s5VsS20}`,
    `${cVsS10}+${s10VsS20}`,
    `${cVsS20}+${s20VsS60}`,
    `${cVsS5}+${cVsS20}+${s20VsS60}`,
    `${s5VsS20}+${s20VsS60}+${vol}`,
  ];
}

analyzePatterns();
