import * as fs from 'fs';
import * as path from 'path';
const COST = 0.1;
interface Row { Date:string; O:number; H:number; L:number; C:number; V:number; S5:number|null; S10:number|null; S20:number|null; S60:number|null; }
const DESC:{[k:string]:string}={
  '음봉1':'당일 음봉(종가<시가)','음봉2연속':'음봉 2일 연속','음봉3연속':'음봉 3일 연속',
  '양봉1':'당일 양봉(종가>시가)','양봉2연속':'양봉 2일 연속','양봉3연속':'양봉 3일 연속',
  '종가2연속하락':'종가 2일 연속 하락','종가3연속하락':'종가 3일 연속 하락',
  '종가2연속상승':'종가 2일 연속 상승','종가3연속상승':'종가 3일 연속 상승',
  '5_10_상향돌파':'5이평이 10이평 상향돌파','5_10_하향돌파':'5이평이 10이평 하향돌파',
  '5_20_상향돌파':'5이평이 20이평 상향돌파','5_20_하향돌파':'5이평이 20이평 하향돌파',
  '10_20_상향돌파':'10이평이 20이평 상향돌파','10_20_하향돌파':'10이평이 20이평 하향돌파',
  '20이평위':'종가가 20이평 위','20이평아래':'종가가 20이평 아래',
  '60이평위':'종가가 60이평 위','60이평아래':'종가가 60이평 아래',
  '거래량1.5배':'거래량 20일평균 1.5배 이상','거래량2배':'거래량 20일평균 2배 이상','거래량절반이하':'거래량 20일평균 절반 이하',
  '당일3%상승':'당일 3% 이상 상승','당일5%상승':'당일 5% 이상 상승','당일3%하락':'당일 3% 이상 하락','당일5%하락':'당일 5% 이상 하락',
  '갭상승1%':'시가가 전일종가 +1% 갭상승','갭하락1%':'시가가 전일종가 -1% 갭하락',
  '20일고점부근':'종가가 20일 고점 부근','20일저점부근':'종가가 20일 저점 부근'};
