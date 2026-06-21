import * as fs from 'fs';
import * as path from 'path';
interface Row { Date:string; O:number; H:number; L:number; C:number; V:number; S5:number|null; S10:number|null; S20:number|null; S60:number|null; }
function load():Row[]{const csv=path.join(process.cwd(),'data','tsla_data.csv');const lines=fs.readFileSync(csv,'utf-8').split('\n').filter(l=>l.trim());return lines.slice(1).map(line=>{const v=line.split(',');return {Date:v[0],O:parseFloat(v[1]),H:parseFloat(v[2]),L:parseFloat(v[3]),C:parseFloat(v[4]),V:parseInt(v[5]),S5:v[6]?parseFloat(v[6]):null,S10:v[7]?parseFloat(v[7]):null,S20:v[8]?parseFloat(v[8]):null,S60:v[9]?parseFloat(v[9]):null};});}
function run(){
  const d=load();const n=d.length;
  const volAvg:number[]=d.map((_,i)=>i<19?NaN:d.slice(i-19,i+1).reduce((a,r)=>a+r.V,0)/20);
  const hi20:number[]=d.map((_,i)=>i<19?NaN:Math.max(...d.slice(i-19,i+1).map(r=>r.H)));
  const lo20:number[]=d.map((_,i)=>i<19?NaN:Math.min(...d.slice(i-19,i+1).map(r=>r.L)));
  const hi50:number[]=d.map((_,i)=>i<49?NaN:Math.max(...d.slice(i-49,i+1).map(r=>r.H)));
  const lo50:number[]=d.map((_,i)=>i<49?NaN:Math.min(...d.slice(i-49,i+1).map(r=>r.L)));
  const rsi:number[]=new Array(n).fill(NaN);
  for(let i=14;i<n;i++){let g=0,l=0;for(let k=i-13;k<=i;k++){const ch=d[k].C-d[k-1].C;if(ch>0)g+=ch;else l+=-ch;}const ag=g/14,al=l/14;rsi[i]=al===0?100:100-100/(1+ag/al);}
  function conds(i:number):string[]{
    const o:string[]=[];const r=d[i];
    const dn=(k:number)=>d[k].C<d[k].O,up=(k:number)=>d[k].C>d[k].O;
    if(dn(i))o.push('음봉1');if(dn(i)&&dn(i-1))o.push('음봉2');if(dn(i)&&dn(i-1)&&dn(i-2))o.push('음봉3');if(dn(i)&&dn(i-1)&&dn(i-2)&&dn(i-3))o.push('음봉4');
    if(up(i))o.push('양봉1');if(up(i)&&up(i-1))o.push('양봉2');if(up(i)&&up(i-1)&&up(i-2))o.push('양봉3');if(up(i)&&up(i-1)&&up(i-2)&&up(i-3))o.push('양봉4');
    const cd=(k:number)=>d[k].C<d[k-1].C,cu=(k:number)=>d[k].C>d[k-1].C;
    if(cd(i)&&cd(i-1))o.push('종가하락2');if(cd(i)&&cd(i-1)&&cd(i-2))o.push('종가하락3');if(cd(i)&&cd(i-1)&&cd(i-2)&&cd(i-3))o.push('종가하락4');
    if(cu(i)&&cu(i-1))o.push('종가상승2');if(cu(i)&&cu(i-1)&&cu(i-2))o.push('종가상승3');
    if(d[i].S5&&d[i].S10&&d[i-1].S5&&d[i-1].S10){if(d[i-1].S5!<=d[i-1].S10!&&d[i].S5!>d[i].S10!)o.push('5_10상향');if(d[i-1].S5!>=d[i-1].S10!&&d[i].S5!<d[i].S10!)o.push('5_10하향');}
    if(d[i].S5&&d[i].S20&&d[i-1].S5&&d[i-1].S20){if(d[i-1].S5!<=d[i-1].S20!&&d[i].S5!>d[i].S20!)o.push('5_20상향');if(d[i-1].S5!>=d[i-1].S20!&&d[i].S5!<d[i].S20!)o.push('5_20하향');}
    if(d[i].S10&&d[i].S20&&d[i-1].S10&&d[i-1].S20){if(d[i-1].S10!<=d[i-1].S20!&&d[i].S10!>d[i].S20!)o.push('10_20상향');if(d[i-1].S10!>=d[i-1].S20!&&d[i].S10!<d[i].S20!)o.push('10_20하향');}
    if(r.S20){o.push(r.C>r.S20!?'20위':'20아래');const gap=(r.C-r.S20!)/r.S20!*100;if(gap>=5)o.push('이격+5');if(gap>=10)o.push('이격+10');if(gap<=-5)o.push('이격-5');if(gap<=-10)o.push('이격-10');}
    if(r.S60)o.push(r.C>r.S60!?'60위':'60아래');
    const rs=rsi[i];if(!isNaN(rs)){if(rs<30)o.push('RSI과매도30');if(rs<20)o.push('RSI과매도20');if(rs>70)o.push('RSI과매수70');if(rs>80)o.push('RSI과매수80');}
    const va=volAvg[i];if(r.V>va*1.5)o.push('거래량1.5');if(r.V>va*2)o.push('거래량2');if(r.V>va*3)o.push('거래량3');if(r.V<va*0.5)o.push('거래량절반');
    const chg=(r.C-d[i-1].C)/d[i-1].C*100;if(chg>=3)o.push('3%상승');if(chg>=5)o.push('5%상승');if(chg>=7)o.push('7%상승');if(chg<=-3)o.push('3%하락');if(chg<=-5)o.push('5%하락');if(chg<=-7)o.push('7%하락');
    const gp=(r.O-d[i-1].C)/d[i-1].C*100;if(gp>=1)o.push('갭상승1');if(gp>=2)o.push('갭상승2');if(gp<=-1)o.push('갭하락1');if(gp<=-2)o.push('갭하락2');
    const r3=(r.C-d[i-3].C)/d[i-3].C*100;if(r3<=-10)o.push('3일-10%');if(r3>=10)o.push('3일+10%');
    const r5=(r.C-d[i-5].C)/d[i-5].C*100;if(r5<=-15)o.push('5일-15%');if(r5>=15)o.push('5일+15%');
    const r10=(r.C-d[i-10].C)/d[i-10].C*100;if(r10<=-20)o.push('10일-20%');if(r10>=20)o.push('10일+20%');
    const rng=(r.H-r.L)/r.C*100;if(rng>=5)o.push('고변동5');if(rng>=8)o.push('고변동8');
    if(r.C>=hi20[i]*0.99)o.push('20고점');if(r.C<=lo20[i]*1.01)o.push('20저점');
    if(r.C>=hi50[i]*0.99)o.push('50고점');if(r.C<=lo50[i]*1.01)o.push('50저점');
    return o;
  }
  const st:{[k:string]:{occ:number;up:number;sg:number}}={};let bo=0,bu=0;
  const start=60,end=n-1;
  for(let i=start;i<end;i++){const u=d[i+1].C>d[i].C;const gain=(d[i+1].C-d[i].C)/d[i].C*100;bo++;if(u)bu++;
    const a=conds(i).sort();
    for(let x=0;x<a.length;x++){const k1=a[x];if(!st[k1])st[k1]={occ:0,up:0,sg:0};st[k1].occ++;if(u)st[k1].up++;st[k1].sg+=gain;
      for(let y=x+1;y<a.length;y++){const k2=a[x]+' + '+a[y];if(!st[k2])st[k2]={occ:0,up:0,sg:0};st[k2].occ++;if(u)st[k2].up++;st[k2].sg+=gain;
        for(let z=y+1;z<a.length;z++){const k3=a[x]+' + '+a[y]+' + '+a[z];if(!st[k3])st[k3]={occ:0,up:0,sg:0};st[k3].occ++;if(u)st[k3].up++;st[k3].sg+=gain;}}}}
  const base=bu/bo*100;
  const rows=Object.entries(st).filter(([_,s])=>s.occ>=30).map(([c,s])=>({c,prob:s.up/s.occ*100,occ:s.occ,lift:s.up/s.occ*100-base,avg:s.sg/s.occ})).sort((a,b)=>b.prob-a.prob);
  console.log(`\n전체기간 ${d[start].Date} ~ ${d[end-1].Date}`);
  console.log(`기준선(무조건 다음날 상승): ${base.toFixed(1)}%`);
  console.log(`발생 30회 이상 후보(단독+2·3조합): ${rows.length}개\n`);
  console.log('상승확률 TOP 40:');
  rows.slice(0,40).forEach((r,i)=>console.log(`${String(i+1).padStart(2)}. ${r.prob.toFixed(1)}%  발생${r.occ}회  (기준대비 ${r.lift>=0?'+':''}${r.lift.toFixed(1)}%p)  ${r.c}`));
  let csv='﻿조건,다음날상승확률(%),발생횟수,기준선대비(%p),평균수익(%)\n';
  rows.forEach(r=>{csv+=`"${r.c}",${r.prob.toFixed(1)},${r.occ},${r.lift.toFixed(1)},${r.avg.toFixed(2)}\n`;});
  const out=path.join(process.cwd(),'reports','tsla-candidates-full.csv');
  fs.writeFileSync(out,csv,'utf-8');
  console.log(`\n전체 ${rows.length}개 저장(엑셀에서 정렬·필터 가능): ${out}`);
}
run();
