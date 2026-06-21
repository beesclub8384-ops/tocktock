import * as fs from 'fs';
import * as path from 'path';
const COST = 0.1;
interface Row { Date:string; O:number; H:number; L:number; C:number; V:number; S5:number|null; S10:number|null; S20:number|null; S60:number|null; }
function normalCDF(z:number):number{const t=1/(1+0.2316419*Math.abs(z));const d=0.3989423*Math.exp(-z*z/2);let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));if(z>0)p=1-p;return p;}
function load():Row[]{const csv=path.join(process.cwd(),'data','tsla_data.csv');const lines=fs.readFileSync(csv,'utf-8').split('\n').filter(l=>l.trim());return lines.slice(1).map(line=>{const v=line.split(',');return {Date:v[0],O:parseFloat(v[1]),H:parseFloat(v[2]),L:parseFloat(v[3]),C:parseFloat(v[4]),V:parseInt(v[5]),S5:v[6]?parseFloat(v[6]):null,S10:v[7]?parseFloat(v[7]):null,S20:v[8]?parseFloat(v[8]):null,S60:v[9]?parseFloat(v[9]):null};});}
function activeConds(d:Row[],i:number,volAvg:number[],hi20:number[],lo20:number[]):string[]{
  const out:string[]=[];const r=d[i];
  const isDown=(k:number)=>d[k].C<d[k].O;const isUp=(k:number)=>d[k].C>d[k].O;
  if(isDown(i))out.push('음봉1');if(isDown(i)&&isDown(i-1))out.push('음봉2');if(isDown(i)&&isDown(i-1)&&isDown(i-2))out.push('음봉3');
  if(isUp(i))out.push('양봉1');if(isUp(i)&&isUp(i-1))out.push('양봉2');if(isUp(i)&&isUp(i-1)&&isUp(i-2))out.push('양봉3');
  const cdn=(k:number)=>d[k].C<d[k-1].C;const cup=(k:number)=>d[k].C>d[k-1].C;
  if(cdn(i)&&cdn(i-1))out.push('종가하락2');if(cdn(i)&&cdn(i-1)&&cdn(i-2))out.push('종가하락3');
  if(cup(i)&&cup(i-1))out.push('종가상승2');if(cup(i)&&cup(i-1)&&cup(i-2))out.push('종가상승3');
  if(r.S5&&r.S10&&d[i-1].S5&&d[i-1].S10){if(d[i-1].S5!<=d[i-1].S10!&&r.S5!>r.S10!)out.push('5_10상향');if(d[i-1].S5!>=d[i-1].S10!&&r.S5!<r.S10!)out.push('5_10하향');}
  if(r.S5&&r.S20&&d[i-1].S5&&d[i-1].S20){if(d[i-1].S5!<=d[i-1].S20!&&r.S5!>r.S20!)out.push('5_20상향');if(d[i-1].S5!>=d[i-1].S20!&&r.S5!<r.S20!)out.push('5_20하향');}
  if(r.S20)out.push(r.C>r.S20!?'20위':'20아래');if(r.S60)out.push(r.C>r.S60!?'60위':'60아래');
  const va=volAvg[i];if(r.V>va*1.5)out.push('거래량1.5');if(r.V>va*2)out.push('거래량2');if(r.V<va*0.5)out.push('거래량절반');
  const chg=(r.C-d[i-1].C)/d[i-1].C*100;if(chg>=3)out.push('3%상승');if(chg>=5)out.push('5%상승');if(chg<=-3)out.push('3%하락');if(chg<=-5)out.push('5%하락');
  const gap=(r.O-d[i-1].C)/d[i-1].C*100;if(gap>=1)out.push('갭상승');if(gap<=-1)out.push('갭하락');
  if(r.C>=hi20[i]*0.99)out.push('20고점');if(r.C<=lo20[i]*1.01)out.push('20저점');
  return out;
}
function run(){
  const d=load();const n=d.length;
  const volAvg:number[]=d.map((_,i)=>i<19?NaN:d.slice(i-19,i+1).reduce((a,r)=>a+r.V,0)/20);
  const hi20:number[]=d.map((_,i)=>i<19?NaN:Math.max(...d.slice(i-19,i+1).map(r=>r.H)));
  const lo20:number[]=d.map((_,i)=>i<19?NaN:Math.min(...d.slice(i-19,i+1).map(r=>r.L)));
  const start=60,end=n-1,mid=Math.floor((start+end)/2);
  function tally(from:number,to:number){const st:{[k:string]:{occ:number;up:number;sg:number}}={};let bo=0,bu=0;
    for(let i=from;i<to;i++){const up=d[i+1].C>d[i].C;const gain=(d[i+1].C-d[i].C)/d[i].C*100;bo++;if(up)bu++;
      const a=activeConds(d,i,volAvg,hi20,lo20).sort();
      for(let x=0;x<a.length;x++)for(let y=x+1;y<a.length;y++){const k=a[x]+' + '+a[y];if(!st[k])st[k]={occ:0,up:0,sg:0};st[k].occ++;if(up)st[k].up++;st[k].sg+=gain;
        for(let z=y+1;z<a.length;z++){const k3=a[x]+' + '+a[y]+' + '+a[z];if(!st[k3])st[k3]={occ:0,up:0,sg:0};st[k3].occ++;if(up)st[k3].up++;st[k3].sg+=gain;}}
    }return {st,base:bu/bo*100};}
  const tr=tally(start,mid),te=tally(mid,end);
  const names=Object.keys(tr.st).filter(c=>tr.st[c]&&te.st[c]&&tr.st[c].occ>=30&&te.st[c].occ>=30);
  const N=names.length,bonf=0.05/N;
  let rawPass=0;const survivors:any[]=[];const passes:any[]=[];
  for(const c of names){const a=tr.st[c],b=te.st[c];const trp=a.up/a.occ*100,tep=b.up/b.occ*100,lift=tep-te.base;const p0=te.base/100;const z=(tep/100-p0)/Math.sqrt(p0*(1-p0)/b.occ);const pv=1-normalCDF(z);const net=b.sg/b.occ-COST;
    if(lift>0&&pv<0.05){rawPass++;passes.push({c,trp,tep,lift,occV:b.occ,pv,net});}
    if(lift>0&&pv<bonf)survivors.push({c,trp,tep,lift,occV:b.occ,pv,net});}
  const expectedByChance=N*0.05;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`테스트한 조합(2개·3개): ${N}개  ← 31개가 아니라 이만큼`);
  console.log(`검증구간 기준선: ${te.base.toFixed(1)}%`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n[보정 안 했을 때] p<0.05 통과: ${rawPass}개`);
  console.log(`  └ 순전히 운으로 예상되는 개수: 약 ${expectedByChance.toFixed(0)}개`);
  console.log(`  └ 둘이 비슷하면 = 실제 신호 없음(전부 노이즈)\n`);
  console.log(`[제대로 보정했을 때] 본페로니 p<${bonf.toExponential(2)} 통과: ${survivors.length}개`);
  passes.sort((a,b)=>b.tep-a.tep);
  console.log(`\n참고 — 보정 전 가장 좋아 보이는 조합 5개 (학습 vs 검증 일관성 확인용):`);
  passes.slice(0,5).forEach(p=>console.log(`  ${p.c}\n    학습 ${p.trp.toFixed(1)}% → 검증 ${p.tep.toFixed(1)}% (${p.occV}회, p=${p.pv.toFixed(4)})`));
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(survivors.length===0?'→ 결론: 수천 개 조합을 뒤져도 검증 통과 0개. 더 뒤져도 노이즈만 늘어남.':'→ 살아남은 조합 발견: '+survivors.length+'개');
  if(survivors.length>0){const out=path.join(process.cwd(),'reports','tsla-combos-survivors.md');let md=`# TSLA 조합 검증 생존자 (${new Date().toISOString().split('T')[0]})\n\n검증구간 기준선 ${te.base.toFixed(1)}% / 본페로니 p<${bonf.toExponential(2)}\n\n| 조합 | 학습 | 검증 | lift | 발생 | 비용차감수익 | p |\n|---|---|---|---|---|---|---|\n`;survivors.forEach(s=>{md+=`| ${s.c} | ${s.trp.toFixed(1)}% | ${s.tep.toFixed(1)}% | +${s.lift.toFixed(1)}%p | ${s.occV} | ${s.net.toFixed(2)}% | ${s.pv.toExponential(2)} |\n`;});fs.writeFileSync(out,md,'utf-8');console.log('파일 저장: '+out);}
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
run();