function normalCDF(z:number):number{const t=1/(1+0.2316419*Math.abs(z));const d=0.3989423*Math.exp(-z*z/2);let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));if(z>0)p=1-p;return p;}
function load():Row[]{const csv=path.join(process.cwd(),'data','tsla_data.csv');const lines=fs.readFileSync(csv,'utf-8').split('\n').filter(l=>l.trim());return lines.slice(1).map(line=>{const v=line.split(',');return {Date:v[0],O:parseFloat(v[1]),H:parseFloat(v[2]),L:parseFloat(v[3]),C:parseFloat(v[4]),V:parseInt(v[5]),S5:v[6]?parseFloat(v[6]):null,S10:v[7]?parseFloat(v[7]):null,S20:v[8]?parseFloat(v[8]):null,S60:v[9]?parseFloat(v[9]):null};});}
function activeConds(d:Row[],i:number,volAvg:number[],hi20:number[],lo20:number[]):string[]{
  const out:string[]=[];const r=d[i];
  const isDown=(k:number)=>d[k].C<d[k].O;const isUp=(k:number)=>d[k].C>d[k].O;
  if(isDown(i))out.push('음봉1');if(isDown(i)&&isDown(i-1))out.push('음봉2연속');if(isDown(i)&&isDown(i-1)&&isDown(i-2))out.push('음봉3연속');
  if(isUp(i))out.push('양봉1');if(isUp(i)&&isUp(i-1))out.push('양봉2연속');if(isUp(i)&&isUp(i-1)&&isUp(i-2))out.push('양봉3연속');
  const cdn=(k:number)=>d[k].C<d[k-1].C;const cup=(k:number)=>d[k].C>d[k-1].C;
  if(cdn(i)&&cdn(i-1))out.push('종가2연속하락');if(cdn(i)&&cdn(i-1)&&cdn(i-2))out.push('종가3연속하락');
  if(cup(i)&&cup(i-1))out.push('종가2연속상승');if(cup(i)&&cup(i-1)&&cup(i-2))out.push('종가3연속상승');
  if(r.S5&&r.S10&&d[i-1].S5&&d[i-1].S10){if(d[i-1].S5!<=d[i-1].S10!&&r.S5!>r.S10!)out.push('5_10_상향돌파');if(d[i-1].S5!>=d[i-1].S10!&&r.S5!<r.S10!)out.push('5_10_하향돌파');}
  if(r.S5&&r.S20&&d[i-1].S5&&d[i-1].S20){if(d[i-1].S5!<=d[i-1].S20!&&r.S5!>r.S20!)out.push('5_20_상향돌파');if(d[i-1].S5!>=d[i-1].S20!&&r.S5!<r.S20!)out.push('5_20_하향돌파');}
  if(r.S10&&r.S20&&d[i-1].S10&&d[i-1].S20){if(d[i-1].S10!<=d[i-1].S20!&&r.S10!>r.S20!)out.push('10_20_상향돌파');if(d[i-1].S10!>=d[i-1].S20!&&r.S10!<r.S20!)out.push('10_20_하향돌파');}
  if(r.S20)out.push(r.C>r.S20!?'20이평위':'20이평아래');if(r.S60)out.push(r.C>r.S60!?'60이평위':'60이평아래');
  const va=volAvg[i];if(r.V>va*1.5)out.push('거래량1.5배');if(r.V>va*2)out.push('거래량2배');if(r.V<va*0.5)out.push('거래량절반이하');
  const chg=(r.C-d[i-1].C)/d[i-1].C*100;if(chg>=3)out.push('당일3%상승');if(chg>=5)out.push('당일5%상승');if(chg<=-3)out.push('당일3%하락');if(chg<=-5)out.push('당일5%하락');
  const gap=(r.O-d[i-1].C)/d[i-1].C*100;if(gap>=1)out.push('갭상승1%');if(gap<=-1)out.push('갭하락1%');
  if(r.C>=hi20[i]*0.99)out.push('20일고점부근');if(r.C<=lo20[i]*1.01)out.push('20일저점부근');
  return out;
}
function run(){
  const d=load();const n=d.length;
  const volAvg:number[]=d.map((_,i)=>i<19?NaN:d.slice(i-19,i+1).reduce((a,r)=>a+r.V,0)/20);
  const hi20:number[]=d.map((_,i)=>i<19?NaN:Math.max(...d.slice(i-19,i+1).map(r=>r.H)));
  const lo20:number[]=d.map((_,i)=>i<19?NaN:Math.min(...d.slice(i-19,i+1).map(r=>r.L)));
  const start=60,end=n-1,mid=Math.floor((start+end)/2);
  function tally(from:number,to:number){const st:{[k:string]:{occ:number;up:number;g:number[]}}={};let bo=0,bu=0;for(let i=from;i<to;i++){const up=d[i+1].C>d[i].C;const gain=(d[i+1].C-d[i].C)/d[i].C*100;bo++;if(up)bu++;for(const c of activeConds(d,i,volAvg,hi20,lo20)){if(!st[c])st[c]={occ:0,up:0,g:[]};st[c].occ++;if(up)st[c].up++;st[c].g.push(gain);}}return {st,base:bu/bo*100};}
  const tr=tally(start,mid),te=tally(mid,end);
  const names=Object.keys(tr.st).filter(c=>tr.st[c]&&te.st[c]&&tr.st[c].occ>=30&&te.st[c].occ>=30);
  const N=names.length,bonf=0.05/N;
  const rows=names.map(c=>{const a=tr.st[c],b=te.st[c];const trp=a.up/a.occ*100,tep=b.up/b.occ*100,lift=tep-te.base;const gross=b.g.reduce((x,y)=>x+y,0)/b.g.length;const p0=te.base/100;const z=(tep/100-p0)/Math.sqrt(p0*(1-p0)/b.occ);const pv=1-normalCDF(z);return {c,trp,tep,lift,occT:a.occ,occV:b.occ,net:gross-COST,pv,survive:lift>0&&pv<bonf};}).sort((x,y)=>y.tep-x.tep);
  const survivors=rows.filter(r=>r.survive);
  // 콘솔
  console.log(`\n학습 ${d[start].Date}~${d[mid-1].Date} (기준선 ${tr.base.toFixed(1)}%) | 검증 ${d[mid].Date}~${d[end-1].Date} (기준선 ${te.base.toFixed(1)}%)`);
  console.log(`테스트 ${N}개 | 본페로니 기준 p<${bonf.toFixed(4)}\n`);
  console.log(`★ 살아남은 후보: ${survivors.length}개`);
  survivors.forEach(s=>console.log(`   - ${DESC[s.c]||s.c}: 검증 ${s.tep.toFixed(1)}% (lift +${s.lift.toFixed(1)}%p, ${s.occV}회, p=${s.pv.toFixed(4)})`));
  // 파일
  let md=`# TSLA 조사 후보 OOS 필터 결과 (${new Date().toISOString().split('T')[0]})\n\n`;
  md+=`## 방법\n- 전체기간을 앞(학습)/뒤(검증)로 반 분할\n- 학습에서 보던 조건을 처음 보는 검증구간에서 재측정\n- 통과기준: 검증 상승확률>기준선 AND 본페로니 보정 p<${bonf.toFixed(4)}\n- 검증구간 기준선: ${te.base.toFixed(1)}% / 거래비용 가정 왕복 ${COST}%\n\n`;
  md+=`## ★ 살아남은 후보 (실거래 검증 대상) — ${survivors.length}개\n`;
  if(survivors.length===0){md+=`\n없음. 31개 후보 중 검증을 통과한 것이 없습니다.\n`;}
  else{md+=`\n| 조건 | 검증 적중률 | 기준선대비 | 검증발생 | 비용차감수익 | p값 |\n|---|---|---|---|---|---|\n`;survivors.forEach(s=>{md+=`| ${DESC[s.c]||s.c} | ${s.tep.toFixed(1)}% | +${s.lift.toFixed(1)}%p | ${s.occV}회 | ${s.net.toFixed(2)}% | ${s.pv.toFixed(4)} |\n`;});}
  md+=`\n## 전체 평가 (참고용 ${N}개)\n\n| 조건 | 학습적중 | 검증적중 | lift | 검증발생 | p값 | 판정 |\n|---|---|---|---|---|---|---|\n`;
  rows.forEach(r=>{md+=`| ${DESC[r.c]||r.c} | ${r.trp.toFixed(1)}% | ${r.tep.toFixed(1)}% | ${r.lift>=0?'+':''}${r.lift.toFixed(1)}%p | ${r.occV}회 | ${r.pv.toFixed(4)} | ${r.survive?'✅통과':'❌탈락'} |\n`;});
  const out=path.join(process.cwd(),'reports','tsla-candidates-oos.md');
  fs.writeFileSync(out,md,'utf-8');
  console.log(`\n파일 저장: ${out}`);
}
run();
