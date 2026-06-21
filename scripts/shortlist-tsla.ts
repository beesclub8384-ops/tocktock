import * as fs from 'fs';
import * as path from 'path';
const MIN_OCC = 150; // 검증 가치 있는 최소 발생 횟수 (원하면 숫자 조정)
function run(){
  const src=path.join(process.cwd(),'reports','tsla-candidates-full.csv');
  if(!fs.existsSync(src)){console.error('원본 CSV가 없습니다. 먼저 scan-tsla-mega.ts를 실행하세요.');process.exit(1);}
  const raw=fs.readFileSync(src,'utf-8').replace(/^﻿/,'');
  const lines=raw.split('\n').filter(l=>l.trim());
  const rows:{c:string;prob:number;occ:number;lift:number;avg:number}[]=[];
  for(let i=1;i<lines.length;i++){
    const m=lines[i].match(/^"([^"]*)",([\d.]+),(\d+),(-?[\d.]+),(-?[\d.]+)$/);
    if(!m)continue;
    rows.push({c:m[1],prob:parseFloat(m[2]),occ:parseInt(m[3]),lift:parseFloat(m[4]),avg:parseFloat(m[5])});
  }
  const short=rows.filter(r=>r.occ>=MIN_OCC).sort((a,b)=>b.prob-a.prob);
  console.log(`\n전체 후보 ${rows.length}개 → 발생 ${MIN_OCC}회 이상 ${short.length}개로 압축\n`);
  console.log(`검증용 숏리스트 (상승확률 높은 순):`);
  short.slice(0,30).forEach((r,i)=>console.log(`${String(i+1).padStart(2)}. ${r.prob.toFixed(1)}%  발생 ${r.occ}회  (기준대비 ${r.lift>=0?'+':''}${r.lift.toFixed(1)}%p)  평균수익 ${r.avg.toFixed(2)}%  |  ${r.c}`));
  let csv='﻿순위,조건,다음날상승확률(%),발생횟수,기준선대비(%p),평균수익(%),검증결과메모\n';
  short.forEach((r,i)=>{csv+=`${i+1},"${r.c}",${r.prob.toFixed(1)},${r.occ},${r.lift.toFixed(1)},${r.avg.toFixed(2)},\n`;});
  const out=path.join(process.cwd(),'reports','tsla-shortlist.csv');
  fs.writeFileSync(out,csv,'utf-8');
  console.log(`\n저장(엑셀에서 열어 검증결과 직접 기록): ${out}`);
}
run();
