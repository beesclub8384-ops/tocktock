import * as fs from 'fs';
import * as path from 'path';
interface Row { Date:string; O:number; H:number; L:number; C:number; V:number; S5:number|null; S10:number|null; S20:number|null; S60:number|null; }
function load():Row[]{const csv=path.join(process.cwd(),'data','tsla_data.csv');const lines=fs.readFileSync(csv,'utf-8').split('\n').filter(l=>l.trim());return lines.slice(1).map(line=>{const v=line.split(',');return {Date:v[0],O:parseFloat(v[1]),H:parseFloat(v[2]),L:parseFloat(v[3]),C:parseFloat(v[4]),V:parseInt(v[5]),S5:v[6]?parseFloat(v[6]):null,S10:v[7]?parseFloat(v[7]):null,S20:v[8]?parseFloat(v[8]):null,S60:v[9]?parseFloat(v[9]):null};});}
function activeConds(d:Row[],i:number,volAvg:number[],hi20:number[],lo20:number[]):string[]{
  const out:string[]=[];const r=d[i];
  const isDown=(k:number)=>d[k].C<d[k].O;const isUp=(k:number)=>d[k].C>d[k].O;
  if(isDown(i))out.push('음봉1');
  if(isDown(i)&&isDown(i-1))out.push('음봉2연속');
  if(isDown(i)&&isDown(i-1)&&isDown(i-2))out.push('음봉3연속');
  if(isUp(i))out.push('양봉1');
  if(isUp(i)&&isUp(i-1))out.push('양봉2연속');
  if(isUp(i)&&isUp(i-1)&&isUp(i-2))out.push('양봉3연속');
  const cdn=(k:number)=>d[k].C<d[k-1].C;const cup=(k:number)=>d[k].C>d[k-1].C;
  if(cdn(i)&&cdn(i-1))out.push('종가2연속하락');
  if(cdn(i)&&cdn(i-1)&&cdn(i-2))out.push('종가3연속하락');
  if(cup(i)&&cup(i-1))out.push('종가2연속상승');
  if(cup(i)&&cup(i-1)&&cup(i-2))out.push('종가3연속상승');
  if(r.S5&&r.S10&&d[i-1].S5&&d[i-1].S10){if(d[i-1].S5!<=d[i-1].S10!&&r.S5!>r.S10!)out.push('5_10_상향돌파');if(d[i-1].S5!>=d[i-1].S10!&&r.S5!<r.S10!)out.push('5_10_하향돌파');}
  if(r.S5&&r.S20&&d[i-1].S5&&d[i-1].S20){if(d[i-1].S5!<=d[i-1].S20!&&r.S5!>r.S20!)out.push('5_20_상향돌파');if(d[i-1].S5!>=d[i-1].S20!&&r.S5!<r.S20!)out.push('5_20_하향돌파');}
  if(r.S10&&r.S20&&d[i-1].S10&&d[i-1].S20){if(d[i-1].S10!<=d[i-1].S20!&&r.S10!>r.S20!)out.push('10_20_상향돌파');if(d[i-1].S10!>=d[i-1].S20!&&r.S10!<r.S20!)out.push('10_20_하향돌파');}
  if(r.S20)out.push(r.C>r.S20!?'20이평위':'20이평아래');
  if(r.S60)out.push(r.C>r.S60!?'60이평위':'60이평아래');
  const va=volAvg[i];
  if(r.V>va*1.5)out.push('거래량1.5배');
  if(r.V>va*2)out.push('거래량2배');
  if(r.V<va*0.5)out.push('거래량절반이하');
  const chg=(r.C-d[i-1].C)/d[i-1].C*100;
  if(chg>=3)out.push('당일3%상승');
  if(chg>=5)out.push('당일5%상승');
  if(chg<=-3)out.push('당일3%하락');
  if(chg<=-5)out.push('당일5%하락');
  const gap=(r.O-d[i-1].C)/d[i-1].C*100;
  if(gap>=1)out.push('갭상승1%');
  if(gap<=-1)out.push('갭하락1%');
  if(r.C>=hi20[i]*0.99)out.push('20일고점부근');
  if(r.C<=lo20[i]*1.01)out.push('20일저점부근');
  return out;
}
function run(){
  const d=load();const n=d.length;
  const volAvg:number[]=d.map((_,i)=>i<19?NaN:d.slice(i-19,i+1).reduce((a,r)=>a+r.V,0)/20);
  const hi20:number[]=d.map((_,i)=>i<19?NaN:Math.max(...d.slice(i-19,i+1).map(r=>r.H)));
  const lo20:number[]=d.map((_,i)=>i<19?NaN:Math.min(...d.slice(i-19,i+1).map(r=>r.L)));
  const start=60,end=n-1;
  const st:{[k:string]:{occ:number;up:number;g:number[]}}={};let bo=0,bu=0;
  for(let i=start;i<end;i++){const up=d[i+1].C>d[i].C;const gain=(d[i+1].C-d[i].C)/d[i].C*100;bo++;if(up)bu++;for(const c of activeConds(d,i,volAvg,hi20,lo20)){if(!st[c])st[c]={occ:0,up:0,g:[]};st[c].occ++;if(up)st[c].up++;st[c].g.push(gain);}}
  const base=bu/bo*100;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`TSLA 전체기간 후보 스캔  ${d[start].Date} ~ ${d[end-1].Date}`);
  console.log(`기준선(아무 조건 없을 때 다음날 상승확률): ${base.toFixed(1)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('※ 검증 전 "조사 후보" 목록입니다. 상승확률 높은 순.\n');
  const ranked=Object.entries(st).filter(([_,s])=>s.occ>=30).map(([c,s])=>({c,prob:s.up/s.occ*100,lift:s.up/s.occ*100-base,occ:s.occ,avg:s.g.reduce((a,b)=>a+b,0)/s.g.length})).sort((a,b)=>b.prob-a.prob);
  ranked.forEach((r,i)=>{const sign=r.lift>=0?'+':'';console.log(`${String(i+1).padStart(2)}. ${r.c.padEnd(16)}  상승 ${r.prob.toFixed(1)}%  (기준선대비 ${sign}${r.lift.toFixed(1)}%p)  발생 ${r.occ}회  평균수익 ${r.avg.toFixed(2)}%`);});
  console.log(`\n총 ${ranked.length}개 조건 (발생 30회 이상)`);
}
run();
